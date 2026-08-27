#!/usr/bin/env python3
"""
Green Tab — Team Data Fetcher (Main Orchestrator)

Workflow:
    1. Start persistent Chromium profile
    2. Verify Google authentication
    3. Open restricted Google Sheet
    4. Select "Team Scores" tab
    5. Try CSV download (Priority 1)
    6. If CSV fails → clipboard extraction (Priority 2)
    7. Parse CSV/TSV
    8. Validate dataset
    9. Save to public/team-data.json
   10. Write execution report

Usage:
  First-time login (opens browser for manual sign-in):
    python3 scripts/fetch_team_data.py --login

  Daily fetch (headless, uses saved profile):
    python3 scripts/fetch_team_data.py

  Test with local CSV file:
    python3 scripts/fetch_team_data.py --csv /path/to/file.csv

  Test with local TSV file:
    python3 scripts/fetch_team_data.py --tsv /path/to/file.tsv

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

from sheet_parser import parse_tsv, parse_csv, validate_team_data, ValidationError
from sheet_extractor import SheetExtractor, interactive_login, ExtractionResult

# ── Config ──────────────────────────────────────────────────────────────────────

PROJECT_DIR = SCRIPTS_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "public"
OUTPUT_FILE = OUTPUT_DIR / "team-data.json"
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


def build_report(
    start_time: float,
    result: ExtractionResult | None = None,
    team_data: dict | None = None,
    error: str = "",
    source: str = "",
    validation_ok: bool = False,
) -> dict:
    """Build a structured execution report. Never includes auth secrets."""
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - start_time, 2),
        "success": validation_ok and team_data is not None,
        "source": source,
        "extraction_method": result.method if result else "none",
        "tab_verified": result.tab_verified if result else False,
        "validation_ok": validation_ok,
        "members_count": len(team_data.get("members", [])) if team_data else 0,
        "month_label": team_data.get("monthLabel", "") if team_data else "",
        "error": error,
        "raw_text_length": len(result.raw_text) if result and result.raw_text else 0,
    }


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch team data from Google Sheet",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  First-time login:
    python3 scripts/fetch_team_data.py --login

  Daily fetch (headless):
    python3 scripts/fetch_team_data.py

  Test with local file:
    python3 scripts/fetch_team_data.py --csv /tmp/export.csv
    python3 scripts/fetch_team_data.py --tsv /tmp/clipboard.txt
        """,
    )
    parser.add_argument("--login", action="store_true", help="ONE-TIME: Open browser for manual Google sign-in")
    parser.add_argument("--csv", type=str, help="Use a local CSV file instead of fetching from browser")
    parser.add_argument("--tsv", type=str, help="Use a local TSV file instead of fetching from browser")
    parser.add_argument("--test", action="store_true", help="Test mode: print data without saving")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print detailed logs")
    parser.add_argument("--output", "-o", type=str, help="Output file path (default: public/team-data.json)")
    args = parser.parse_args()

    start_time = time.time()
    output_file = Path(args.output) if args.output else OUTPUT_FILE

    # ── Mode 1: Interactive login ──
    if args.login:
        print("[fetch] Opening browser for one-time login...")
        result = interactive_login()
        if result and result.get("verified"):
            print(f"[fetch] ✅ Login verified. Found {result.get('membersFound', 0)} members.")
        else:
            print(f"[fetch] ⚠️  Login verification incomplete. Try fetching again later.")
        sys.exit(0 if result else 1)

    # ── Mode 2: Local file ──
    if args.csv or args.tsv:
        file_path = Path(args.csv or args.tsv)
        if not file_path.exists():
            print(f"[fetch] ❌ File not found: {file_path}")
            sys.exit(1)

        raw_text = file_path.read_text(encoding="utf-8")
        print(f"[fetch] Loaded {len(raw_text)} chars from {file_path}")

        try:
            rows = parse_csv(raw_text) if args.csv else parse_tsv(raw_text)
            team_data = validate_team_data(rows)
        except ValidationError as e:
            print(f"[fetch] ❌ Validation failed: {e}")
            if args.verbose:
                print(f"  Details: {e.details}")
            sys.exit(1)

        # Remove _meta before saving
        team_data.pop("_meta", None)

        if args.test:
            print(json.dumps(team_data, indent=2, ensure_ascii=False))
        else:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"[fetch] ✅ Saved to {output_file}")
            print(f"[fetch] Members: {len(team_data.get('members', []))}")
            print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
            print(f"[fetch] Floor Avg: {team_data.get('floorAvg', {})}")

            # Backup
            backup = output_file.parent / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            backup.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")

        sys.exit(0)

    # ── Mode 3: Headless browser extraction ──
    print("[fetch] Starting headless extraction...")

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

        report = build_report(start_time, result=result, error=result.error)
        write_report(report)
        sys.exit(1)

    print(f"[fetch] ✅ Extracted {len(result.raw_text)} chars via {result.method}")
    print(f"[fetch] Tab verified: {result.tab_verified}")

    # ── Parse and validate ──
    try:
        if result.method == "csv_download":
            rows = parse_csv(result.raw_text)
        else:
            # Clipboard data is TSV
            rows = parse_tsv(result.raw_text)

        if args.verbose:
            print(f"[fetch] Parsed {len(rows)} rows")
            if rows:
                print(f"[fetch] First row: {rows[0][:5]}")

        team_data = validate_team_data(rows)
    except ValidationError as e:
        print(f"[fetch] ❌ Data validation failed: {e}")
        if args.verbose:
            print(f"  Details: {e.details}")

        # Save raw text for debugging (never includes auth secrets)
        debug_file = LOGS_DIR / f"raw-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.txt"
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        debug_file.write_text(result.raw_text[:50000], encoding="utf-8")  # Cap at 50KB
        print(f"[fetch] Raw data saved to {debug_file} for inspection")

        report = build_report(start_time, result=result, error=str(e))
        write_report(report)
        sys.exit(1)

    # Remove _meta before saving
    team_data.pop("_meta", None)

    # ── Extract month label from sheet title ──
    # The sheet title looks like "Aug - 26 - Google Sheets"
    # Parse "Aug - 26" into "August 2026"
    if result.sheet_title and not team_data.get("monthLabel"):
        import re as title_re
        # Try patterns like "Aug - 26", "August 2026", "Aug 2026"
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
        else:
            # Try "Month YYYY" pattern
            m = title_re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})", result.sheet_title, title_re.I)
            if m:
                team_data["monthLabel"] = f"{m.group(1).title()} {m.group(2)}"

    # ── Save ──
    if args.test:
        print(json.dumps(team_data, indent=2, ensure_ascii=False))
    else:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")

        print(f"[fetch] ✅ Saved to {output_file}")
        print(f"[fetch] Members: {len(team_data.get('members', []))}")
        print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
        print(f"[fetch] Floor Avg: {team_data.get('floorAvg', {})}")

        # Backup
        backup = output_file.parent / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        backup.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Report ──
    report = build_report(
        start_time,
        result=result,
        team_data=team_data,
        source="browser",
        validation_ok=True,
    )
    write_report(report)

    duration = time.time() - start_time
    print(f"[fetch] Done in {duration:.1f}s")


if __name__ == "__main__":
    main()