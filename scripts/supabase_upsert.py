#!/usr/bin/env python3
"""
Green Tab — Supabase Upsert Module (v2)

Uploads validated data from EXACTLY TWO sources to Supabase:
1. Team Scores → team_metrics table
2. KSCAT Calc → kscat_data table

Uses the service_role key for write access (anon key has read-only access).

CRITICAL:
- chat_aht = "Average basket time" from Team Scores — NEVER from "Genesys Inbound AHT + ACW"
- Missing values must remain NULL — never substitute 0
- Validation must pass before any database write
- If extraction returns 0 members or malformed data, abort the write
- NO fallback to other tabs/sheets

Usage:
    from supabase_upsert import upsert_team_data, upsert_kscat_data, create_kscat_table
    result = upsert_team_data(team_data, month="August 2026")
    result = upsert_kscat_data(kscat_data, month="August 2026")
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

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "") or os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


# ── Error Classes ──────────────────────────────────────────────────────────────

class UpsertError(Exception):
    """Raised when upsert fails validation or execution."""
    pass


# ── Supabase Connection ──────────────────────────────────────────────────────────

def _get_supabase_client():
    """Get a Supabase client. Uses service_role key for write access."""
    try:
        from supabase import create_client, Client
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase", "-q"])
        from supabase import create_client, Client

    if not SUPABASE_URL:
        raise UpsertError("SUPABASE_URL is not set — cannot connect to Supabase")

    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    if not key:
        raise UpsertError("No Supabase key available — set SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY")

    client: Client = create_client(SUPABASE_URL, key)
    return client


def _check_supabase_health(client) -> bool:
    """Check if Supabase is reachable and the team_metrics table exists."""
    try:
        result = client.table("team_metrics").select("id").limit(1).execute()
        return True
    except Exception as e:
        error_str = str(e).lower()
        if "521" in error_str or "paused" in error_str:
            raise UpsertError(
                "Supabase project is PAUSED (HTTP 521). "
                "Go to https://supabase.com/dashboard to unpause it."
            )
        if "does not exist" in error_str or "not found" in error_str or "could not find" in error_str:
            raise UpsertError(
                "team_metrics table does not exist. Run the migration SQL in Supabase SQL Editor."
            )
        if "invalid api key" in error_str or "unauthorized" in error_str or "401" in error_str:
            raise UpsertError(
                "Supabase API key is invalid. Check SUPABASE_SERVICE_ROLE_KEY."
            )
        raise UpsertError(f"Supabase health check failed: {e}")


# ── Create kscat_data table ─────────────────────────────────────────────────────

KSCAT_CREATE_SQL = """
-- KSCAT/Karma data per agent per month (from KSCAT Calc tab, range P1:X15)
CREATE TABLE IF NOT EXISTS kscat_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month TEXT NOT NULL,
    agent_email TEXT NOT NULL,
    agent_name TEXT,
    csat_count NUMERIC,
    kscat_count NUMERIC,
    dsat_count NUMERIC,
    total_count NUMERIC,
    total_without_karma NUMERIC,
    kscat_pct NUMERIC,
    csat_pct NUMERIC,
    variance NUMERIC,
    source TEXT DEFAULT 'KSCAT Calc',
    fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month, agent_email)
);

-- RLS policies
ALTER TABLE kscat_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kscat_data_read_all" ON kscat_data
    FOR SELECT USING (true);

CREATE POLICY "kscat_data_service_write" ON kscat_data
    FOR ALL USING (auth.role() = 'service_role');
"""


def create_kscat_table(client=None) -> dict[str, Any]:
    """
    Create the kscat_data table in Supabase using the service_role key.
    This should be run once during setup.
    """
    if not client:
        client = _get_supabase_client()

    # Use the Supabase REST API to execute SQL via rpc
    # Since we can't execute arbitrary SQL via REST, we'll check if the table exists
    # and provide the SQL for manual execution
    try:
        result = client.table("kscat_data").select("id").limit(1).execute()
        return {"exists": True, "message": "kscat_data table already exists"}
    except Exception:
        return {
            "exists": False,
            "message": "kscat_data table does not exist. Run this SQL in Supabase SQL Editor:",
            "sql": KSCAT_CREATE_SQL.strip(),
        }


# ── Validation ──────────────────────────────────────────────────────────────────

def validate_team_data(team_data: dict[str, Any]) -> dict[str, Any]:
    """Validate team data before any database write."""
    members = team_data.get("members", [])

    if not members:
        raise UpsertError(
            "Extraction returned 0 members — aborting database write to prevent data loss"
        )

    report = {
        "total_members": len(members),
        "source": team_data.get("_meta", {}).get("source", "unknown"),
        "gid": team_data.get("_meta", {}).get("gid", "unknown"),
        "null_counts": {"csat": 0, "productivity": 0, "fcr": 0, "aht": 0},
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

    if len(members) < 3:
        report["warnings"].append(f"Only {len(members)} members found — expected ~13")

    return report


def validate_kscat_data(kscat_data: dict[str, Any]) -> dict[str, Any]:
    """Validate KSCAT data before any database write."""
    agents = kscat_data.get("agents", [])

    if not agents:
        raise UpsertError(
            "KSCAT Calc extraction returned 0 agents — aborting database write"
        )

    report = {
        "total_agents": len(agents),
        "source": kscat_data.get("_meta", {}).get("source", "unknown"),
        "gid": kscat_data.get("_meta", {}).get("gid", "unknown"),
        "range": kscat_data.get("_meta", {}).get("range", "unknown"),
        "warnings": [],
        "agent_emails": [],
    }

    for a in agents:
        agent = a.get("agent", "")
        if not agent or "@" not in agent:
            report["warnings"].append(f"Non-email agent value: {agent!r}")
        else:
            report["agent_emails"].append(agent)

    return report


# ── Team Metrics Upsert ────────────────────────────────────────────────────────

def upsert_team_data(team_data: dict[str, Any], month: str = "") -> dict[str, Any]:
    """
    Upsert validated team data into Supabase team_metrics table.
    Source: Team Scores tab ONLY.
    """
    if not month:
        month = team_data.get("monthLabel", "")
        if not month:
            month = datetime.now(timezone.utc).strftime("%B %Y")

    # Step 1: Validate
    report = validate_team_data(team_data)

    # Verify source is Team Scores
    source = team_data.get("_meta", {}).get("source", "")
    if source and source != "Team Scores":
        raise UpsertError(
            f"Data source is '{source}', expected 'Team Scores'. "
            "ABORTING — will not write data from wrong source."
        )

    # Step 2: Connect
    client = _get_supabase_client()

    # Step 3: Health check
    _check_supabase_health(client)

    # Step 4: Prepare records
    fetched_at = team_data.get("fetchedAt", datetime.now(timezone.utc).isoformat())

    records = []
    for m in team_data["members"]:
        record = {
            "month": month,
            "agent_email": m["email"],
            "agent_name": m.get("name", ""),
            "csat": m.get("csat"),
            "productivity": m.get("productivity"),
            "fcr": m.get("fcr"),
            "chat_aht": m.get("aht"),
            "source": "Team Scores",
            "fetched_at": fetched_at,
        }

        # Optional fields (only include if non-null)
        for field_val, db_key in [
            (m.get("escalationRate"), "escalation_rate"),
            (m.get("adherence"), "adherence"),
            (m.get("irtReplier"), "irt_replier"),
            (m.get("closedAfterResolution"), "closed_after_resolution"),
            (m.get("breakExceed"), "break_exceed"),
            (m.get("idleTime"), "idle_time"),
            (m.get("deescalationRate"), "deescalation_rate"),
            (m.get("occupancy"), "occupancy"),
            (m.get("avgGroupBasketTime"), "avg_group_basket_time"),
            (m.get("closeRate"), "closed_tickets_pct"),
            (m.get("genesysAht"), "genesys_aht"),
            (m.get("chatAht"), "chat_handling_time"),
        ]:
            if field_val is not None:
                record[db_key] = field_val

        records.append(record)

    # Step 5: Upsert
    inserted = 0
    errors = []

    for record in records:
        try:
            result = client.table("team_metrics").upsert(
                record,
                on_conflict="month,agent_email",
            ).execute()
            if result.data:
                inserted += 1
            else:
                errors.append(f"No data returned for {record['agent_email']}")
        except Exception as e:
            error_str = str(e)
            if "521" in error_str:
                raise UpsertError("Supabase project is PAUSED — cannot write data")
            if "could not find" in error_str.lower() or "does not exist" in error_str.lower():
                raise UpsertError("team_metrics table does not exist — run migration SQL first")
            errors.append(f"{record['agent_email']}: {error_str}")

    return {
        "success": len(errors) == 0,
        "table": "team_metrics",
        "month": month,
        "source": "Team Scores",
        "total_records": len(records),
        "inserted_or_updated": inserted,
        "errors": errors,
        "validation": report,
        "fetched_at": fetched_at,
    }


# ── KSCAT Data Upsert ───────────────────────────────────────────────────────────

def upsert_kscat_data(kscat_data: dict[str, Any], month: str = "") -> dict[str, Any]:
    """
    Upsert validated KSCAT data into Supabase kscat_data table.
    Source: KSCAT Calc tab, range P1:X15 ONLY.
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%B %Y")

    # Step 1: Validate
    report = validate_kscat_data(kscat_data)

    # Verify source is KSCAT Calc
    source = kscat_data.get("_meta", {}).get("source", "")
    if source and source != "KSCAT Calc":
        raise UpsertError(
            f"KSCAT data source is '{source}', expected 'KSCAT Calc'. "
            "ABORTING — will not write data from wrong source."
        )

    # Step 2: Connect
    client = _get_supabase_client()

    # Step 3: Check if kscat_data table exists
    try:
        client.table("kscat_data").select("id").limit(1).execute()
    except Exception as e:
        table_check = create_kscat_table(client)
        if not table_check["exists"]:
            raise UpsertError(
                f"kscat_data table does not exist in Supabase. "
                f"Run the following SQL in Supabase SQL Editor first:\n\n"
                f"{KSCAT_CREATE_SQL.strip()}"
            )

    # Step 4: Prepare records
    fetched_at = kscat_data.get("fetchedAt", datetime.now(timezone.utc).isoformat())

    records = []
    for a in kscat_data["agents"]:
        agent = a.get("agent", "")
        if not agent or "@" not in agent:
            continue  # Skip non-email rows

        record = {
            "month": month,
            "agent_email": agent,
            "csat_count": a.get("csat_count"),
            "kscat_count": a.get("kscat_count"),
            "dsat_count": a.get("dsat_count"),
            "total_count": a.get("total_count"),
            "total_without_karma": a.get("total_without_karma"),
            "kscat_pct": a.get("kscat_pct"),
            "csat_pct": a.get("csat_pct"),
            "variance": a.get("variance"),
            "source": "KSCAT Calc",
            "fetched_at": fetched_at,
        }

        # Derive agent_name from email
        name = agent.split("@")[0].replace(".", " ").replace("_", " ").strip()
        name = re.sub(r'\s+\d+$', '', name).title()  # type: ignore
        record["agent_name"] = name

        records.append(record)

    # Step 5: Upsert
    inserted = 0
    errors = []

    for record in records:
        try:
            result = client.table("kscat_data").upsert(
                record,
                on_conflict="month,agent_email",
            ).execute()
            if result.data:
                inserted += 1
            else:
                errors.append(f"No data returned for {record['agent_email']}")
        except Exception as e:
            error_str = str(e)
            if "521" in error_str:
                raise UpsertError("Supabase project is PAUSED — cannot write data")
            errors.append(f"{record['agent_email']}: {error_str}")

    # Include team_score if present
    team_score = kscat_data.get("team_score")

    return {
        "success": len(errors) == 0,
        "table": "kscat_data",
        "month": month,
        "source": "KSCAT Calc",
        "range": "P1:X15",
        "total_records": len(records),
        "inserted_or_updated": inserted,
        "errors": errors,
        "validation": report,
        "team_score": team_score,
        "fetched_at": fetched_at,
    }


# ── Read helpers ──────────────────────────────────────────────────────────────────

def read_team_data(month: str = "") -> list[dict[str, Any]]:
    """Read team data from Supabase. Uses anon key (public read access)."""
    if not SUPABASE_URL:
        raise UpsertError("SUPABASE_URL is not set")

    key = SUPABASE_ANON_KEY
    if not key:
        raise UpsertError("VITE_SUPABASE_ANON_KEY is not set")

    from supabase import create_client, Client
    client: Client = create_client(SUPABASE_URL, key)

    query = client.table("team_metrics").select("*")
    if month:
        query = query.eq("month", month)

    result = query.order("agent_name").execute()
    return result.data if result.data else []


def read_kscat_data(month: str = "") -> list[dict[str, Any]]:
    """Read KSCAT data from Supabase. Uses anon key (public read access)."""
    if not SUPABASE_URL:
        raise UpsertError("SUPABASE_URL is not set")

    key = SUPABASE_ANON_KEY
    if not key:
        raise UpsertError("VITE_SUPABASE_ANON_KEY is not set")

    from supabase import create_client, Client
    client: Client = create_client(SUPABASE_URL, key)

    query = client.table("kscat_data").select("*")
    if month:
        query = query.eq("month", month)

    result = query.order("agent_email").execute()
    return result.data if result.data else []


# Need re import for name derivation
import re

# ── CLI ──────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Green Tab Supabase Upsert")
    parser.add_argument("--json", help="Path to team-data.json to upload")
    parser.add_argument("--kscat-json", help="Path to kscat-data.json to upload")
    parser.add_argument("--month", help="Month label (e.g., 'August 2026')")
    parser.add_argument("--check", action="store_true", help="Check Supabase connectivity")
    parser.add_argument("--create-kscat", action="store_true", help="Check/create kscat_data table")
    parser.add_argument("--read", action="store_true", help="Read team data from Supabase")
    parser.add_argument("--read-kscat", action="store_true", help="Read KSCAT data from Supabase")
    args = parser.parse_args()

    if args.check:
        print("Checking Supabase connectivity...")
        try:
            client = _get_supabase_client()
            _check_supabase_health(client)
            print("✅ Supabase is reachable and team_metrics table exists!")
            kscat_check = create_kscat_table(client)
            if kscat_check["exists"]:
                print("✅ kscat_data table exists!")
            else:
                print("⚠️  kscat_data table does NOT exist.")
                print("Run this SQL in Supabase SQL Editor:")
                print(kscat_check["sql"])
        except UpsertError as e:
            print(f"❌ {e}")
        sys.exit(0)

    if args.create_kscat:
        print("Checking kscat_data table...")
        try:
            client = _get_supabase_client()
            kscat_check = create_kscat_table(client)
            if kscat_check["exists"]:
                print("✅ kscat_data table already exists!")
            else:
                print("⚠️  kscat_data table does NOT exist.")
                print("Run this SQL in Supabase SQL Editor:")
                print(kscat_check["sql"])
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

    if args.read_kscat:
        print("Reading KSCAT data from Supabase...")
        try:
            data = read_kscat_data(args.month)
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

    if args.kscat_json:
        print(f"Loading {args.kscat_json}...")
        with open(args.kscat_json) as f:
            kscat_data = json.load(f)

        print(f"Validating {len(kscat_data.get('agents', []))} agents...")
        try:
            result = upsert_kscat_data(kscat_data, month=args.month)
            print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
        except UpsertError as e:
            print(f"❌ {e}")
            sys.exit(1)

    if not any([args.json, args.kscat_json, args.check, args.create_kscat, args.read, args.read_kscat]):
        parser.print_help()