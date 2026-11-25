# Green Tab

A team performance dashboard built with React and TypeScript. It shows agent and team metrics, a team-leader view and a work-schedule view, backed by Supabase.

This public copy contains no real team data. Data files, employee details and credentials were removed, and the app needs your own Supabase project and data source to show anything.

## Screens

- Sign in (Supabase Auth)
- Main dashboard with charts for team and agent metrics
- Team leader dashboard
- Work schedule
- Settings

## Stack

- React 18, TypeScript, Vite
- Tailwind CSS and shadcn/ui components
- Supabase (database and auth), TanStack Query
- Recharts for charts
- Deployed on Vercel (`vercel.json`)

## Run it locally

1. Install dependencies with `npm install`.
2. Create a `.env` file with your own values: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is a public client key, so protect your data with row level security.
3. Start the dev server with `npm run dev`.

Scripts in `scripts/` fetch metrics and upsert them into Supabase. They read the service key from the `SUPABASE_SERVICE_ROLE_KEY` environment variable. Never commit that key.

## Notes

- Built with AI assistance, then reviewed and adjusted by me.
- This was a work-related internal tool. Only generic code is kept public.
- It has not been security audited, and no live deployment is linked from this repo.
