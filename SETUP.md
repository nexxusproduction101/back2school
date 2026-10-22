# School Quest — free deployment guide (Cloudflare Pages + Supabase Free)

Total cost to start: **US$0**. Works for a pilot with one school. Upgrade later (see the end).

## What you need
- A free **Supabase** account (supabase.com)
- A free **Cloudflare** account (cloudflare.com)
- Optional, only for AI-written questions: an **Anthropic API key** (console.anthropic.com, pay-as-you-go) and the Supabase CLI

## Step 1 — Create the Supabase project
1. New project → choose a region close to Malaysia (e.g. Singapore) → set a database password and save it.
2. **Project Settings → API**: copy the **Project URL** and the **anon public key**.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled and **turn OFF "Confirm email"**
   (students don’t need a real email: the game signs them in as `username@schoolquest.app`).
4. **Authentication → Sign In / Providers**: set the minimum password length to 8.

## Step 2 — Create the database
1. **SQL Editor → New query** → paste all of `supabase/schema.sql` → Run.
2. New query → paste all of `supabase/seed.sql` → Run.
   (This loads levels, subjects, syllabus, objectives, question types, performance levels, the question bank,
   the demo sessions, and two institutions: SMK Sultan Yussuf and SK Taman Petaling.)

## Step 3 — Connect the game
Open `config.js` and paste your Project URL and anon public key. (The anon key is meant to be public;
the database rules in schema.sql protect the data.)

## Step 4 — Put it online (Cloudflare Pages)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets**.
2. Name the project, then upload the files in this folder: `index.html`, `config.js`, `backend.js`
   (the `supabase` folder is NOT uploaded; it is only for Supabase).
3. Deploy. You get a `https://your-name.pages.dev` address. Add your own domain later under **Custom domains**.

## Step 5 — Create your first accounts
Open your site and register through **Create an account**:
1. Register yourself as a student, e.g. username `admin`. Then in **SQL Editor** run:
   `update profiles set role = 'developer' where username = 'admin';`
   (Developers see the Developer Database screen and can join every session.)
2. Register `syahir94` and `mafatin94` as students of SMK Sultan Yussuf, then run:
   `update profiles set all_access = true where username in ('syahir94','mafatin94');`
3. Register a test teacher and a test student of any institution, and try the whole flow.

## Step 6 — (Optional) AI-written questions
Only needed for subjects whose question bank is empty.
```
npm i -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai-question --project-ref YOUR-PROJECT-REF
```
Without this step the game still works; those objectives just have no questions.

## Test checklist
- Register institution → student → teacher; log in as each.
- Student: join a session in their own class; the demo accounts can join any.
- Teacher: create a Latih Tubi session; student logs in and joins it.
- Two students in the same session never see the same question.
- Two browsers: both students see each other walking and can chat.

## Things to know on the free plan
- Supabase Free projects **pause after a week of inactivity** (e.g. school holidays). Resume from the dashboard, or move to Pro.
- Free limits (database size, file storage, bandwidth, realtime connections) are small: fine for one school pilot.
  Teaching videos use file storage quickly; check the usage page.
- Checked prices change: confirm on supabase.com/pricing and cloudflare.com before presenting costs.

## Before real students use it (not optional)
- Teachers and institutions self-register, so a student could register as a teacher. Add an approval step before production.
- Privacy policy and parent/school consent (PDPA); moderate or limit chat for minors.
- Rate-limit the `ai-question` function so one user can’t run up your API bill.
- This package was prepared without a live Supabase project, so expect to fix small things on first run.
  Send me any error message and I’ll fix it.

## Upgrading when the institution pays
Supabase Pro (about US$25/month) removes the pause and raises limits. No code changes are needed.
