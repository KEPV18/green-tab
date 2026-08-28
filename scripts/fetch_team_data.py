#!/usr/bin/env python3
"""
Green Tab — Team Data Fetcher (v2)

Fetches data from EXACTLY TWO sources in the Google Sheet:
1. Team Scores (gid=87009911) → team_metrics
2. KSCAT Calc (gid=758073782), range P1:X15 → kscat_data

NO other tabs are used. NO fallbacks. NO auto-detection of other formats.

Workflow:
    1. Start persistent Chromium profile
    2. Download CSV from Team Scores tab
    3. Download CSV from KSCAT Calc tab
    4. Parse Team Scores → team metrics
    5. Parse KSCAT Calc P1:X15 → KSCAT/Karma data
    6. Save locally (team-data.json + kscat-data.json)
    7. Upsert to Supabase (team_metrics + kscat_data)
    8. Write execution report

Usage:
  First-time login (opens browser for manual sign-in):
    python3 scripts/fetch_team_data.py --login

  Daily fetch (headless, uses saved profile):
    python3 scripts/fetch_team_data.py

  Dry-run (parse + print, no Supabase write):
    python3 scripts/fetch_team_data.py --dry-run

  Test with local CSV file:
    python3 scripts/fetch_team_data.py --csv /path/to/file.csv

CRON (daily at 8 AM):
  0 8 * * * cd /mnt/ahmed/Projects/green-tab && python3 scripts/fetch_team_data.py >> /tmp/green-tab-fetch.log 2>&1
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Add scripts dir to path for imports ────────────────────────────────────────
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from sheet_parser import parse_team_scores, parse_kscat_calc, parse_csv, ValidationError
from sheet_extractor import SheetExtractor, interactive_login, ExtractionResult

# ── Config ──────────────────────────────────────────────────────────────────────

PROJECT_DIR = SCRIPTS_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "public"
TEAM_DATA_FILE = OUTPUT_DIR / "team-data.json"
KSCAT_DATA_FILE = OUTPUT_DIR / "kscat-data.json"
LOGS_DIR = PROJECT_DIR / "logs"
PROFILE_DIR = Path.home() / ".config" / "green-tab" / "browser-profile"


# ── Logging ──────────────────────────────────────────────────────────────────────

def write_report(report: dict) -> Path:
    """Write an execution report to the logs directory. Never includes auth secrets."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    report_file = LOGS_DIR / f"fetch-{timestamp}.json"
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report_file


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch team data from Google Sheet (v2 — Team Scores + KSCAT Calc ONLY)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  First-time login:
    python3 scripts/fetch_team_data.py --login

  Daily fetch (headless):
    python3 scripts/fetch_team_data.py

  Dry-run (parse + verify, no Supabase write):
    python3 scripts/fetch_team_data.py --dry-run

  Test with local Team Scores CSV:
    python3 scripts/fetch_team_data.py --csv /tmp/team_scores.csv
        """,
    )
    parser.add_argument("--login", action="store_true", help="ONE-TIME: Open browser for manual Google sign-in")
    parser.add_argument("--csv", type=str, help="Use a local CSV file (Team Scores format) instead of browser")
    parser.add_argument("--dry-run", action="store_true", help="Parse and verify data but do NOT write to Supabase")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print detailed logs")
    parser.add_argument("--output", "-o", type=str, help="Team data output file path (default: public/team-data.json)")
    args = parser.parse_args()

    start_time = time.time()
    team_data_file = Path(args.output) if args.output else TEAM_DATA_FILE

    # ── Mode 1: Interactive login ──
    if args.login:
        print("[fetch] Opening browser for one-time login...")
        result = interactive_login()
        if result and result.get("verified"):
            print(f"[fetch] ✅ Login verified. Both data sources accessible.")
        else:
            print(f"[fetch] ⚠️  Login verification incomplete. Try fetching again later.")
        sys.exit(0 if result else 1)

    # ── Mode 2: Local CSV file (Team Scores only, for testing) ──
    if args.csv:
        file_path = Path(args.csv)
        if not file_path.exists():
            print(f"[fetch] ❌ File not found: {file_path}")
            sys.exit(1)

        raw_text = file_path.read_text(encoding="utf-8")
        print(f"[fetch] Loaded {len(raw_text)} chars from {file_path}")

        try:
            team_data = parse_team_scores(raw_text)
        except ValidationError as e:
            print(f"[fetch] ❌ Validation failed: {e}")
            if args.verbose:
                print(f"  Details: {e.details}")
            sys.exit(1)

        team_data.pop("_meta", None)

        if args.dry_run or args.verbose:
            print("\n[fetch] === DRY RUN: Team Scores Data ===")
            print(f"[fetch] Source: Team Scores (gid=87009911)")
            print(f"[fetch] Members: {len(team_data.get('members', []))}")
            print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
            print(f"[fetch] Floor Avg: {json.dumps(team_data.get('floorAvg', {}), indent=2)}")
            for m in team_data.get("members", [])[:3]:
                print(f"  Sample: {m.get('email')} csat={m.get('csat')} prod={m.get('productivity')} fcr={m.get('fcr')}")

        if not args.dry_run:
            team_data_file.parent.mkdir(parents=True, exist_ok=True)
            team_data_file.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"[fetch] ✅ Saved to {team_data_file}")

        sys.exit(0)

    # ── Mode 3: Headless browser extraction (BOTH sources) ──
    print("[fetch] Starting headless extraction...")
    print("[fetch] Sources: Team Scores (gid=87009911) + KSCAT Calc (gid=758073782)")

    extractor = SheetExtractor(
        profile_dir=PROFILE_DIR,
        headless=True,
        timeout_ms=30000,
        screenshot_on_failure=True,
    )

    result = extractor.extract()

    if not result.success:
        print(f"[fetch] ❌ Extraction failed: {result.error}")
        if result.details and args.verbose:
            print(f"  Details: {json.dumps(result.details, indent=2)}")

        report = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.time() - start_time, 2),
            "success": False,
            "error": result.error,
        }
        write_report(report)
        sys.exit(1)

    print(f"[fetch] ✅ Extracted both sources:")
    print(f"[fetch]   Team Scores: {len(result.team_scores_csv)} chars")
    print(f"[fetch]   KSCAT Calc:  {len(result.kscat_calc_csv)} chars")

    # ── Parse Team Scores ──
    print("\n[fetch] ── Parsing Team Scores ──")
    try:
        team_data = parse_team_scores(result.team_scores_csv)
    except ValidationError as e:
        print(f"[fetch] ❌ Team Scores parse failed: {e}")
        if args.verbose and e.details:
            print(f"  Details: {json.dumps(e.details, indent=2)}")

        debug_file = LOGS_DIR / f"raw-ts-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.txt"
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        debug_file.write_text(result.team_scores_csv[:50000], encoding="utf-8")
        print(f"[fetch] Raw Team Scores data saved to {debug_file}")

        report = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.time() - start_time, 2),
            "success": False,
            "error": f"Team Scores parse failed: {e}",
        }
        write_report(report)
        sys.exit(1)

    ts_meta = team_data.pop("_meta", {})
    print(f"[fetch] ✅ Team Scores parsed:")
    print(f"[fetch]   Source: {ts_meta.get('source', 'Team Scores')}")
    print(f"[fetch]   GID: {ts_meta.get('gid', '87009911')}")
    print(f"[fetch]   Members: {len(team_data.get('members', []))}")
    print(f"[fetch]   Month: {team_data.get('monthLabel', 'unknown')}")
    print(f"[fetch]   Floor Avg: {json.dumps(team_data.get('floorAvg', {}), indent=2)}")

    # ── Parse KSCAT Calc ──
    print("\n[fetch] ── Parsing KSCAT Calc P1:X15 ──")
    try:
        kscat_data = parse_kscat_calc(result.kscat_calc_csv)
    except ValidationError as e:
        print(f"[fetch] ❌ KSCAT Calc parse failed: {e}")
        if args.verbose and e.details:
            print(f"  Details: {json.dumps(e.details, indent=2)}")

        debug_file = LOGS_DIR / f"raw-kscat-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.txt"
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        debug_file.write_text(result.kscat_calc_csv[:50000], encoding="utf-8")
        print(f"[fetch] Raw KSCAT Calc data saved to {debug_file}")

        report = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.time() - start_time, 2),
            "success": False,
            "error": f"KSCAT Calc parse failed: {e}",
        }
        write_report(report)
        sys.exit(1)

    kc_meta = kscat_data.pop("_meta", {})
    print(f"[fetch] ✅ KSCAT Calc parsed:")
    print(f"[fetch]   Source: {kc_meta.get('source', 'KSCAT Calc')}")
    print(f"[fetch]   GID: {kc_meta.get('gid', '758073782')}")
    print(f"[fetch]   Range: {kc_meta.get('range', 'P1:X15')}")
    print(f"[fetch]   Agents: {len(kscat_data.get('agents', []))}")
    print(f"[fetch]   Headers: {kscat_data.get('headers', [])}")

    # ── Extract month label from sheet title ──
    if result.sheet_title and not team_data.get("monthLabel"):
        import re as title_re
        m = title_re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[-–]\s*(\d{2,4})", result.sheet_title, title_re.I)
        if m:
            month_abbr = m.group(1).title()
            year_short = m.group(2)
            month_map = {
                "Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April",
                "May": "May", "Jun": "June", "Jul": "July", "Aug": "August",
                "Sep": "September", "Oct": "October", "Nov": "November", "Dec": "December",
            }
            month_full = month_map.get(month_abbr, month_abbr)
            year_full = f"20{year_short}" if len(year_short) == 2 else year_short
            team_data["monthLabel"] = f"{month_full} {year_full}"

    month_label = team_data.get("monthLabel", datetime.now(timezone.utc).strftime("%B %Y"))

    # ── Dry-run: print samples and stop ──
    if args.dry_run:
        print("\n" + "=" * 70)
        print("DRY RUN — Verification Report")
        print("=" * 70)

        print(f"\n── Team Scores (gid=87009911) ──")
        print(f"Tab: Team Scores")
        print(f"Members found: {len(team_data.get('members', []))}")
        print(f"Month: {month_label}")
        print(f"Detected headers: Table1 at row {ts_meta.get('table1_header_idx', '?')}, Table2 at row {ts_meta.get('table2_header_idx', '?')}")
        print(f"Sample records:")
        for m in team_data.get("members", [])[:3]:
            print(f"  {m.get('email')}: csat={m.get('csat')} prod={m.get('productivity')} fcr={m.get('fcr')} aht={m.get('aht')} esc={m.get('escalationRate')} adh={m.get('adherence')} breakExceed={m.get('breakExceed')} idleTime={m.get('idleTime')}")

        print(f"\n── KSCAT Calc (gid=758073782, range P1:X15) ──")
        print(f"Tab: KSCAT Calc")
        print(f"Range: P1:X15")
        print(f"Headers: {kscat_data.get('headers', [])}")
        print(f"Agents found: {len(kscat_data.get('agents', []))}")
        print(f"Sample records:")
        for a in kscat_data.get("agents", [])[:3]:
            print(f"  {a.get('agent')}: csat={a.get('csat_count')} kscat={a.get('kscat_count')} dsat={a.get('dsat_count')} total={a.get('total_count')} kscat%={a.get('kscat_pct')} csat%={a.get('csat_pct')} var={a.get('variance')}")
        if kscat_data.get("team_score"):
            ts = kscat_data["team_score"]
            print(f"  Team Score: csat={ts.get('csat_count')} kscat={ts.get('kscat_count')} dsat={ts.get('dsat_count')} kscat%={ts.get('kscat_pct')} csat%={ts.get('csat_pct')}")

        print(f"\n── What would be written to Supabase ──")
        print(f"team_metrics: {len(team_data.get('members', []))} records (month='{month_label}')")
        print(f"kscat_data: {len(kscat_data.get('agents', []))} records (month='{month_label}')")
        print(f"\n✅ Dry-run complete. No data was written to Supabase.")
        sys.exit(0)

    # ── Save locally ──
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEAM_DATA_FILE.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[fetch] ✅ Saved team data to {TEAM_DATA_FILE}")

    KSCAT_DATA_FILE.write_text(json.dumps(kscat_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[fetch] ✅ Saved KSCAT data to {KSCAT_DATA_FILE}")

    # Backups
    backup_ts = TEAM_DATA_FILE.parent / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup_ts.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")

    backup_kc = KSCAT_DATA_FILE.parent / f"kscat-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup_kc.write_text(json.dumps(kscat_data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Upsert to Supabase ──
    try:
        from supabase_upsert import upsert_team_data, upsert_kscat_data, UpsertError

        print("\n[fetch] ── Upserting Team Scores to Supabase ──")
        result_ts = upsert_team_data(team_data, month=month_label)
        if result_ts["success"]:
            print(f"[fetch] ✅ team_metrics: {result_ts['inserted_or_updated']}/{result_ts['total_records']} upserted")
        else:
            print(f"[fetch] ⚠️  team_metrics upsert had errors:")
            for err in result_ts.get("errors", []):
                print(f"  - {err}")

        print("\n[fetch] ── Upserting KSCAT Calc to Supabase ──")
        try:
            result_kc = upsert_kscat_data(kscat_data, month=month_label)
            if result_kc["success"]:
                print(f"[fetch] ✅ kscat_data: {result_kc['inserted_or_updated']}/{result_kc['total_records']} upserted")
            else:
                print(f"[fetch] ⚠️  kscat_data upsert had errors:")
                for err in result_kc.get("errors", []):
                    print(f"  - {err}")
        except UpsertError as e:
            if "does not exist" in str(e) or "could not find" in str(e).lower():
                print(f"[fetch] ⚠️  kscat_data table does not exist in Supabase!")
                print(f"[fetch]    Run the SQL from the error message in Supabase SQL Editor.")
                print(f"[fetch]    Team Scores data was still saved.")
            else:
                raise

    except ImportError:
        print("[fetch] ⚠️  supabase_upsert not available — skipping Supabase sync")
    except Exception as upsert_err:
        print(f"[fetch] ⚠️  Supabase upsert failed: {upsert_err}")
        print("[fetch] Data was saved locally; Supabase sync will retry next run")

    # ── Report ──
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - start_time, 2),
        "success": True,
        "sources": {
            "team_scores": {"gid": "87009911", "members": len(team_data.get("members", []))},
            "kscat_calc": {"gid": "758073782", "range": "P1:X15", "agents": len(kscat_data.get("agents", []))},
        },
        "month_label": month_label,
        "sheet_title": result.sheet_title,
    }
    write_report(report)

    duration = time.time() - start_time
    print(f"\n[fetch] Done in {duration:.1f}s")


if __name__ == "__main__":
    main()