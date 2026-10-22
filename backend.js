// Adapter: gives the game the same db / room / user / assets / sample calls, backed by Supabase.
(function () {
  const cfg = window.SQ_CONFIG || {};
  const SB = supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  window.SB = SB;
  let role = '';
  async function who() {
    const { data } = await SB.auth.getUser(); const u = data && data.user; if (!u) { role = ''; return null; }
    const { data: p } = await SB.from('profiles').select('role').eq('uid', u.id).maybeSingle(); role = p ? p.role : ''; return u;
  }
  const clean = v => JSON.parse(JSON.stringify(v));
  function docRef(path) {
    const i = path.indexOf('/'), c = path.slice(0, i), id = path.slice(i + 1);
    return {
      async get() { const { data, error } = await SB.from('docs').select('data').eq('collection', c).eq('id', id).maybeSingle(); if (error) throw error; return { exists: !!data, data: () => data ? data.data : undefined }; },
      async set(v) { const { error } = await SB.from('docs').upsert({ collection: c, id, data: clean(v), updated_at: new Date().toISOString() }); if (error) throw error; },
      async update(v) {
        const cur = (await this.get()).data() || {}, m = Object.assign({}, cur);
        for (const k in v) m[k] = (v[k] && typeof v[k] == 'object' && !Array.isArray(v[k]) && cur[k] && typeof cur[k] == 'object') ? Object.assign({}, cur[k], v[k]) : v[k];
        await this.set(m);
      },
      async acquire(o) { const { data, error } = await SB.rpc('acquire_lease', { p_path: path, p_holder: String(o.holder), p_ttl: o.ttlMs || 8000 }); if (error) throw error; return { acquired: !!data }; }
    };
  }
  function coll(c, f) {
    return {
      where(k, op, v) { return coll(c, f.concat([[k, v]])); },
      async get() {
        let r = SB.from('docs').select('id,data').eq('collection', c); f.forEach(([k, v]) => r = r.eq('data->>' + k, String(v)));
        const { data, error } = await r.limit(1000); if (error) throw error; return { docs: (data || []).map(d => ({ id: d.id, data: () => d.data })) };
      }
    };
  }
  const dbApi = { doc: docRef, collection: c => coll(c, []) };
  const userApi = { isOwner: () => role == 'developer', canEdit: () => role == 'developer', id: async () => { const u = await who(); return u ? u.id : ''; } };
  const roomApi = {
    async join(name) {
      const key = Math.random().toString(36).slice(2) + Date.now().toString(36), cur = {}, pcb = [], topics = {};
      const ch = SB.channel('room:' + name, { config: { presence: { key }, broadcast: { self: false } } });
      const peers = () => { const st = ch.presenceState(), a = []; Object.keys(st).forEach(k => { const e = st[k][0]; if (e) a.push({ peer: k, isMe: k == key, kind: 'viewer', presence: e }); }); return a; };
      ch.on('presence', { event: 'sync' }, () => pcb.forEach(f => f(peers())));
      ch.on('broadcast', { event: '*' }, m => (topics[m.event] || []).forEach(f => f({ data: m.payload && m.payload.data, peer: m.payload && m.payload.peer, sameTab: false })));
      await new Promise(res => ch.subscribe(s => { if (s == 'SUBSCRIBED') res(); }));
      await ch.track(cur);
      const off = (arr, f) => () => { const i = arr.indexOf(f); if (i >= 0) arr.splice(i, 1); };
      return {
        peers,
        onPeers(f) { pcb.push(f); return off(pcb, f); },
        on(t, f) { (topics[t] = topics[t] || []).push(f); return off(topics[t], f); },
        async emit(t, d) { await ch.send({ type: 'broadcast', event: t, payload: { data: d, peer: key } }); },
        presence(p) { Object.assign(cur, p); return ch.track(cur); },
        async leave() { await SB.removeChannel(ch); }
      };
    }
  };
  const assetsApi = {
    async upload(file) {
      const u = await who(); if (!u) throw new Error('not signed in');
      const path = u.id + '/' + Date.now() + '-' + file.name.replace(/[^\w.]/g, '_');
      const { error } = await SB.storage.from('videos').upload(path, file, { contentType: file.type }); if (error) throw error;
      return { url: SB.storage.from('videos').getPublicUrl(path).data.publicUrl };
    }
  };
  const sampleApi = { async json(prompt) { const { data, error } = await SB.functions.invoke('ai-question', { body: { prompt } }); if (error) throw error; return data; } };
  window.claude = { use: async n => { if (n == 'user') { await who(); return userApi; } return ({ db: dbApi, room: roomApi, assets: assetsApi, sample: sampleApi })[n] || null; } };
})();
