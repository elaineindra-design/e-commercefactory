# Production COGS Tracker

Next.js production-request and COGS tracker for a Requester and Factory workflow.

## Roles

- **Requester**: enters name + password, creates/deletes production requests, edits SKU details and estimated COGS.
- **Factory**: enters name only, updates production status and actual COGS.
- Both roles can view estimates, actuals, variance, totals and export CSV.

The starter requester password is `requester123`. Override it with `REQUESTER_PASSWORD` in Vercel.

## Shared data

The app uses Supabase as the shared source of truth so Requester and Factory can work on the same production records across different devices. The browser polls the shared API about every 2 seconds and automatically applies remote changes when the user is not actively editing.

Set this server-only variable in Vercel:

- `SUPABASE_SECRET_KEY` — use a Supabase secret key (`sb_secret_...`) from Project Settings → API Keys.

The Supabase project URL is already configured as a server-side fallback. You may optionally set `SUPABASE_URL=https://clajgzxalhjrtjfccohn.supabase.co`.

The `public.cogs_shared_state` table has Row Level Security enabled and browser roles have no direct table privileges. The secret key must never be exposed as a `NEXT_PUBLIC_` variable.

If Supabase is not configured, the app can still use the older Upstash Redis variables or browser localStorage as a last-resort demo mode.

## Authentication environment variables

- `REQUESTER_PASSWORD` — defaults to `requester123`
- `SESSION_SECRET` — use a long random value in production

Factory login intentionally has no password in this first version, per the initial requirement.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Deploy on Vercel

1. Import this GitHub repository into Vercel.
2. Framework preset: **Next.js**.
3. Add `REQUESTER_PASSWORD` and `SESSION_SECRET` in Project Settings → Environment Variables.
4. Add `SUPABASE_SECRET_KEY` using the server-only secret key from Supabase Project Settings → API Keys.
5. Redeploy after adding the variable. The top bar should change from **Local only** to **Live sync**.

## Permission enforcement

Permissions are enforced in both the UI and the `/api/data` server route:

- Requester updates preserve factory-entered actual COGS and factory-controlled status.
- Factory updates preserve requester-owned request structure, SKU details and estimates.
- The signed role is stored in an HTTP-only signed cookie.

This is intentionally simple access control for an internal workflow, not enterprise identity/authentication.
