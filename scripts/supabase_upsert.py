#!/usr/bin/env python3
"""
Green Tab — Supabase Upsert Module

Uploads validated team data to the team_metrics table in Supabase.
Uses the service_role key for write access (anon key has read-only access).

CRITICAL:
- chat_aht = "Average basket time" from Sheet19 — NEVER from "Genesys Inbound AHT + ACW"
- Missing values must remain NULL — never substitute 0
- Validation must pass before any database write
- If extraction returns 0 members or malformed data, abort the write

Usage:
    from supabase_upsert import upsert_team_data
    result = upsert_team_data(team_data, month="2026-08")
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Load environment ────────────────────────────────────────────────────────────

def _load_env():
    """Load .env file variables into os.environ (if not already set)."""
    env_paths = [
        Path(__file__).resolve().parent / ".env.local",
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent.parent / ".env.local",
    ]
    for env_path in env_paths:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value

_load_env()

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


# ── Validation ──────────────────────────────────────────────────────────────────

class UpsertError(Exception):
    """Raised when upsert fails validation or execution."""
    pass


def validate_team_data(team_data: dict[str, Any]) -> dict[str, Any]:
    """
    Validate team data before any database write.
    Returns validation report. Raises UpsertError if data is invalid.
    Never overwrites valid database data with empty/broken extraction.
    """
    members = team_data.get("members", [])
    
    if not members:
        raise UpsertError(
            "Extraction returned 0 members — aborting database write to prevent data loss"
        )
    
    report = {
        "total_members": len(members),
        "null_counts": {"csat": 0, "productivity": 0, "fcr": 0, "chat_aht": 0},
        "warnings": [],
        "member_emails": [],
    }
    
    for m in members:
        email = m.get("email", "")
        if not email or "@" not in email:
            raise UpsertError(f"Invalid email in team data: {email!r}")
        report["member_emails"].append(email)
        
        for field in report["null_counts"]:
            if m.get(field) is None:
                report["null_counts"][field] += 1
    
    # Sanity checks
    if len(members) < 3:
        report["warnings"].append(f"Only {len(members)} members found — expected ~13")
    
    # Check AHT source verification
    for m in members:
        aht = m.get("aht")
        genesys = m.get("genesysAht")
        # Verify AHT is NOT sourced from Genesys
        # In our data, genesys_aht is always None (empty in the sheet)
        # If somehow genesys data appeared, flag it
        if genesys is not None and aht is not None and aht == genesys:
            report["warnings"].append(
                f"WARNING: {m.get('name', m['email'])} aht ({aht}) matches genesysAht — "
                "possible data corruption"
            )
    
    # Floor averages sanity check
    floor_avg = team_data.get("floorAvg", {})
    for k, v in floor_avg.items():
        if v == 0:
            report["warnings"].append(f"Floor average for {k} is 0 — possible data issue")
    
    return report


# ── Supabase Connection ──────────────────────────────────────────────────────────

def _get_supabase_client():
    """Get a Supabase client. Uses service_role key for write access."""
    try:
        from supabase import create_client, Client
    except ImportError:
        # Try installing
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase", "-q"])
        from supabase import create_client, Client
    
    if not SUPABASE_URL:
        raise UpsertError("VITE_SUPABASE_URL is not set — cannot connect to Supabase")
    
    # Use service_role key for writes, fall back to anon key for reads
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    if not key:
        raise UpsertError("No Supabase key available — set VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY")
    
    client: Client = create_client(SUPABASE_URL, key)
    return client


def _check_supabase_health(client) -> bool:
    """Check if Supabase is reachable and the team_metrics table exists."""
    try:
        # Try a simple select — if table doesn't exist, this will fail
        result = client.table("team_metrics").select("id").limit(1).execute()
        return True
    except Exception as e:
        error_str = str(e).lower()
        if "521" in error_str or "paused" in error_str:
            raise UpsertError(
                "Supabase project is PAUSED (HTTP 521). "
                "Go to https://supabase.com/dashboard to unpause it."
            )
        if "does not exist" in error_str or "not found" in error_str:
            raise UpsertError(
                "team_metrics table does not exist. Run the migration SQL in Supabase SQL Editor."
            )
        if "invalid api key" in error_str or "unauthorized" in error_str or "401" in error_str:
            raise UpsertError(
                "Supabase API key is invalid. Check VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY."
            )
        raise UpsertError(f"Supabase health check failed: {e}")


# ── Upsert ───────────────────────────────────────────────────────────────────────

def upsert_team_data(team_data: dict[str, Any], month: str = "") -> dict[str, Any]:
    """
    Upsert validated team data into Supabase team_metrics table.
    
    Args:
        team_data: Validated team data dict with 'members', 'floorAvg', etc.
        month: Month string like "2026-08" or "August 2026"
    
    Returns:
        Result dict with counts and status.
    
    Raises:
        UpsertError: If validation fails or database write fails.
    """
    if not month:
        # Try to derive from team_data
        month = team_data.get("monthLabel", "")
        if not month:
            month = datetime.now(timezone.utc).strftime("%B %Y")
    
    # Step 1: Validate
    report = validate_team_data(team_data)
    
    # Step 2: Connect to Supabase
    client = _get_supabase_client()
    
    # Step 3: Health check
    _check_supabase_health(client)
    
    # Step 4: Prepare upsert records
    fetched_at = team_data.get("fetchedAt", datetime.now(timezone.utc).isoformat())
    source = team_data.get("_meta", {}).get("source", "sheet19")
    
    records = []
    for m in team_data["members"]:
        record = {
            "month": month,
            "agent_email": m["email"],
            "agent_name": m.get("name", ""),
            "csat": m.get("csat"),           # NULL if missing
            "productivity": m.get("productivity"),  # NULL if missing
            "fcr": m.get("fcr"),             # NULL if missing
            "chat_aht": m.get("aht"),        # Average basket time (Chat AHT)
            "genesys_aht": m.get("genesysAht"),   # Always NULL currently
            "chat_handling_time": m.get("chatAht") if m.get("chatAht") != m.get("aht") else None,
            "source": source,
            "fetched_at": fetched_at,
        }
        
        # Optional fields
        for field, key in [
            (m.get("avgGroupBasketTime"), "avg_group_basket_time"),
            (m.get("escalationRate"), "escalation_rate"),
            (m.get("adherence"), "adherence"),
            (m.get("closedAfterResolution"), "closed_after_resolution"),
            (m.get("closedTicketsPct"), "closed_tickets_pct"),
            (m.get("deescalationRate"), "deescalation_rate"),
            (m.get("occupancy"), "occupancy"),
            (m.get("concurrency"), "concurrency"),
            (m.get("irt2Replier"), "irt_replier"),
            (m.get("shrinkage"), "shrinkage"),
            (m.get("utilization"), "utilization"),
            (m.get("breakExceed"), "break_exceed"),
            (m.get("idleTime"), "idle_time"),
        ]:
            if field is not None:
                record[key] = field
        
        records.append(record)
    
    # Step 5: Upsert (insert or update on conflict)
    inserted = 0
    updated = 0
    errors = []
    
    for record in records:
        try:
            # Use upsert with on_conflict for (month, agent_email)
            result = client.table("team_metrics").upsert(
                record,
                on_conflict="month,agent_email",
            ).execute()
            
            # Check if this was an insert or update
            # Supabase returns the record data on success
            if result.data:
                # Check if it's a new record or update
                # We can't easily distinguish, so count all as "processed"
                inserted += 1
            else:
                errors.append(f"No data returned for {record['agent_email']}")
                
        except Exception as e:
            error_str = str(e)
            if "521" in error_str:
                raise UpsertError("Supabase project is PAUSED — cannot write data")
            if "does not exist" in error_str.lower():
                raise UpsertError(
                    "team_metrics table does not exist — run migration SQL first"
                )
            errors.append(f"{record['agent_email']}: {error_str}")
    
    result = {
        "success": len(errors) == 0,
        "month": month,
        "total_records": len(records),
        "inserted_or_updated": inserted,
        "errors": errors,
        "validation": report,
        "source": source,
        "fetched_at": fetched_at,
    }
    
    return result


def read_team_data(month: str = "") -> list[dict[str, Any]]:
    """
    Read team data from Supabase. Uses anon key (public read access).
    
    Args:
        month: Month filter like "2026-08" or "August 2026". If empty, returns latest.
    
    Returns:
        List of team_metrics records.
    """
    if not SUPABASE_URL:
        raise UpsertError("VITE_SUPABASE_URL is not set")
    
    key = SUPABASE_ANON_KEY
    if not key:
        raise UpsertError("VITE_SUPABASE_ANON_KEY is not set")
    
    try:
        from supabase import create_client, Client
    except ImportError:
        raise UpsertError("supabase package not installed")
    
    client: Client = create_client(SUPABASE_URL, key)
    
    query = client.table("team_metrics").select("*")
    
    if month:
        query = query.eq("month", month)
    
    result = query.order("agent_name").execute()
    
    return result.data if result.data else []


# ── CLI ──────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Green Tab Supabase Upsert")
    parser.add_argument("--json", help="Path to team-data.json to upload")
    parser.add_argument("--month", help="Month label (e.g., 'August 2026')")
    parser.add_argument("--check", action="store_true", help="Check Supabase connectivity")
    parser.add_argument("--read", action="store_true", help="Read team data from Supabase")
    args = parser.parse_args()
    
    if args.check:
        print("Checking Supabase connectivity...")
        try:
            client = _get_supabase_client()
            _check_supabase_health(client)
            print("✅ Supabase is reachable and team_metrics table exists!")
        except UpsertError as e:
            print(f"❌ {e}")
        sys.exit(0)
    
    if args.read:
        print("Reading team data from Supabase...")
        try:
            data = read_team_data(args.month)
            print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
            print(f"\n✅ Read {len(data)} records")
        except UpsertError as e:
            print(f"❌ {e}")
        sys.exit(0)
    
    if args.json:
        print(f"Loading {args.json}...")
        with open(args.json) as f:
            team_data = json.load(f)
        
        print(f"Validating {len(team_data.get('members', []))} members...")
        try:
            result = upsert_team_data(team_data, month=args.month)
            print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
        except UpsertError as e:
            print(f"❌ {e}")
            sys.exit(1)
    else:
        parser.print_help()