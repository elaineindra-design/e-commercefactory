# Production COGS Tracker

Next.js production-request and COGS tracker for a Requester and Factory workflow.

## Roles

- **Requester**: enters name + password, creates/deletes production requests, edits SKU details and estimated COGS.
- **Factory**: enters name only, updates production status and actual COGS.
- Both roles can view estimates, actuals, variance, totals and export CSV.

The starter requester password is `requester123`. Override it with `REQUESTER_PASSWORD` in Vercel.

## Shared data

The app supports Upstash Redis using REST environment variables. This is the recommended Vercel setup because requester and factory need to see the same records.

Set either:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

or the Vercel/Upstash aliases:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

If Redis is not configured, the app automatically falls back to browser localStorage and displays a warning. Local mode is useful for testing but is **not shared across devices**.

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
4. Add an Upstash Redis integration/store and make sure its REST URL/token variables are available to the project.
5. Redeploy after adding variables.

## Permission enforcement

Permissions are enforced in both the UI and the `/api/data` server route:

- Requester updates preserve factory-entered actual COGS and factory-controlled status.
- Factory updates preserve requester-owned request structure, SKU details and estimates.
- The signed role is stored in an HTTP-only signed cookie.

This is intentionally simple access control for an internal workflow, not enterprise identity/authentication.
