# SUPABASE AUDIT REPORT — Green Tab

**Date:** 2026-08-27
**Project:** Green Tab (karma-tracker-buddy/orbit)

---

## 1. Existing Supabase Configuration

| Item | Status |
|------|--------|
| `.env` file | ✅ Exists with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| Project ref | `udbdvtcugpnrmtfipbzj` |
| Project URL | `https://udbdvtcugpnrmtfipbzj.supabase.co` |
| Anon key present | ✅ Present in `.env` |
| Service-role key | ❌ NOT present in any env file |
| `@supabase/supabase-js` | ✅ Installed in `node_modules/@supabase/supabase-js` v2.75.0 |
| Package.json dependency | ❌ NOT listed in `dependencies` or `devDependencies` |
| `src/lib/supabase.ts` | ❌ Does not exist — no client initialization file |
| Supabase client usage in src/ | ❌ Zero imports — app was fully migrated to localStorage |
| Vercel env vars | ❓ Cannot verify — `vercel login` has no token |

---

## 2. Database Connectivity Test

| Test | Result |
|------|--------|
| DNS resolution for `udbdvtcugpnrmtfipbzj.supabase.co` | ❌ **NXDOMAIN** — domain does not resolve |
| REST API health check | ❌ Connection refused |
| REST API table query | ❌ Connection refused |
| `supabase.co` base domain | ✅ Resolves |

**Conclusion: The Supabase project `udbdvtcugpnrmtfipbzj` has been deleted or paused. The domain returns NXDOMAIN. The database is completely unreachable.**

---

## 3. Existing Schema (from migrations)

The following tables existed in the old database:

| Table | Created | Notes |
|-------|---------|-------|
| `performance_data` | 2025-10-15 | KPI monthly data: year, month, good/bad counts, user_id |
| `tickets` | 2025-10-15 | CSAT/Karma tickets by channel |
| `daily_changes` | 2025-10-21 | Daily audit log |
| `genesys_tickets` | Earlier | Genesys call data |
| `hold_tickets` | Earlier | On-hold tracking |
| `daily_notes` | Earlier | Notes |
| `profiles` | 2025-12-20 | User profiles with display_name |
| `user_roles` | 2025-12-20 | Role management |
| `user_settings` | 2025-12-21 | User preferences, salary, language |
| `daily_survey_calls` | 2026-01-08 | Survey call tracking |
| `daily_shifts` | 2026-02-03 | Shift scheduling with absence types |
| `team_metrics` | ❌ Never existed | Not in any migration |

**Key finding: There is NO `team_metrics` table in any migration. The old database never had a table for team KPI data.**

---

## 4. Current Application State

The app has **fully migrated away from Supabase** for all data operations:

- `src/lib/store.ts` — All persistence uses `localStorage` with `gt_` prefix
- `src/lib/kpi.ts` — Comment: "Replaces Supabase queries with localStorage-based lookups"
- `src/lib/googleSheets.ts` — Reads team data from `/team-data.json` static file, no DB
- `src/components/schedule/WFMSyncButton.tsx` — Comment: "WFM sync is no longer available without Supabase backend"
- No Supabase client is initialized anywhere in the app

---

## 5. What Is Needed

To use Supabase as the persistent backend for team metrics, we need:

### 5a. A Supabase project (one of):
- **Option A:** Batman creates a new Supabase project and provides the URL + anon key + service-role key
- **Option B:** Batman reactivates/restores the old project (unlikely since NXDOMAIN)
- **Option C:** I create a new project via the Supabase CLI — requires Batman's Supabase account credentials

### 5b. Environment variables needed:
1. `VITE_SUPABASE_URL` — Project URL (e.g., `https://xxxx.supabase.co`)
2. `VITE_SUPABASE_ANON_KEY` — Public anon key (safe for frontend)
3. `SUPABASE_SERVICE_ROLE_KEY` — Service-role key (server-side only, for upserts from the Python script)

### 5c. Database table to create: `team_metrics`

```sql
CREATE TABLE public.team_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,           -- e.g., "2026-08" or "August 2026"
  agent_email TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  csat NUMERIC,                  -- CSAT %, NULL if missing
  productivity NUMERIC,          -- Productivity 8-hrs, NULL if missing
  fcr NUMERIC,                   -- FCR %, NULL if missing
  chat_aht NUMERIC,              -- Average Basket Time (Chat AHT), NULL if missing
  genesys_aht NUMERIC,           -- Genesys Inbound AHT + ACW (voice), NULL if missing
  chat_handling_time NUMERIC,    -- Average handling time (separate from Chat AHT)
  source TEXT NOT NULL DEFAULT 'sheet19',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month, agent_email)     -- Prevent duplicate entries
);

ALTER TABLE public.team_metrics ENABLE ROW LEVEL SECURITY;

-- Public read (frontend needs this)
CREATE POLICY "Anyone can view team metrics"
ON public.team_metrics FOR SELECT USING (true);

-- Insert/Update requires service-role key (Python script)
-- No public insert/update policy — only service-role can write
```

### 5d. Architecture flow:
```
Google Sheet → Local Playwright browser → CSV extraction
    → Python parser + validation → Supabase upsert (service-role key)
    → Green Tab frontend → Supabase read (anon key)
```

---

## 6. Blockers

| Blocker | Description |
|---------|-------------|
| **Supabase project is dead** | `udbdvtcugpnrmtfipbzj.supabase.co` returns NXDOMAIN |
| **No service-role key** | Required for Python script to upsert data |
| **No Vercel access** | Cannot verify/update Vercel environment variables |
| **No `team_metrics` table** | Never existed in any migration; must be created fresh |

---

## 7. What Batman Needs To Provide

Before I can proceed, I need Batman to:

1. **Create a new Supabase project** (or restore the old one) at https://supabase.com/dashboard
2. **Provide these values:**
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/public key (safe for frontend)
   - Service-role key (for Python script writes only)
3. **Confirm whether to create the `team_metrics` table** (I can provide the SQL once the project exists)

I will NOT:
- Create a Supabase project on Batman's behalf (requires account access)
- Print, log, or expose any secret keys
- Assume the old database still works (it doesn't — NXDOMAIN)

---

**STOP: Awaiting Batman's input on Supabase project creation before proceeding.**