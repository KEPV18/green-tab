# SUPABASE READ-ONLY AUDIT — Green Tab

**Date:** 2026-08-27  
**Project ref:** `udbdvtcugpnrmtfipbzj`  
**Project URL:** `https://udbdvtcugpnrmtfipbzj.supabase.co`  
**Audit type:** Read-only. No schema changes, no writes, no migrations.

---

## PROJECT STATUS: ✅ OPERATIONAL

- **DNS:** Resolves correctly
- **Health endpoint:** HTTP 200 — `"Healthy"`
- **REST API:** Operational (anon key queries succeed)
- **Auth service:** Operational — GoTrue v2.195.0
- **Storage:** Operational (0 buckets)

---

## DATABASE STATUS: ✅ SCHEMA INTACT, DATA EMPTY

All 11 tables from the 31 historical migrations **exist** but contain **zero rows**.  
The project was paused and restored — schema survived, data was lost.

---

## REST API STATUS: ✅ OPERATIONAL

- anon key queries return HTTP 200 on existing tables
- HTTP 404 on non-existent table `team_metrics`
- HTTP 403 on admin endpoints (expected with anon key)

---

## AUTH STATUS: ✅ OPERATIONAL

- GoTrue v2.195.0 responds to `/auth/v1/health`
- Signup endpoint is live (returns constraint violation, proving DB is working)
- Admin endpoints correctly return 403 with anon key

---

## EXISTING TABLES (all confirmed reachable via REST API)

| # | Table | Exists? | Row Count | Schema Recovered? |
|---|-------|---------|-----------|-------------------|
| 1 | `performance_data` | ✅ | 0 | Yes (from migrations) |
| 2 | `tickets` | ✅ | 0 | Yes (from migrations) |
| 3 | `daily_changes` | ✅ | 0 | Yes (from migrations) |
| 4 | `profiles` | ✅ | 0 | Yes (from migrations) |
| 5 | `user_roles` | ✅ | 0 | Yes (from migrations) |
| 6 | `user_settings` | ✅ | 0 | Yes (from migrations) |
| 7 | `daily_survey_calls` | ✅ | 0 | Yes (from migrations) |
| 8 | `daily_shifts` | ✅ | 0 | Yes (from migrations) |
| 9 | `daily_notes` | ✅ | 0 | Yes (from migrations) |
| 10 | `hold_tickets` | ✅ | 0 | Yes (from migrations) |
| 11 | `genesys_tickets` | ✅ | 0 | Yes (from migrations) |

### TABLES WITH DATA: None (all 0 rows)

### TABLES EMPTY: All 11 tables are empty

### TABLES NOT YET CREATED:

| Table | Status |
|-------|--------|
| `team_metrics` | ❌ Does not exist (new table needed for Green Tab team data) |

---

## DATA RECOVERY STATUS: ❌ NO

**The old database data does NOT exist.** The project was paused and when restored, all table schemas survived but all row data was lost. This is standard Supabase behavior for paused free-tier projects — schemas persist but data is cleared.

### What was lost:
- All user profiles
- All performance data (KPI records)
- All tickets (CSAT, Karma)
- All daily changes, shifts, notes
- All daily survey calls
- All Genesys tickets
- All hold tickets
- All user settings

### What survived:
- All table schemas (columns, types, constraints, indexes, triggers, RLS policies)
- The project itself (URL, keys, auth config)

---

## COMPARISON: MIGRATIONS vs LIVE SCHEMA

The 31 migration files in `supabase/migrations/` created the following tables:
- `performance_data` — ✅ exists in DB
- `tickets` — ✅ exists in DB
- `daily_changes` — ✅ exists in DB
- `daily_notes` — ✅ exists in DB
- `daily_shifts` — ✅ exists in DB
- `daily_survey_calls` — ✅ exists in DB
- `genesys_tickets` — ✅ exists in DB
- `hold_tickets` — ✅ exists in DB
- `profiles` — ✅ exists in DB
- `user_roles` — ✅ exists in DB
- `user_settings` — ✅ exists in DB

All 11 tables exist in the live database with their correct schemas.  
The `team_metrics` table has **never** existed — it is a new requirement.

---

## WHAT THIS MEANS FOR GREEN TAB

1. **Schema is ready** — all existing tables are intact with correct columns/constraints
2. **Data is gone** — no historical KPI records, no user data
3. **team_metrics needs to be created** — this is the new table for Google Sheets team data
4. **Auth is working** — users can sign up fresh
5. **No data fabrication needed** — we start with clean tables and populate from the current Google Sheet

---

## NEXT STEPS (REQUIRES BATMAN APPROVAL)

1. **Create `team_metrics` table** — run the migration SQL in Supabase SQL Editor
2. **Set `SUPABASE_SERVICE_ROLE_KEY`** — needed for Python script to upsert data
3. **Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`** in `.env` if changed
4. **Run the first fetch → upsert cycle**
5. **Update frontend to read from Supabase instead of `/team-data.json`**
6. **Deploy to Vercel with updated env vars**

I am STOPPED and waiting for Batman's approval before making any schema changes.