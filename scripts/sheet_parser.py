#!/usr/bin/env python3
"""
Green Tab — Google Sheet TSV/CSV Parser & Validator

Standalone parser that validates extracted data BEFORE submission.
No browser dependency. No network dependency. No auth dependency.

Two source tabs are supported:

PRIMARY: Sheet19 (gid=1066657646) — vertical/metric-per-row format
  - Each agent has 20 rows (one per metric)
  - Columns: [Ops Manager] [Team Lead] [Agent Email] [Metric Name] [Value]
  - Contains Chat AHT ("Average handling time") which Tab 0 lacks

SECONDARY: Tab 0 "Team Scores" (gid=87009911) — horizontal table format
  - Table 1: Agent Email | CSAT % | Productivity | ... | FCR %
  - Table 2: Agent Email | ... | Genesys Inbound AHT + ACW (EMPTY)

The parser auto-detects which format is being parsed and handles both.

Usage:
    from sheet_parser import parse_tsv, parse_csv, validate_team_data

    rows = parse_tsv(raw_clipboard_text)
    data = validate_team_data(rows)
"""

import csv
import io
import re
from datetime import datetime
from typing import Any


# ── Error Classes ────────────────────────────────────────────────────────────────

class ValidationError(Exception):
    """Raised when extracted data fails validation."""
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details = details or {}


# ── Parsers ──────────────────────────────────────────────────────────────────────

def parse_tsv(text: str) -> list[list[str]]:
    """Parse tab-separated values from Google Sheets clipboard."""
    if not text or not text.strip():
        raise ValidationError("Empty TSV input", {"length": 0})

    lines = text.split("\n")
    rows: list[list[str]] = []
    for line in lines:
        cells = line.split("\t")
        cells = [c.strip() for c in cells]
        if any(c for c in cells):
            rows.append(cells)
    return rows


def parse_csv(text: str) -> list[list[str]]:
    """Parse CSV from Google Sheets download."""
    if not text or not text.strip():
        raise ValidationError("Empty CSV input", {"length": 0})

    reader = csv.reader(io.StringIO(text))
    rows: list[list[str]] = []
    for row in reader:
        cells = [c.strip() for c in row]
        if any(c for c in cells):
            rows.append(cells)
    return rows


# ── Numeric Helpers ───────────────────────────────────────────────────────────────

def parse_num(val: str) -> float | None:
    """Parse a numeric value from a spreadsheet cell. Returns None for blanks/specials."""
    if not val or val.strip() in ("", "-", "N/A", "—", "–", "#N/A", "#REF!", "#DIV/0!"):
        return None
    cleaned = val.strip().replace("%", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_percent(val: str) -> float | None:
    """Parse a percentage value, returning the numeric value (e.g., '67%' → 67.0)."""
    if not val or val.strip() in ("", "-", "N/A", "—", "–", "#N/A", "#REF!", "#DIV/0!"):
        return None
    cleaned = val.strip().replace("%", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_time_to_minutes(val: str) -> float | None:
    """Parse a time value like '0:02:00' or '2:50:00' to minutes."""
    if not val or val.strip() in ("", "-", "N/A", "—", "–", "#N/A", "#REF!", "#DIV/0!"):
        return None
    val = val.strip()
    m = re.match(r'^(\d+):(\d{2}):(\d{2})$', val)
    if m:
        hours, minutes, seconds = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return round(hours * 60 + minutes + seconds / 60, 1)
    try:
        return float(val)
    except ValueError:
        return None


# ── Detection ─────────────────────────────────────────────────────────────────────

def _detect_format(rows: list[list[str]]) -> str:
    """
    Detect whether rows are from Sheet19 (vertical) or Tab 0 (horizontal).
    
    Sheet19 has: rows like "Total | Team Lead | email | Metric Name | value"
    Tab 0 has: header rows like "Agent's Email | CSAT | CSAT | Productivity 8-hrs | ..."
    """
    for row in rows[:30]:
        joined = " ".join(row).lower()
        # Sheet19 vertical format: metric names as row values
        if "average handling time" in joined or "average basket time" in joined:
            if "total" in joined and "@" in joined:
                return "vertical"  # Sheet19 format
        # Tab 0 horizontal format: column headers
        if "agent's email" in joined and ("csat" in joined or "productivity" in joined):
            return "horizontal"  # Tab 0 format
    
    # Default: try vertical (Sheet19) format
    return "vertical"


# ── Vertical Format Parser (Sheet19) ─────────────────────────────────────────────

def _parse_vertical(rows: list[list[str]], name_map: dict[str, str] | None = None) -> dict[str, Any]:
    """
    Parse Sheet19 vertical format: each row is (Ops Manager, Team Lead, Email, Metric, Value, ...).
    
    Each agent has ~20 rows, one per metric. We pivot these into per-agent records.
    """
    if name_map is None:
        name_map = {}
    
    # Metric name → Green Tab field mapping
    METRIC_MAP = {
        "csat adjusted with calls, %": "csat",
        "csat adjusted with calls,%": "csat",
        "productivity 8-hrs": "productivity",
        "productivity 8-hrs": "productivity",
        "fcr, %": "fcr",
        "fcr,%": "fcr",
        "average handling time": "chatAht",
        "genesys inbound aht + acw": "genesysAht",
        "average basket time": "avgBasketTime",
        "average group basket time": "avgGroupBasketTime",
        "escalation rate %": "escalationRate",
        "escalation rate%": "escalationRate",
        "adherence, %": "adherence",
        "adherence,%": "adherence",
        "closed after resolution, %": "closedAfterResolution",
        "closed tickets, %": "closedTicketsPct",
        "deescalation rate %": "deescalationRate",
        "deescalation rate%": "deescalationRate",
        "irt 2 replier": "irt2Replier",
        "occupancy daily, %": "occupancy",
        "occupancy daily,%": "occupancy",
        "concurrency": "concurrency",
        "shrinkage - agent - unplanned": "shrinkage",
        "utilization daily, %": "utilization",
        "utilization daily,%": "utilization",
        "basket touched tickets": "basketTouchedTickets",
        "csat adjusted - total scores": "csatRawScore",
        "closed tickets": "closedTickets",
    }
    
    # Collect per-agent metrics
    agent_data: dict[str, dict[str, Any]] = {}
    skip_emails = {"", "total", "team score", "average"}
    
    for row in rows:
        if len(row) < 4:
            continue
        
        # Find the email column (contains @)
        email = ""
        email_col = -1
        for j, cell in enumerate(row):
            if "@" in cell and cell.strip() not in skip_emails:
                email = cell.strip()
                email_col = j
                break
        
        if not email or email.lower() in skip_emails:
            continue
        
        metric_name = row[3].strip().lower() if len(row) > 3 else ""
        value_str = row[4].strip() if len(row) > 4 else ""
        
        # Also check right-side mirror columns (cols 7-11)
        if not value_str and len(row) > 11:
            value_str = row[11].strip()
        
        field = METRIC_MAP.get(metric_name)
        if not field:
            continue
        
        key = email.lower()
        if key not in agent_data:
            name = name_map.get(key, email.split("@")[0].replace(".", " ").replace("_", " ").strip())
            name = re.sub(r'\s+\d+$', '', name).title()
            agent_data[key] = {"email": email, "name": name}
        
        # Parse value based on field type
        if field in ("csat", "fcr", "escalationRate", "adherence", "closedAfterResolution",
                     "closedTicketsPct", "deescalationRate", "occupancy", "utilization", "shrinkage"):
            agent_data[key][field] = parse_percent(value_str)
        elif field in ("chatAht", "avgBasketTime", "avgGroupBasketTime", "irt2Replier",
                       "concurrency", "productivity"):
            agent_data[key][field] = parse_num(value_str)
        elif field == "genesysAht":
            agent_data[key][field] = parse_time_to_minutes(value_str) if value_str else None
        elif field in ("basketTouchedTickets", "csatRawScore", "closedTickets"):
            agent_data[key][field] = parse_num(value_str)
        else:
            agent_data[key][field] = value_str
    
    # Build output
    members: list[dict[str, Any]] = []
    csat_vals: list[float] = []
    prod_vals: list[float] = []
    fcr_vals: list[float] = []
    aht_vals: list[float] = []
    
    for key, data in agent_data.items():
        csat = data.get("csat")
        productivity = data.get("productivity")
        fcr = data.get("fcr")
        chat_aht = data.get("chatAht")
        genesys_aht = data.get("genesysAht")
        
        # For the Green Tab `aht` field: use Chat AHT
        # (Genesys AHT is stored separately if available)
        aht = chat_aht
        
        scores = [v for v in [csat, productivity, fcr] if v is not None]
        overall = round(sum(scores) / len(scores), 1) if scores else None
        
        if csat is not None:
            csat_vals.append(csat)
        if productivity is not None:
            prod_vals.append(productivity)
        if fcr is not None:
            fcr_vals.append(fcr)
        if aht is not None:
            aht_vals.append(aht)
        
        members.append({
            "name": data["name"],
            "email": data["email"],
            "csat": csat,
            "productivity": productivity,
            "fcr": fcr,
            "aht": aht,
            "chatAht": chat_aht,
            "genesysAht": genesys_aht,
            "overallScore": overall,
        })
    
    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0
    
    floor_avg = {
        "csat": avg(csat_vals),
        "productivity": avg(prod_vals),
        "fcr": avg(fcr_vals),
        "aht": avg(aht_vals),
    }
    
    members.sort(key=lambda m: m.get("overallScore") or 0, reverse=True)
    
    # Detect month label from header row (row 0 has date)
    month_label = ""
    for row in rows[:3]:
        for cell in row:
            m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", cell)
            if m:
                day, month_num, year = m.group(1), m.group(2), m.group(3)
                month_names = {
                    "1": "January", "2": "February", "3": "March", "4": "April",
                    "5": "May", "6": "June", "7": "July", "8": "August",
                    "9": "September", "10": "October", "11": "November", "12": "December",
                }
                month_name = month_names.get(month_num.lstrip("0"), "")
                year_full = f"20{year}" if len(year) == 2 else year
                month_label = f"{month_name} {year_full}"
                break
        if month_label:
            break
    
    return {
        "members": members,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "monthLabel": month_label,
        "floorAvg": floor_avg,
        "_meta": {
            "format": "vertical",
            "total_rows_raw": len(rows),
            "members_found": len(members),
            "source": "Sheet19",
        },
    }


# ── Horizontal Format Parser (Tab 0) ─────────────────────────────────────────────

def _parse_horizontal(rows: list[list[str]], name_map: dict[str, str] | None = None) -> dict[str, Any]:
    """
    Parse Tab 0 "Team Scores" horizontal format:
    - Table 1: Agent Email | CSAT | CSAT | Productivity | ... | FCR % | Closed after resolution %
    - Table 2: Agent Email | Tardy | Break Exceed | Idle Time | Genesys AHT | ...
    """
    if name_map is None:
        name_map = {}
    
    # Find Table 1 header
    table1_header = -1
    for i, row in enumerate(rows):
        joined = " ".join(row).lower()
        if "agent" in joined and ("csat" in joined or "productivity" in joined):
            table1_header = i
            break
    
    if table1_header == -1:
        raise ValidationError("No 'Agent' + 'CSAT/Productivity' header row found")
    
    headers1 = rows[table1_header]
    email1_col = _find_col(headers1, ["agent's email", "agent email", "email"])
    csat_pct_col = _find_col(headers1, ["csat"])
    # Find second CSAT column (percentage, not raw score)
    for i, h in enumerate(headers1):
        if "csat" in h.lower() and i != csat_pct_col:
            csat_pct_col = i
            break
    prod_col = _find_col(headers1, ["productivity", "prod"])
    fcr_col = _find_col(headers1, ["fcr", "first call resolution"])
    
    # Find Table 2 header
    table2_header = -1
    for i in range(table1_header + 1, len(rows)):
        joined = " ".join(rows[i]).lower()
        if "agent" in joined and ("aht" in joined or "genesys" in joined):
            table2_header = i
            break
    
    # Parse Table 1
    member_map: dict[str, dict[str, Any]] = {}
    csat_vals: list[float] = []
    prod_vals: list[float] = []
    fcr_vals: list[float] = []
    
    skip_names = {"team score", "average", "total", "floor", ""}
    data1_end = table2_header if table2_header != -1 else len(rows)
    
    for i in range(table1_header + 1, data1_end):
        row = rows[i] if i < len(rows) else []
        if len(row) < 2:
            continue
        email = row[email1_col] if email1_col != -1 and email1_col < len(row) else ""
        if not email or email.lower().strip() in skip_names:
            continue
        
        name = name_map.get(email.lower(), "")
        if not name:
            name = email.split("@")[0].replace(".", " ").replace("_", " ").strip()
            name = re.sub(r'\s+\d+$', '', name).title()
        
        csat = parse_percent(row[csat_pct_col]) if csat_pct_col != -1 and csat_pct_col < len(row) else None
        productivity = parse_num(row[prod_col]) if prod_col != -1 and prod_col < len(row) else None
        fcr = parse_percent(row[fcr_col]) if fcr_col != -1 and fcr_col < len(row) else None
        
        key = email.lower()
        member_map[key] = {"name": name, "email": email, "csat": csat, "productivity": productivity, "fcr": fcr}
        if csat is not None:
            csat_vals.append(csat)
        if productivity is not None:
            prod_vals.append(productivity)
        if fcr is not None:
            fcr_vals.append(fcr)
    
    # Parse Table 2 (AHT)
    aht_vals: list[float] = []
    if table2_header != -1 and table2_header < len(rows):
        headers2 = rows[table2_header]
        email2_col = _find_col(headers2, ["agent's email", "agent email", "email"])
        aht_col = _find_col(headers2, ["genesys inbound aht", "aht", "average handling time"])
        
        for i in range(table2_header + 1, len(rows)):
            row = rows[i] if i < len(rows) else []
            if len(row) < 2:
                continue
            email = row[email2_col] if email2_col != -1 and email2_col < len(row) else ""
            if not email or email.lower().strip() in skip_names:
                continue
            aht = parse_time_to_minutes(row[aht_col]) if aht_col != -1 and aht_col < len(row) else None
            # Also check for Chat AHT in "Average handling time"
            chat_aht_col = _find_col(headers2, ["average handling time"])
            chat_aht = parse_num(row[chat_aht_col]) if chat_aht_col != -1 and chat_aht_col < len(row) else None
            
            key = email.lower()
            if key in member_map:
                if aht is not None:
                    member_map[key]["genesysAht"] = aht
                    aht_vals.append(aht)
                if chat_aht is not None:
                    member_map[key]["chatAht"] = chat_aht
                    if aht is None:
                        member_map[key]["aht"] = chat_aht
                        aht_vals.append(chat_aht)
            else:
                name = name_map.get(key, email.split("@")[0].replace(".", " ").replace("_", " ").strip())
                name = re.sub(r'\s+\d+$', '', name).title()
                member_map[key] = {"name": name, "email": email, "csat": None, "productivity": None, "fcr": None, "aht": chat_aht}
    
    # Build output
    members: list[dict[str, Any]] = []
    for key, d in member_map.items():
        aht = d.get("aht")
        scores = [v for v in [d.get("csat"), d.get("productivity"), d.get("fcr")] if v is not None]
        overall = round(sum(scores) / len(scores), 1) if scores else None
        members.append({
            "name": d["name"], "email": d.get("email", ""),
            "csat": d.get("csat"), "productivity": d.get("productivity"),
            "fcr": d.get("fcr"), "aht": aht,
            "chatAht": d.get("chatAht"), "genesysAht": d.get("genesysAht"),
            "overallScore": overall,
        })
    
    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0
    
    floor_avg = {
        "csat": avg(csat_vals),
        "productivity": avg(prod_vals),
        "fcr": avg(fcr_vals),
        "aht": avg(aht_vals),
    }
    
    members.sort(key=lambda m: m.get("overallScore") or 0, reverse=True)
    
    # Detect month label
    month_label = ""
    for i in range(min(5, len(rows))):
        text = " ".join(rows[i])
        m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}", text, re.I)
        if m:
            month_label = m.group(0)
            break
    
    return {
        "members": members,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "monthLabel": month_label,
        "floorAvg": floor_avg,
        "_meta": {
            "format": "horizontal",
            "total_rows_raw": len(rows),
            "members_found": len(members),
            "source": "Tab0",
        },
    }


def _find_col(headers: list[str], keywords: list[str]) -> int:
    """Find a column by any of several keywords. Case-insensitive partial match."""
    for keyword in keywords:
        kw = keyword.lower()
        for i, h in enumerate(headers):
            if kw in h.lower():
                return i
    return -1


# ── Main Validator ────────────────────────────────────────────────────────────────

def validate_team_data(rows: list[list[str]], name_map: dict[str, str] | None = None) -> dict[str, Any]:
    """
    Validate extracted rows and produce the team data structure.
    Auto-detects Sheet19 (vertical) or Tab 0 (horizontal) format.
    """
    if not rows:
        raise ValidationError("No rows to validate", {"row_count": 0})
    
    # Check for login/redirect contamination
    full_text = " ".join(" ".join(r) for r in rows[:10]).lower()
    login_indicators = ["sign in", "sign-in", "log in", "login", "accounts.google.com",
                        "authenticate", "access denied", "forbidden", "not authorized"]
    for indicator in login_indicators:
        if indicator in full_text:
            raise ValidationError(
                "Data appears to be a login/redirect page, not spreadsheet data",
                {"indicator": indicator, "preview": full_text[:200]})
    
    # Detect format and parse accordingly
    fmt = _detect_format(rows)
    
    if fmt == "vertical":
        return _parse_vertical(rows, name_map)
    else:
        return _parse_horizontal(rows, name_map)