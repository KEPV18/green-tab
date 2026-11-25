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

## Required private configuration

- `wfm-sync` edge function: set the `WFM_BASE_URL` function secret to your own workforce-management system URL. The function returns an error if it is not set.
- `EXCLUDED_FROM_CHAT_TEAM` in `src/lib/googleSheets.ts` is an empty list in this public copy. Add the agents you want excluded from team ranking, otherwise everyone is counted. The original private version had entries here, so this copy does not behave identically to it.
- You need your own data source. The bundled sample data was removed and no demo dataset is included yet.

## Notes

- Built with AI assistance, then reviewed and adjusted by me.
- This was a work-related internal tool. Only generic code is kept public.
- It has not been security audited, and no live deployment is linked from this repo.
