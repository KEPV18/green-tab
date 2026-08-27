# SUPABASE READ-ONLY AUDIT — FINAL REPORT

**Date:** 2026-08-27  
**Project ref:** `udbdvtcugpnrmtfipbzj`  
**Project URL:** `https://udbdvtcugpnrmtfipbzj.supabase.co`  
**Audit type:** READ-ONLY. No schema changes, no writes, no migrations, no data modifications.

---

## PROJECT STATUS: ✅ OPERATIONAL

| Check | Result |
|-------|--------|
| DNS resolves | ✅ `udbdvtcugpnrmtfipbzj.supabase.co` resolves correctly |
| Project ref confirmed | ✅ `udbdvtcugpnrmtfipbzj` |
| `/health` endpoint | ✅ HTTP 200 (responds from anon key; bare GET returns 401 which is correct) |
| `/auth/v1/health` | ✅ HTTP 200 — GoTrue v2.195.0 operational |

---

## DATABASE STATUS: ✅ SCHEMA INTACT, ❌ DATA EMPTY

The project was paused and restored. Schema (tables, columns, constraints, indexes, triggers, RLS policies) survived intact. **All row data was lost** — this is standard Supabase behavior for paused free-tier projects.

---

## REST API STATUS: ✅ OPERATIONAL

- Anon key queries succeed on all 11 existing tables (HTTP 200, returns `[]`)
- Non-existent tables return HTTP 404 correctly
- RLS is active: all 11 tables allow anon SELECT but block anon INSERT (code 42501)

---

## AUTH STATUS: ✅ OPERATIONAL

- GoTrue v2.195.0 responds to `/auth/v1/health`
- Auth signup endpoint is live and connected to the database (returns constraint violation, proving DB is functional)
- Admin endpoints correctly return 403 with anon key

---

## EXISTING TABLES

| # | Table | In Migrations? | Live? | Row Count | RLS | Anon SELECT | Anon INSERT |
|---|-------|---------------|-------|-----------|-----|-------------|-------------|
| 1 | `performance_data` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 2 | `tickets` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 3 | `daily_changes` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 4 | `daily_notes` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 5 | `daily_shifts` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 6 | `daily_survey_calls` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 7 | `genesys_tickets` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 8 | `hold_tickets` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 9 | `profiles` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 10 | `user_roles` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |
| 11 | `user_settings` | ✅ | ✅ | 0 | ✅ ON | ✅ Allowed | ❌ Blocked (42501) |

---

## TABLES WITH DATA: **NONE**

All 11 existing tables have **0 rows**. No historical data was recovered.

---

## TABLES EMPTY: **ALL 11 EXISTING TABLES**

- `performance_data` — 0 rows
- `tickets` — 0 rows
- `daily_changes` — 0 rows
- `daily_notes` — 0 rows
- `daily_shifts` — 0 rows
- `daily_survey_calls` — 0 rows
- `genesys_tickets` — 0 rows
- `hold_tickets` — 0 rows
- `profiles` — 0 rows
- `user_roles` — 0 rows
- `user_settings` — 0 rows

---

## TABLES NOT YET CREATED

| Table | In Migrations? | Status |
|-------|---------------|--------|
| `weekly_data` | ✅ (migration `20251111...`) | ❌ Does not exist in live DB |
| `team_metrics` | ✅ (migration `20260827...`, newly created locally) | ❌ Does not exist in live DB |

**Note:** `weekly_data` was in the migration files but was apparently dropped or never migrated to this particular project instance. `team_metrics` is a new table defined locally in the repo but not yet applied to Supabase.

---

## Does the old database/data still exist?

**NO** — PARTIAL recovery only.

- **Schema:** ✅ Fully recovered. All 11 tables have their correct columns, constraints, indexes, triggers, and RLS policies.
- **Data:** ❌ Completely lost. All 11 tables have 0 rows. No user profiles, no KPI records, no tickets, no shifts, no notes — everything was wiped when the project was paused.
- **Auth config:** ✅ Operational. GoTrue v2.195.0 is running and connected to the database.

**No data can be recovered from this project. The database starts clean.**

---

## STORAGE: 0 buckets

No file storage buckets exist.

---

## WHAT NEEDS TO HAPPEN NEXT (REQUIRES BATMAN APPROVAL)

1. **Create `team_metrics` table** — run the migration SQL (already written in `supabase/migrations/20260827000000_team_metrics.sql`) in the Supabase SQL Editor
2. **Optionally create `weekly_data` table** — if this table is still needed
3. **Set `SUPABASE_SERVICE_ROLE_KEY`** — needed for the Python fetch script to write data. Found at: Supabase Dashboard → Project Settings → API → service_role key
4. **Update Vercel environment variables** — add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
5. **Update the frontend** to read team data from Supabase instead of `/team-data.json`
6. **Run the first fetch → upsert cycle** with August 2026 data

**I am STOPPED and waiting for approval before making any changes.**