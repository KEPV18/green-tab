#!/usr/bin/env python3
"""
Green Tab — Google Sheet Team Data Fetcher

IMPORTANT: This script handles a work Google account.
- NEVER attempt automatic login
- NEVER retry failed logins
- Only open browser ONCE for manual login
- After login, save profile for headless reuse

Usage:
  1. FIRST TIME ONLY (interactive login):
     cd /mnt/ahmed/Projects/green-tab
     python3 scripts/fetch_team_data.py --login
     
     → A browser opens. YOU sign in manually.
     → After signing in and seeing the sheet, press ENTER.
     → The profile is saved. Browser closes.
     
  2. DAILY (headless, uses saved profile):
     python3 scripts/fetch_team_data.py
     
     → No browser window. Uses saved cookies.
     → If cookies expired, it FAILS silently (does NOT retry login).
     
  3. Test mode:
     python3 scripts/fetch_team_data.py --test

CRON (daily at 8 AM):
  0 8 * * * cd /mnt/ahmed/Projects/green-tab && python3 scripts/fetch_team_data.py >> /tmp/green-tab-fetch.log 2>&1
"""

import argparse
import json
import sys
import time
import csv
import io
import re
from pathlib import Path
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────────
SHEET_URL = "https://docs.google.com/spreadsheets/d/1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw/edit?gid=87009911#gid=87009911"
CSV_EXPORT_URL = "https://docs.google.com/spreadsheets/d/1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw/export?format=csv&gid=87009911"

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public"
OUTPUT_FILE = OUTPUT_DIR / "team-data.json"

PROFILE_DIR = Path.home() / ".config" / "green-tab" / "browser-profile"
LOCK_FILE = Path.home() / ".config" / "green-tab" / ".login-lock"

# ── Helpers ──────────────────────────────────────────────────────────────────────

def parse_num(val: str) -> float | None:
    if not val or val.strip() in ("", "-", "N/A", "—", "–"):
        return None
    cleaned = val.strip().replace("%", "").replace("s", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None

def parse_csv(csv_text: str) -> list[list[str]]:
    reader = csv.reader(io.StringIO(csv_text))
    return [[cell.strip() for cell in row] for row in reader if any(cell.strip() for cell in row)]

def extract_team_data(rows: list[list[str]]) -> dict:
    members = []
    month_label = ""
    
    # Detect month label
    for i in range(min(3, len(rows))):
        text = " ".join(rows[i])
        m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}", text, re.I)
        if m:
            month_label = m.group(0)
            break
    
    # Find table boundaries
    table1_header = -1
    table2_header = -1
    
    for i, row in enumerate(rows):
        joined = " ".join(row).lower()
        if table1_header == -1 and ("csat" in joined or "productivity" in joined):
            table1_header = i
        if "aht" in joined and table1_header != -1 and i > table1_header and table2_header == -1:
            table2_header = i
    
    if table1_header == -1:
        table1_header = 0
    
    headers1 = rows[table1_header] if table1_header < len(rows) else []
    
    def find_col(headers: list[str], keyword: str) -> int:
        kw = keyword.lower()
        for i, h in enumerate(headers):
            if kw in h.lower():
                return i
        return -1
    
    name1_col = find_col(headers1, "name") if find_col(headers1, "name") != -1 else (find_col(headers1, "agent") if find_col(headers1, "agent") != -1 else 0)
    csat_col = find_col(headers1, "csat")
    prod_col = find_col(headers1, "productivity") if find_col(headers1, "productivity") != -1 else find_col(headers1, "prod")
    fcr_col = find_col(headers1, "fcr")
    email1_col = find_col(headers1, "email")
    
    member_map: dict[str, dict] = {}
    data1_start = table1_header + 1
    data1_end = table2_header if table2_header != -1 else len(rows)
    
    csat_vals, prod_vals, fcr_vals = [], [], []
    skip_names = {"average", "total", "floor", "floor average", ""}
    
    for i in range(data1_start, data1_end):
        row = rows[i] if i < len(rows) else []
        if len(row) < 2:
            continue
        name = row[name1_col] if name1_col < len(row) else ""
        if not name or name.lower().strip() in skip_names:
            continue
        
        csat = parse_num(row[csat_col]) if csat_col != -1 and csat_col < len(row) else None
        productivity = parse_num(row[prod_col]) if prod_col != -1 and prod_col < len(row) else None
        fcr = parse_num(row[fcr_col]) if fcr_col != -1 and fcr_col < len(row) else None
        email = row[email1_col] if email1_col != -1 and email1_col < len(row) else ""
        
        member_map[name.lower()] = {"name": name, "email": email, "csat": csat, "productivity": productivity, "fcr": fcr}
        if csat is not None: csat_vals.append(csat)
        if productivity is not None: prod_vals.append(productivity)
        if fcr is not None: fcr_vals.append(fcr)
    
    aht_vals = []
    if table2_header != -1 and table2_header < len(rows):
        headers2 = rows[table2_header]
        name2_col = find_col(headers2, "name") if find_col(headers2, "name") != -1 else (find_col(headers2, "agent") if find_col(headers2, "agent") != -1 else 0)
        aht_col = find_col(headers2, "aht")
        
        for i in range(table2_header + 1, len(rows)):
            row = rows[i] if i < len(rows) else []
            if len(row) < 2:
                continue
            name = row[name2_col] if name2_col < len(row) else ""
            if not name or name.lower().strip() in skip_names:
                continue
            aht = parse_num(row[aht_col]) if aht_col != -1 and aht_col < len(row) else None
            
            key = name.lower()
            if key in member_map:
                member_map[key]["aht"] = aht
            else:
                member_map[key] = {"name": name, "email": "", "csat": None, "productivity": None, "fcr": None, "aht": aht}
            if aht is not None: aht_vals.append(aht)
    
    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0
    
    floor_avg = {"csat": avg(csat_vals), "productivity": avg(prod_vals), "fcr": avg(fcr_vals), "aht": avg(aht_vals)}
    
    for key, data in member_map.items():
        scores = [v for v in [data.get("csat"), data.get("productivity"), data.get("fcr")] if v is not None]
        overall = round(sum(scores) / len(scores), 1) if scores else None
        members.append({
            "name": data["name"], "email": data.get("email", ""),
            "csat": data.get("csat"), "productivity": data.get("productivity"),
            "fcr": data.get("fcr"), "aht": data.get("aht"),
            "overallScore": overall,
            "floorAvgCsat": floor_avg["csat"], "floorAvgProductivity": floor_avg["productivity"],
            "floorAvgFcr": floor_avg["fcr"], "floorAvgAht": floor_avg["aht"],
        })
    
    members.sort(key=lambda m: m.get("overallScore") or 0, reverse=True)
    
    return {"members": members, "fetchedAt": datetime.utcnow().isoformat() + "Z", "monthLabel": month_label, "floorAvg": floor_avg}


def interactive_login():
    """
    ONE-TIME ONLY: Open browser for user to manually sign in.
    NEVER called automatically. NEVER retries.
    """
    from playwright.sync_api import sync_playwright
    
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("⚠️  IMPORTANT: This is a ONE-TIME login.")
    print("⚠️  Sign in with your work account MANUALLY.")
    print("⚠️  Do NOT let the browser auto-fill if it shows the wrong account.")
    print("⚠️  After signing in, wait for the sheet to fully load.")
    print("⚠️  Then press ENTER here to save the session.")
    print("=" * 60)
    print()
    
    with sync_playwright() as p:
        # Launch with persistent profile — this saves ALL cookies/session
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
                "--no-default-browser-check",
            ],
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        
        # Navigate to the sheet
        print("[fetch] Opening Google Sheet in browser...")
        print("[fetch] Please sign in with your WORK account if prompted.")
        page.goto(SHEET_URL, wait_until="domcontentloaded", timeout=120000)
        
        # Check if login is needed
        current_url = page.url
        needs_login = "accounts.google.com" in current_url
        
        if needs_login:
            print()
            print("🔐 Google login page detected.")
            print("   Sign in with your WORK account.")
            print("   After successful login, the sheet will load.")
            print()
        else:
            print("[fetch] Sheet loaded! Checking data...")
        
        print()
        print(">>> Press ENTER when you can see the sheet data in the browser <<<")
        
        # Wait for user confirmation (blocking)
        input()
        
        # Try to export as CSV to verify access
        print("[fetch] Verifying sheet access...")
        csv_page = context.new_page()
        csv_page.goto(CSV_EXPORT_URL, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        csv_text = csv_page.inner_text("body")
        csv_page.close()
        
        if "accounts.google.com" in csv_text or "Sign in" in csv_text[:200]:
            print("[fetch] ⚠️  CSV export requires authentication.")
            print("[fetch] The browser session might not have full access yet.")
            print("[fetch] Trying cell extraction instead...")
            
            # Extract from the rendered sheet
            page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(5)
            
            cells = page.query_selector_all('[role="gridcell"]')
            print(f"[fetch] Found {len(cells)} cells in rendered sheet")
            
            rows_data = {}
            for cell in cells:
                text = cell.inner_text().strip()
                aria_row = cell.get_attribute("aria-rowindex")
                aria_col = cell.get_attribute("aria-colindex")
                if aria_row and aria_col:
                    row_idx = int(aria_row)
                    col_idx = int(aria_col)
                    if row_idx not in rows_data:
                        rows_data[row_idx] = {}
                    rows_data[row_idx][col_idx] = text
            
            max_col = max(c for row in rows_data.values() for c in row.keys()) if rows_data else 0
            result_rows = []
            for row_idx in sorted(rows_data.keys()):
                row = [rows_data[row_idx].get(col_idx, "") for col_idx in range(1, max_col + 1)]
                result_rows.append(row)
            
            context.close()
            
            if not result_rows:
                print("[fetch] ❌ Could not extract data. Please try again.")
                sys.exit(1)
            
            print(f"[fetch] ✅ Extracted {len(result_rows)} rows from rendered sheet!")
            team_data = extract_team_data(result_rows)
            
        else:
            # CSV export worked!
            context.close()
            rows = parse_csv(csv_text)
            team_data = extract_team_data(rows)
            print(f"[fetch] ✅ CSV export successful! Found {len(team_data['members'])} members.")
        
        # Save the data
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_FILE.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
        
        # Create lock file to indicate successful login
        LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOCK_FILE.write_text(json.dumps({
            "loginAt": datetime.utcnow().isoformat() + "Z",
            "members": len(team_data["members"]),
            "monthLabel": team_data.get("monthLabel", ""),
        }, indent=2))
        
        print(f"[fetch] ✅ Saved team data to {OUTPUT_FILE}")
        print(f"[fetch] ✅ Browser profile saved to {PROFILE_DIR}")
        print(f"[fetch] ✅ Members: {len(team_data.get('members', []))}")
        print(f"[fetch] ✅ Month: {team_data.get('monthLabel', 'unknown')}")
        print(f"[fetch] ✅ Floor Avg: {team_data.get('floorAvg', {})}")
        print()
        print("🔒 Browser profile saved. From now on, use:")
        print("   python3 scripts/fetch_team_data.py")
        print("   (No browser window will open. Headless mode.)")
        
        return team_data


def fetch_headless():
    """
    Daily fetch using saved profile. 
    NO login attempts. Fails silently if session expired.
    """
    from playwright.sync_api import sync_playwright
    
    if not PROFILE_DIR.exists():
        print("[fetch] ❌ No browser profile found. Run --login first!")
        sys.exit(1)
    
    with sync_playwright() as p:
        # Launch headless with the saved profile
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=True,  # No browser window
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
                "--no-default-browser-check",
            ],
        )
        
        # Try CSV export
        page = context.new_page()
        page.goto(CSV_EXPORT_URL, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        
        csv_text = ""
        try:
            csv_text = page.inner_text("body")
        except Exception as e:
            print(f"[fetch] Error reading page: {e}")
            context.close()
            return None
        
        # Check if session expired (redirected to login)
        if "accounts.google.com" in page.url or "Sign in" in csv_text[:200]:
            print("[fetch] ⚠️  Session expired. Run --login again to re-authenticate.")
            print("[fetch] ⚠️  NOT attempting automatic login (work account protection).")
            context.close()
            return None
        
        context.close()
        
        rows = parse_csv(csv_text)
        return extract_team_data(rows)


def main():
    parser = argparse.ArgumentParser(description="Fetch team data from Google Sheet")
    parser.add_argument("--login", action="store_true", help="ONE-TIME: Open browser for manual Google sign-in")
    parser.add_argument("--test", action="store_true", help="Test mode: print data without saving")
    parser.add_argument("--csv", type=str, help="Use a local CSV file instead of fetching")
    args = parser.parse_args()
    
    if args.csv:
        csv_path = Path(args.csv)
        if not csv_path.exists():
            print(f"Error: CSV file not found: {csv_path}")
            sys.exit(1)
        csv_text = csv_path.read_text(encoding="utf-8")
        rows = parse_csv(csv_text)
        team_data = extract_team_data(rows)
    
    elif args.login:
        # INTERACTIVE LOGIN — user must be at the keyboard
        team_data = interactive_login()
    
    else:
        # HEADLESS — uses saved profile, NO login attempts
        team_data = fetch_headless()
        if team_data is None:
            print("[fetch] Failed. Run with --login to re-authenticate.")
            sys.exit(1)
    
    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    if args.test and not args.login:
        print(json.dumps(team_data, indent=2, ensure_ascii=False))
    elif not args.login:
        OUTPUT_FILE.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[fetch] ✅ Saved to {OUTPUT_FILE}")
        print(f"[fetch] Members: {len(team_data.get('members', []))}")
        print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
        print(f"[fetch] Floor Avg: {team_data.get('floorAvg', {})}")
        
        # Backup
        backup = OUTPUT_DIR / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        backup.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()