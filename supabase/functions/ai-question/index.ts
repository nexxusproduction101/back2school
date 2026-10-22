// Supabase Edge Function: writes one school question with Claude. Keeps your API key private.
// Deploy: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   then   supabase functions deploy ai-question
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { prompt } = await req.json();
    if (typeof prompt !== "string" || prompt.length > 2000) throw new Error("bad prompt");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    const text = (j.content || []).map((c: any) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json in reply");
    return new Response(m[0], { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, "content-type": "application/json" } });
  }
});
