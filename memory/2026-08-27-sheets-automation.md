# Google Sheets Automation — Implementation Complete (2026-08-27)

## Architecture

Three-file Python pipeline:

1. **`scripts/sheet_extractor.py`** — Browser automation via Playwright
   - Uses persistent Chromium profile (`~/.config/green-tab/browser-profile/`)
   - NEVER accesses auth cookies/tokens — only operates browser UI
   - Priority 1: CSV download via `expect_download` (handles "Download is starting" correctly)
   - Priority 2: Clipboard extraction (Ctrl+A → Ctrl+C)
   - Tab selection: enumerates `.docs-sheet-tab-name` elements, clicks "Team Scores"
   - Auth expiry detection: stops if Google shows login page, reports clearly
   - Screenshot on failure for debugging (`/tmp/green-tab-screenshots/`)
   - Clean lock file management: removes stale locks only, never kills unrelated processes

2. **`scripts/sheet_parser.py`** — Standalone TSV/CSV parser & validator
   - No browser/network dependency
   - Parses both CSV (from download) and TSV (from clipboard)
   - Validates: checks for login page contamination, wrong tab (Bamboo ID), missing columns, empty data
   - Extracts proper display names from Bamboo ID section (ID_Name column)
   - Handles two table sections: Table 1 (CSAT/Productivity/FCR) and Table 2 (AHT)
   - Month label detection from both "August 2026" and "01/08/26" formats
   - Floor average calculation from actual member data
   - Clean name derivation: strips trailing numbers, uses ID_Name mapping

3. **`scripts/fetch_team_data.py`** — Main orchestrator
   - `--login` mode: opens browser for one-time manual Google sign-in
   - Normal mode: headless extraction with saved profile
   - `--csv FILE` / `--tsv FILE` mode: parse local files (for testing)
   - `--test` mode: print data without saving
   - `--verbose` mode: detailed logs
   - Month label extraction from sheet title (e.g., "Aug - 26" → "August 2026")
   - Execution reports saved to `logs/fetch-TIMESTAMP.json`
   - Backups saved to `public/team-data-TIMESTAMP.json`

## Key Discoveries

- **gid=87009911** is the "Team Scores" tab (NOT "Bamboo ID" despite the tab label)
  - The first section contains Bamboo ID data (columns: Bamboo ID, Queue, Email, ID_Name, Batch, Citrix user)
  - The second section contains per-agent metrics (CSAT%, Productivity, FCR, etc.)
  - The third section contains AHT data (but AHT values are currently EMPTY in the sheet)
- **CSV download works with `expect_download`**: The `Page.goto` raises "Download is starting" which is intercepted by `expect_download` context manager. Must catch this exception separately from real errors.
- **Clipboard extraction copies wrong tab**: Ctrl+A after tab switch may still copy stale data. CSV download is more reliable.
- **Month from title**: The sheet title is "Aug - 26 - Google Sheets", not from the CSV content itself. The extractor captures `page.title()` and passes it to the parser.
- **Name mapping**: The "ID_Name" column in the Bamboo ID section provides proper display names (e.g., "Ahmed Ali" vs "Ahmed Gelal" from email derivation).

## Sheet Structure (Tab 0 — "Team Scores", gid=87009911)

```
Row 0:  Bamboo ID | Queue | Email | ID_Name | Batch | Citrix user | ... | Karma | Meta
Row 1-13: Agent data (Bamboo ID section)
Row 14: blank separator
Row 15: [Floor averages: 90%, 6%, 92%, ...]
Row 16: blank  
Row 17: Agent's Email | CSAT | CSAT | Productivity 8-hrs | Escalation % | Adherence % | Avg basket time | IRT | FCR % | Closed after resolution %
Row 18+: Per-agent CSAT/Productivity/FCR data
Last row: "Team Score" (floor averages)
Row 31: Agent's Email | Tardy | Break Exceed | Idle Time | Genesys Inbound AHT+ACW | De-escalation % | Occupancy % | Avg group basket | Closed tickets %
Row 32+: Per-agent AHT data (currently EMPTY for all agents)
```

## Data Flow

```
Google Sheet (restricted, work account only)
    ↓ (Playwright + persistent Chromium profile)
sheet_extractor.py — CSV download or clipboard
    ↓ (raw CSV/TSV text)
sheet_parser.py — validate + parse + compute floor averages
    ↓ (team data dict)
fetch_team_data.py — save to public/team-data.json
    ↓ (Vite build includes in dist/)
googleSheets.ts — reads /team-data.json with 4-hour cache
    ↓
TeamLeaderDashboard.tsx — displays metrics vs floor averages
```

## Running

```bash
# First-time login (opens browser window):
python3 scripts/fetch_team_data.py --login

# Daily cron (headless, uses saved profile):
python3 scripts/fetch_team_data.py

# Test with local CSV:
python3 scripts/fetch_team_data.py --csv /tmp/export.csv --test

# Cron job (8 AM daily):
0 8 * * * /mnt/ahmed/Projects/green-tab/scripts/daily-fetch.sh >> /tmp/green-tab-fetch.log 2>&1
```

## Constraints

- Google Sheet is restricted to work account only — no API key available
- User's work Google account must NOT have repeated auto-login attempts (account will be locked)
- Browser profile at `~/.config/green-tab/browser-profile/` must be preserved
- Never access, decrypt, or export authentication cookies or tokens
- Session expiry: stop automation and report; user must re-run `--login` manually
- AHT data is currently empty in the sheet; `aht` values in output are `null`

## Commit

- `b96b831` — feat(sheets): implement automated Google Sheets extraction pipeline