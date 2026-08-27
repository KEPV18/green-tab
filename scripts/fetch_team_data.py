#!/usr/bin/env python3
"""
Green Tab — Google Sheet Team Data Fetcher

Usage:
  1. First time (interactive login):
     python3 scripts/fetch_team_data.py --login
     
     This opens Chromium. Sign in to Google, navigate to the sheet,
     then press Enter in the terminal to extract data.
  
  2. Subsequent runs (uses saved cookies):
     python3 scripts/fetch_team_data.py
     
  3. Test mode (print data without saving):
     python3 scripts/fetch_team_data.py --test
  
  4. Use a local CSV file:
     python3 scripts/fetch_team_data.py --csv path/to/file.csv

The script saves cookies to ~/.config/green-tab/cookies.json after login.
Subsequent runs reuse these cookies to access the sheet without login.
"""

import argparse
import json
import os
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

COOKIES_DIR = Path.home() / ".config" / "green-tab"
COOKIES_FILE = COOKIES_DIR / "cookies.json"

# ── Helpers ─────────────────────────────────────────────────────────────────────

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


def fetch_with_playwright_login():
    """Open browser for user to log in, then extract CSV."""
    from playwright.sync_api import sync_playwright
    
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    
    with sync_playwright() as p:
        # Use a persistent context to save cookies
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(COOKIES_DIR / "browser-profile"),
            headless=False,
            channel="chromium",
            args=["--disable-blink-features=AutomationControlled", "--no-first-run"],
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        
        # Load existing cookies if available
        if COOKIES_FILE.exists():
            print("[fetch] Loading saved cookies...")
            try:
                cookies = json.loads(COOKIES_FILE.read_text())
                context.add_cookies(cookies)
            except Exception as e:
                print(f"[fetch] Warning: Could not load cookies: {e}")
        
        # Navigate to the sheet
        print("[fetch] Opening Google Sheet...")
        print("[fetch] If prompted to log in, sign in with your work account.")
        page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
        time.sleep(3)
        
        # Check if we need to log in
        current_url = page.url
        if "accounts.google.com" in current_url:
            print("\n" + "=" * 60)
            print("[fetch] ⚠️  LOGIN REQUIRED!")
            print("[fetch] Please sign in to Google in the browser window.")
            print("[fetch] After signing in, the sheet should load automatically.")
            print("[fetch] Press ENTER here when you can see the sheet data.")
            print("=" * 60 + "\n")
            input(">>> Press ENTER when the sheet is visible in the browser... ")
            page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(5)
        
        # Save cookies for future use
        print("[fetch] Saving cookies for future runs...")
        cookies = context.cookies()
        COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
        
        # Try CSV export
        print("[fetch] Attempting CSV export...")
        csv_page = context.new_page()
        csv_page.goto(CSV_EXPORT_URL, wait_until="networkidle", timeout=30000)
        csv_text = csv_page.inner_text("body")
        csv_page.close()
        
        # Check if we got actual CSV data
        if "accounts.google.com" in csv_text or "Sign in" in csv_text[:200]:
            print("[fetch] CSV export failed (still login required).")
            print("[fetch] Trying cell extraction from rendered sheet...")
            
            # Go back to the sheet and extract cells
            page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(5)
            
            # Extract all visible cell text
            cells = page.query_selector_all('[role="gridcell"]')
            print(f"[fetch] Found {len(cells)} grid cells")
            
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
            
            # Convert to 2D array
            max_col = max(c for row in rows_data.values() for c in row.keys()) if rows_data else 0
            result_rows = []
            for row_idx in sorted(rows_data.keys()):
                row = []
                for col_idx in range(1, max_col + 1):
                    row.append(rows_data[row_idx].get(col_idx, ""))
                result_rows.append(row)
            
            context.close()
            
            if not result_rows:
                print("[fetch] ❌ Failed to extract any data from sheet!")
                return None
            
            print(f"[fetch] Extracted {len(result_rows)} rows from rendered sheet")
            return result_rows  # Return raw rows for special processing
        
        context.close()
        return csv_text


def fetch_with_saved_cookies():
    """Try to fetch CSV using previously saved cookies (no browser window)."""
    from playwright.sync_api import sync_playwright
    
    if not COOKIES_FILE.exists():
        return None
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(COOKIES_DIR / "browser-profile"),
            headless=True,  # No visible browser
            channel="chromium",
            args=["--disable-blink-features=AutomationControlled", "--no-first-run"],
        )
        
        # Load saved cookies
        try:
            cookies = json.loads(COOKIES_FILE.read_text())
            context.add_cookies(cookies)
        except:
            context.close()
            return None
        
        # Try CSV export
        page = context.new_page()
        page.goto(CSV_EXPORT_URL, wait_until="networkidle", timeout=30000)
        csv_text = page.inner_text("body")
        
        # Check if we got actual data
        if "accounts.google.com" in csv_text or "Sign in" in csv_text[:200] or "error" in csv_text[:100].lower():
            context.close()
            return None
        
        # Save updated cookies
        updated_cookies = context.cookies()
        COOKIES_FILE.write_text(json.dumps(updated_cookies, indent=2))
        
        context.close()
        return csv_text


def main():
    parser = argparse.ArgumentParser(description="Fetch team data from Google Sheet")
    parser.add_argument("--test", action="store_true", help="Test mode: print data without saving")
    parser.add_argument("--login", action="store_true", help="Interactive login: open browser for Google sign-in")
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
        # Interactive login with browser
        result = fetch_with_playwright_login()
        if result is None:
            print("[fetch] ❌ Failed to fetch data!")
            sys.exit(1)
        elif isinstance(result, list) and result and isinstance(result[0], list):
            # Raw rows from cell extraction
            team_data = extract_team_data(result)
        else:
            rows = parse_csv(result)
            team_data = extract_team_data(rows)
    else:
        # Try headless fetch with saved cookies first
        print("[fetch] Trying headless fetch with saved cookies...")
        csv_text = fetch_with_saved_cookies()
        
        if csv_text:
            print("[fetch] ✅ Successfully fetched data with saved cookies!")
            rows = parse_csv(csv_text)
            team_data = extract_team_data(rows)
        else:
            print("[fetch] Headless fetch failed. Run with --login to authenticate first.")
            print("[fetch] Usage: python3 scripts/fetch_team_data.py --login")
            sys.exit(1)
    
    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    if args.test:
        print(json.dumps(team_data, indent=2, ensure_ascii=False))
    else:
        OUTPUT_FILE.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[fetch] ✅ Saved team data to {OUTPUT_FILE}")
        print(f"[fetch] Members: {len(team_data.get('members', []))}")
        print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
        print(f"[fetch] Floor Avg: {team_data.get('floorAvg', {})}")
    
    # Backup
    backup = OUTPUT_DIR / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[fetch] Backup: {backup}")


if __name__ == "__main__":
    main()