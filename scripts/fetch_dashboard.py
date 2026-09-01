#!/usr/bin/env python3
"""
Green Tab — New Dashboard Sheet Fetcher

Fetches data from the new Performance Dashboard sheet and uploads to Supabase.
Uses the browser profile saved during --login.
"""

import argparse
import csv
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dashboard_parser import parse_dashboard_csv

SHEET_ID = "1w_mLKr2d1VgduPY0iGqdZ6lv1fQhOGUQIL-h67lGxqE"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"
DASHBOARD_GID = "1"

DEFAULT_PROFILE_DIR = Path.home() / ".config" / "green-tab" / "browser-profile"

# Supabase config
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://udbdvtcugpnrmtfipbzj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SUPABASE_TABLE = "team_metrics"


def fetch_with_browser(profile_dir: Path, headless: bool = True) -> str:
    """Fetch CSV data using Playwright browser."""
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=headless,
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
                "--no-default-browser-check",
            ],
            accept_downloads=True,
        )
        
        # Grant clipboard permissions
        context.grant_permissions(
            ["clipboard-read", "clipboard-write"],
            origin="https://docs.google.com",
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        
        # Navigate to sheet first to establish session
        page.goto(SHEET_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(5)
        
        # Download CSV export
        csv_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={DASHBOARD_GID}"
        
        try:
            with page.expect_download(timeout=30000) as download_info:
                page.goto(csv_url, timeout=30000)
            download = download_info.value
            save_path = f"/tmp/dashboard_export.csv"
            download.save_as(save_path)
            with open(save_path, "r") as f:
                csv_text = f.read()
            print(f"[fetch] Downloaded CSV: {len(csv_text)} chars")
        except Exception as e:
            # Fallback: try clipboard method
            print(f"[fetch] CSV download failed ({e}), trying clipboard...")
            page.goto(SHEET_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(8)
            
            # Select all and copy
            page.keyboard.press("Control+A")
            time.sleep(1)
            page.keyboard.press("Control+C")
            time.sleep(2)
            
            clipboard_text = page.evaluate("navigator.clipboard.readText()")
            csv_text = clipboard_text
            print(f"[fetch] Clipboard: {len(csv_text)} chars")
        
        context.close()
        return csv_text


def fetch_with_xvfb(profile_dir: Path) -> str:
    """Fetch using Xvfb for headed browser in headless environment."""
    import subprocess
    
    # Start Xvfb if not running
    result = subprocess.run(["pgrep", "-f", "Xvfb"], capture_output=True, text=True)
    if not result.stdout.strip():
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1280x720x24"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)
    
    env = os.environ.copy()
    env["DISPLAY"] = ":99"
    
    # Run fetch_with_browser with DISPLAY set
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,  # Must be False for Google Sheets
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
                "--no-default-browser-check",
            ],
            accept_downloads=True,
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(SHEET_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(5)
        
        csv_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={DASHBOARD_GID}"
        
        try:
            with page.expect_download(timeout=30000) as download_info:
                page.goto(csv_url, timeout=30000)
            download = download_info.value
            save_path = "/tmp/dashboard_export.csv"
            download.save_as(save_path)
            with open(save_path, "r") as f:
                csv_text = f.read()
            print(f"[fetch] Downloaded CSV: {len(csv_text)} chars")
        except Exception as e:
            print(f"[fetch] CSV download failed ({e}), trying clipboard...")
            page.goto(SHEET_URL, wait_until="domcontentloaded", timeout=60000)
            time.sleep(8)
            page.keyboard.press("Control+A")
            time.sleep(1)
            page.keyboard.press("Control+C")
            time.sleep(2)
            clipboard_text = page.evaluate("navigator.clipboard.readText()")
            csv_text = clipboard_text
            print(f"[fetch] Clipboard: {len(csv_text)} chars")
        
        context.close()
        return csv_text


def upload_to_supabase(data: dict, dry_run: bool = False) -> bool:
    """Upload parsed data to Supabase team_metrics table.
    
    Maps new dashboard fields to existing column names.
    """
    try:
        from supabase import create_client, Client
    except ImportError:
        print("[upload] supabase package not found. Install with: pip install supabase")
        return False
    
    if not SUPABASE_KEY:
        print("[upload] SUPABASE_SERVICE_KEY not set")
        return False
    
    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Determine the month/year from the data
    today = datetime.now(timezone.utc)
    month_str = today.strftime("%B %Y")  # e.g. "September 2026"
    date_str = today.strftime("%Y-%m-%d")
    
    rows_to_insert = []
    
    # Map dashboard data to existing team_metrics columns
    # Existing columns: csat, productivity, fcr, chat_aht, avg_group_basket_time,
    #   escalation_rate, adherence, closed_after_resolution, closed_tickets_pct,
    #   deescalation_rate, break_exceed, idle_time
    
    # Insert overall performance data
    for agent in data["overall"]:
        if agent.get("email") == "Total":
            continue
        
        total_count = agent.get("Total Count", 0) or 0
        if total_count == 0:
            continue
        
        row = {
            "month": month_str,
            "report_date": date_str,
            "agent_email": agent["email"],
            "agent_name": agent["email"].split("@")[0].replace(".", " ").title(),
            "team_lead": None,
            "csat": agent.get("CSAT %"),                    # CSAT percentage
            "productivity": agent.get("Productivity 8-hrs"),  # Productivity (8-hr)
            "fcr": agent.get("FCR %"),                       # First Call Resolution %
            "chat_aht": agent.get("AHT"),                    # Average Handling Time
            "avg_group_basket_time": agent.get("ABT"),       # Average Basket Time
            "escalation_rate": agent.get("Escalation Rate %"),
            "adherence": agent.get("Adherence %"),
            "closed_after_resolution": agent.get("Closed After Resolution %"),
            "closed_tickets_pct": agent.get("Closed Tickets %"),
            "deescalation_rate": agent.get("Deescalation Rate %"),
            "break_exceed": None,  # Not in overall section
            "idle_time": _parse_idle_time(agent.get("Idle Time")),
            "source": "Dashboard",
        }
        rows_to_insert.append(row)
    
    # Insert floor averages as a special row
    floor_row = {
        "month": month_str,
        "report_date": date_str,
        "agent_email": "floor_average",
        "agent_name": "Floor Average",
        "team_lead": None,
        "csat": data["floor_averages"].get("CSAT %"),
        "productivity": data["floor_averages"].get("Productivity 8-hrs"),
        "fcr": data["floor_averages"].get("FCR %"),
        "chat_aht": data["floor_averages"].get("Average Handling Time"),
        "avg_group_basket_time": data["floor_averages"].get("Average Basket Time"),
        "escalation_rate": data["floor_averages"].get("Escalation Rate %"),
        "adherence": data["floor_averages"].get("Adherence %"),
        "closed_after_resolution": data["floor_averages"].get("Closed After Resolution %"),
        "closed_tickets_pct": data["floor_averages"].get("Closed Tickets %"),
        "deescalation_rate": data["floor_averages"].get("Deescalation Rate %"),
        "break_exceed": None,
        "idle_time": None,
        "source": "Dashboard",
    }
    rows_to_insert.append(floor_row)
    
    # Insert team averages as a special row
    team_row = {
        "month": month_str,
        "report_date": date_str,
        "agent_email": "team_average",
        "agent_name": "Team Average",
        "team_lead": None,
        "csat": data["team_averages"].get("CSAT %"),
        "productivity": data["team_averages"].get("Productivity 8-hrs"),
        "fcr": data["team_averages"].get("FCR %"),
        "chat_aht": data["team_averages"].get("Average Handling Time"),
        "avg_group_basket_time": data["team_averages"].get("Average Basket Time"),
        "escalation_rate": data["team_averages"].get("Escalation Rate %"),
        "adherence": data["team_averages"].get("Adherence %"),
        "closed_after_resolution": data["team_averages"].get("Closed After Resolution %"),
        "closed_tickets_pct": data["team_averages"].get("Closed Tickets %"),
        "deescalation_rate": data["team_averages"].get("Deescalation Rate %"),
        "break_exceed": None,
        "idle_time": None,
        "source": "Dashboard",
    }
    rows_to_insert.append(team_row)
    
    if dry_run:
        print(f"[dry-run] Would insert {len(rows_to_insert)} rows:")
        for row in rows_to_insert[:3]:
            print(f"  {row['agent_email']}: CSAT={row.get('csat')}, Prod={row.get('productivity')}")
        print(f"  ... and {len(rows_to_insert) - 3} more rows")
        return True
    
    # Delete existing data for this month
    try:
        client.table(SUPABASE_TABLE).delete().eq("month", month_str).eq("source", "Dashboard").execute()
        print(f"[upload] Deleted existing Dashboard data for {month_str}")
    except Exception as e:
        print(f"[upload] Warning: Could not delete existing data: {e}")
    
    # Insert new data
    try:
        result = client.table(SUPABASE_TABLE).insert(rows_to_insert).execute()
        print(f"[upload] Inserted {len(rows_to_insert)} rows")
        return True
    except Exception as e:
        print(f"[upload] Error inserting data: {e}")
        return False


def _parse_idle_time(value) -> float | None:
    """Parse idle time from HH:MM:SS format to minutes."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        parts = value.split(":")
        if len(parts) == 3:
            try:
                return float(parts[0]) * 60 + float(parts[1]) + float(parts[2]) / 60
            except ValueError:
                return None
    return None


def main():
    parser = argparse.ArgumentParser(description="Fetch and upload dashboard data")
    parser.add_argument("--login", action="store_true", help="Open browser for one-time login")
    parser.add_argument("--fetch", action="store_true", help="Fetch data from sheet")
    parser.add_argument("--upload", action="store_true", help="Upload to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be uploaded")
    parser.add_argument("--local", type=str, help="Parse local CSV file instead of fetching")
    parser.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE_DIR)
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless")
    parser.add_argument("--no-headless", dest="headless", action="store_false", help="Run browser with window")
    args = parser.parse_args()
    
    if args.login:
        # Import and run interactive login
        from sheet_extractor import interactive_login
        result = interactive_login()
        if result:
            print(f"[login] Success: {result}")
        else:
            print("[login] Failed")
        return
    
    # Get CSV data
    if args.local:
        csv_text = Path(args.local).read_text()
        print(f"[parse] Using local file: {args.local} ({len(csv_text)} chars)")
    elif args.fetch:
        # Check for Xvfb
        import subprocess
        result = subprocess.run(["pgrep", "-f", "Xvfb"], capture_output=True, text=True)
        has_display = os.environ.get("DISPLAY") or result.stdout.strip()
        
        if has_display or args.no_headless:
            csv_text = fetch_with_xvfb(args.profile_dir)
        else:
            csv_text = fetch_with_browser(args.profile_dir, headless=True)
    else:
        # Default: use local CSV if available
        local_csv = Path(__file__).resolve().parent.parent / "public" / "new-sheet-data.csv"
        if local_csv.exists():
            csv_text = local_csv.read_text()
            print(f"[parse] Using cached CSV: {local_csv}")
        else:
            print("[error] No data source. Use --fetch, --local, or --login first.")
            return
    
    # Parse CSV
    data = parse_dashboard_csv(csv_text)
    print(f"[parse] Overall: {len(data['overall'])} agents")
    print(f"[parse] Chat: {len(data['chat'])} agents")
    print(f"[parse] Phone: {len(data['phone'])} agents")
    print(f"[parse] Previous Month: {len(data['previous_month'])} agents")
    print(f"[parse] Team Averages: {len(data['team_averages'])} metrics")
    print(f"[parse] Floor Averages: {len(data['floor_averages'])} metrics")
    
    # Upload
    if args.upload or not args.dry_run:
        success = upload_to_supabase(data, dry_run=args.dry_run)
        if success:
            print("[done] Upload successful")
        else:
            print("[done] Upload failed")
    else:
        print("[done] No upload requested")


if __name__ == "__main__":
    main()