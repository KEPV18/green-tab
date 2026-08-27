#!/usr/bin/env python3
"""
Green Tab — Google Sheet Team Data Fetcher

Runs daily via cron. Opens Chromium with the user's profile (already logged in),
navigates to the team performance Google Sheet, extracts cell data,
and saves it as JSON for the frontend to consume.

Usage:
  python3 fetch_team_data.py          # Fetch and save data
  python3 fetch_team_data.py --test   # Test run, print data without saving
"""

import argparse
import json
import os
import sys
import time
import csv
import io
from pathlib import Path
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────────
SHEET_URL = "https://docs.google.com/spreadsheets/d/1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw/edit?gid=87009911#gid=87009911"
CSV_EXPORT_URL = "https://docs.google.com/spreadsheets/d/1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw/export?format=csv&gid=87009911"

# Output path — served as static JSON by Vercel
OUTPUT_DIR = Path(__file__).parent / "public"
OUTPUT_FILE = OUTPUT_DIR / "team-data.json"

# Chromium profile path
CHROME_USER_DATA_DIR = os.path.expanduser("~/.config/chromium")
CHROME_PROFILE = "Default"


def parse_num(val: str) -> float | None:
    """Parse a number from a cell that might contain '%', 's', commas, or be empty."""
    if not val or val.strip() in ("", "-", "N/A", "—", "–"):
        return None
    cleaned = val.strip().replace("%", "").replace("s", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_csv(csv_text: str) -> list[list[str]]:
    """Parse CSV text into a 2D array of strings."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = []
    for row in reader:
        # Strip whitespace from each cell
        rows.append([cell.strip() for cell in row])
    return rows


def extract_team_data(rows: list[list[str]]) -> dict:
    """
    Parse the two-table sheet into structured team data.
    
    Table 1 (upper): Name | CSAT | Productivity | FCR | Average
    Table 2 (lower): Name | AHT | Average
    
    We merge by name across both tables.
    """
    members = []
    month_label = ""
    floor_avg = {"csat": 0, "productivity": 0, "fcr": 0, "aht": 0}
    
    # ── Detect month label from first rows ──
    import re
    for i in range(min(3, len(rows))):
        text = " ".join(rows[i])
        m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}", text, re.I)
        if m:
            month_label = m.group(0)
            break
    
    # ── Find table boundaries ──
    table1_header = -1  # CSAT/Productivity/FCR header row
    table2_header = -1  # AHT header row
    
    for i, row in enumerate(rows):
        joined = " ".join(row).lower()
        if table1_header == -1 and ("csat" in joined or "productivity" in joined):
            table1_header = i
        if "aht" in joined and table1_header != -1 and i > table1_header and table2_header == -1:
            table2_header = i
    
    if table1_header == -1:
        table1_header = 0  # fallback
    
    # ── Parse Table 1 header columns ──
    headers1 = rows[table1_header] if table1_header < len(rows) else []
    
    def find_col(headers: list[str], keyword: str) -> int:
        kw = keyword.lower()
        for i, h in enumerate(headers):
            if kw in h.lower():
                return i
        return -1
    
    name1_col = find_col(headers1, "name")
    if name1_col == -1:
        name1_col = find_col(headers1, "agent")
    if name1_col == -1:
        name1_col = 0  # fallback to first column
    
    csat_col = find_col(headers1, "csat")
    prod_col = find_col(headers1, "productivity")
    if prod_col == -1:
        prod_col = find_col(headers1, "prod")
    fcr_col = find_col(headers1, "fcr")
    email1_col = find_col(headers1, "email")
    
    # ── Parse Table 1 data rows ──
    member_map: dict[str, dict] = {}
    data1_start = table1_header + 1
    data1_end = table2_header if table2_header != -1 else len(rows)
    
    csat_vals = []
    prod_vals = []
    fcr_vals = []
    
    for i in range(data1_start, data1_end):
        row = rows[i] if i < len(rows) else []
        if len(row) < 2:
            continue
        
        name = row[name1_col] if name1_col < len(row) else ""
        if not name or name.lower() in ("average", "total", "floor", "floor average", ""):
            continue
        
        csat = parse_num(row[csat_col]) if csat_col != -1 and csat_col < len(row) else None
        productivity = parse_num(row[prod_col]) if prod_col != -1 and prod_col < len(row) else None
        fcr = parse_num(row[fcr_col]) if fcr_col != -1 and fcr_col < len(row) else None
        email = row[email1_col] if email1_col != -1 and email1_col < len(row) else ""
        
        member_map[name.lower()] = {
            "name": name,
            "email": email,
            "csat": csat,
            "productivity": productivity,
            "fcr": fcr,
        }
        
        if csat is not None:
            csat_vals.append(csat)
        if productivity is not None:
            prod_vals.append(productivity)
        if fcr is not None:
            fcr_vals.append(fcr)
    
    # ── Parse Table 2 (AHT) ──
    aht_vals = []
    
    if table2_header != -1 and table2_header < len(rows):
        headers2 = rows[table2_header]
        name2_col = find_col(headers2, "name")
        if name2_col == -1:
            name2_col = find_col(headers2, "agent")
        if name2_col == -1:
            name2_col = 0
        
        aht_col = find_col(headers2, "aht")
        
        for i in range(table2_header + 1, len(rows)):
            row = rows[i] if i < len(rows) else []
            if len(row) < 2:
                continue
            
            name = row[name2_col] if name2_col < len(row) else ""
            if not name or name.lower() in ("average", "total", "floor", "floor average", ""):
                continue
            
            aht = parse_num(row[aht_col]) if aht_col != -1 and aht_col < len(row) else None
            
            key = name.lower()
            if key in member_map:
                member_map[key]["aht"] = aht
            else:
                member_map[key] = {
                    "name": name,
                    "email": "",
                    "csat": None,
                    "productivity": None,
                    "fcr": None,
                    "aht": aht,
                }
            
            if aht is not None:
                aht_vals.append(aht)
    
    # ── Compute floor averages ──
    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0
    
    floor_avg = {
        "csat": avg(csat_vals),
        "productivity": avg(prod_vals),
        "fcr": avg(fcr_vals),
        "aht": avg(aht_vals),
    }
    
    # ── Build members list ──
    for key, data in member_map.items():
        scores = [v for v in [data.get("csat"), data.get("productivity"), data.get("fcr")] if v is not None]
        overall = round(sum(scores) / len(scores), 1) if scores else None
        
        members.append({
            "name": data["name"],
            "email": data.get("email", ""),
            "csat": data.get("csat"),
            "productivity": data.get("productivity"),
            "fcr": data.get("fcr"),
            "aht": data.get("aht"),
            "overallScore": overall,
            "floorAvgCsat": floor_avg["csat"],
            "floorAvgProductivity": floor_avg["productivity"],
            "floorAvgFcr": floor_avg["fcr"],
            "floorAvgAht": floor_avg["aht"],
        })
    
    # Sort by overall score descending
    members.sort(key=lambda m: m.get("overallScore") or 0, reverse=True)
    
    return {
        "members": members,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "monthLabel": month_label,
        "floorAvg": floor_avg,
    }


def fetch_via_playwright():
    """Use Playwright with the user's Chromium profile to fetch sheet data."""
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        # Launch with user's Chrome profile (already logged in)
        browser = p.chromium.launch_persistent_context(
            user_data_dir=CHROME_USER_DATA_DIR,
            headless=False,  # Must be visible for Google auth
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
            ],
        )
        
        page = browser.pages[0] if browser.pages else browser.new_page()
        
        # Navigate to the sheet
        print(f"[fetch] Opening Google Sheet...")
        page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
        time.sleep(5)  # Wait for sheet to fully render
        
        # Check if we're still on login page
        current_url = page.url
        if "accounts.google.com" in current_url:
            print("[fetch] ⚠️  Login required! Please sign in to Google in the browser window.")
            print("[fetch] Waiting 120 seconds for manual login...")
            time.sleep(120)
            page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(5)
        
        # Try to get sheet title to confirm we're in
        title = page.title()
        print(f"[fetch] Page title: {title}")
        
        # Try CSV export — works if sheet is accessible
        print(f"[fetch] Trying CSV export...")
        csv_page = browser.new_page()
        csv_page.goto(CSV_EXPORT_URL, wait_until="networkidle", timeout=30000)
        csv_text = csv_page.inner_text("body")
        csv_page.close()
        
        # Check if we got actual CSV data (not a login page)
        if "accounts.google.com" in csv_text or "Sign in" in csv_text[:200]:
            print("[fetch] CSV export failed (login required). Falling back to cell extraction...")
            csv_text = None
        
        browser.close()
        
        if csv_text:
            return csv_text
        else:
            return None


def fetch_via_cell_extraction():
    """Fallback: extract cells directly from the rendered Google Sheet."""
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=CHROME_USER_DATA_DIR,
            headless=False,
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
            ],
        )
        
        page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
        time.sleep(5)
        
        # Check if we need to log in
        if "accounts.google.com" in page.url:
            print("[fetch] ⚠️  Login required! Please sign in to Google in the browser window.")
            print("[fetch] Waiting 120 seconds for manual login...")
            time.sleep(120)
            page.goto(SHEET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(5)
        
        # Extract all visible cell text from the sheet
        print("[fetch] Extracting cells from rendered sheet...")
        
        # Get all grid cells — Google Sheets uses role="gridcell"
        cells = page.query_selector_all('[role="gridcell"]')
        print(f"[fetch] Found {len(cells)} grid cells")
        
        rows_data = []
        current_row = 0
        current_row_cells = []
        
        for cell in cells:
            text = cell.inner_text().strip()
            aria_row = cell.get_attribute("aria-rowindex")
            aria_col = cell.get_attribute("aria-colindex")
            
            if aria_row:
                row_idx = int(aria_row)
                if row_idx != current_row:
                    if current_row_cells:
                        rows_data.append(current_row_cells)
                    current_row = row_idx
                    current_row_cells = []
            
            current_row_cells.append(text)
        
        if current_row_cells:
            rows_data.append(current_row_cells)
        
        browser.close()
        return rows_data


def main():
    parser = argparse.ArgumentParser(description="Fetch team data from Google Sheet")
    parser.add_argument("--test", action="store_true", help="Test mode: print data without saving")
    parser.add_argument("--csv", type=str, help="Use a local CSV file instead of fetching")
    args = parser.parse_args()
    
    if args.csv:
        # Use a local CSV file
        csv_path = Path(args.csv)
        if not csv_path.exists():
            print(f"Error: CSV file not found: {csv_path}")
            sys.exit(1)
        csv_text = csv_path.read_text(encoding="utf-8")
    else:
        # Try CSV export first (simpler)
        csv_text = fetch_via_playwright()
    
    if csv_text is None:
        # Fallback to cell extraction
        print("[fetch] CSV export failed, trying cell extraction...")
        rows_data = fetch_via_cell_extraction()
        if not rows_data:
            print("[fetch] Failed to extract data from sheet!")
            sys.exit(1)
        
        team_data = {
            "members": [],
            "fetchedAt": datetime.utcnow().isoformat() + "Z",
            "monthLabel": "",
            "floorAvg": {"csat": 0, "productivity": 0, "fcr": 0, "aht": 0},
            "rawCells": rows_data,
        }
    else:
        rows = parse_csv(csv_text)
        team_data = extract_team_data(rows)
    
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    if args.test:
        print(json.dumps(team_data, indent=2, ensure_ascii=False))
    else:
        # Save to public/team-data.json for the frontend
        OUTPUT_FILE.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[fetch] ✅ Saved team data to {OUTPUT_FILE}")
        print(f"[fetch] Members: {len(team_data.get('members', []))}")
        print(f"[fetch] Month: {team_data.get('monthLabel', 'unknown')}")
        print(f"[fetch] Floor Avg: {team_data.get('floorAvg', {})}")
    
    # Also save a timestamped backup
    backup_file = OUTPUT_DIR / f"team-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup_file.write_text(json.dumps(team_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[fetch] Backup saved to {backup_file}")


if __name__ == "__main__":
    main()