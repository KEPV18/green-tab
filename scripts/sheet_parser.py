#!/usr/bin/env python3
"""
Green Tab — Google Sheet TSV/CSV Parser & Validator

Standalone parser that validates extracted data BEFORE submission.
No browser dependency. No network dependency. No auth dependency.

Input:  Raw TSV (from clipboard) or CSV (from download)
Output: Validated team data dict, or raises ValidationError

The Google Sheet "Team Scores" tab (gid=87009911) has this structure:

    Rows 1-15: Bamboo ID / agent info header section
    Row ~16: blank separator
    Row ~17: Table 1 header: Agent's Email, CSAT, CSAT, Productivity 8-hrs, Escalation rate %, ...
    Row ~18+: Table 1 data (per-agent CSAT, Productivity, FCR, etc.)
    Last data row: "Team Score" (floor average)
    After blank: Table 2 header: Agent's Email, ..., AHT, ...
    Table 2 data (per-agent AHT, etc.)

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


# ── Numeric Helper ────────────────────────────────────────────────────────────────

def parse_num(val: str) -> float | None:
    """Parse a numeric value from a spreadsheet cell. Returns None for blanks/specials."""
    if not val or val.strip() in ("", "-", "N/A", "—", "–", "#N/A", "#REF!", "#DIV/0!"):
        return None
    cleaned = val.strip().replace("%", "").replace("s", "").replace(",", "")
    # Handle time values like "0:02:00" → convert to seconds
    if re.match(r'^\d+:\d{2}:\d{2}$', cleaned):
        parts = cleaned.split(":")
        try:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        except (ValueError, IndexError):
            return None
    # Handle "0:50:00" format
    if re.match(r'^\d+:\d{2}:\d{2}$', cleaned):
        parts = cleaned.split(":")
        try:
            return float(int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]))
        except (ValueError, IndexError):
            return None
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
    if not val or val.strip() in ("", "-", "N/A", "—", "–"):
        return None
    val = val.strip()
    # Handle HH:MM:SS format
    m = re.match(r'^(\d+):(\d{2}):(\d{2})$', val)
    if m:
        hours, minutes, seconds = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return round(hours * 60 + minutes + seconds / 60, 1)
    # Handle plain number
    try:
        return float(val)
    except ValueError:
        return None


def find_col(headers: list[str], keywords: list[str]) -> int:
    """Find a column by any of several keywords. Case-insensitive partial match."""
    for keyword in keywords:
        kw = keyword.lower()
        for i, h in enumerate(headers):
            if kw in h.lower():
                return i
    return -1


# ── Validators ────────────────────────────────────────────────────────────────────

def validate_team_data(rows: list[list[str]]) -> dict[str, Any]:
    """
    Validate extracted rows and produce the team data structure.

    The "Team Scores" tab has this layout:
    - First section: Bamboo ID data (skip it)
    - Second section (after "Agent's Email" header): CSAT/Productivity/FCR table
    - Third section (after second "Agent's Email" header): AHT table

    Raises ValidationError if data fails validation.
    """
    if not rows:
        raise ValidationError("No rows to validate", {"row_count": 0})

    # ── Check for login/redirect contamination ──
    full_text = " ".join(" ".join(r) for r in rows[:10]).lower()
    login_indicators = [
        "sign in", "sign-in", "log in", "login", "accounts.google.com",
        "authenticate", "access denied", "forbidden", "not authorized",
    ]
    for indicator in login_indicators:
        if indicator in full_text:
            raise ValidationError(
                "Data appears to be a login/redirect page, not spreadsheet data",
                {"indicator": indicator, "preview": full_text[:200]},
            )

    # ── Extract name mapping from Bamboo ID section (if present) ──
    # The first section of the Team Scores tab has: Bamboo ID, Queue, Email, ID_Name, Batch, Citrix user
    # Use ID_Name as the display name for each email
    name_map: dict[str, str] = {}  # email -> display name
    email_col_idx = -1
    name_col_idx = -1
    
    # Find the Bamboo ID header row (first row with "Email" and "ID_Name" or "Name")
    for i, row in enumerate(rows[:min(15, len(rows))]):
        joined = " ".join(row).lower()
        if "bamboo" in joined or ("email" in joined and "id_name" in joined) or ("email" in joined and "name" in joined and "batch" in joined):
            # This is the Bamboo ID header row
            for j, cell in enumerate(row):
                cell_lower = cell.lower().strip()
                if cell_lower in ("email", "agent's email", "agent email"):
                    email_col_idx = j
                if cell_lower in ("id_name", "name", "agent"):
                    name_col_idx = j
            # If we found both columns, extract the name mapping
            if email_col_idx != -1 and name_col_idx != -1:
                for row in rows[i+1:min(i+20, len(rows))]:
                    if len(row) > max(email_col_idx, name_col_idx):
                        email_val = row[email_col_idx].strip()
                        name_val = row[name_col_idx].strip()
                        if email_val and name_val and "@" in email_val and email_val.lower() not in ("", "team score", "average", "total"):
                            name_map[email_val.lower()] = name_val
            break
    
    # ── Find the two table sections ──
    # Table 1 header: "Agent's Email" ... "CSAT" ... "Productivity" ... "FCR"
    # Table 2 header: "Agent's Email" ... "AHT" or "Genesys Inbound AHT"
    
    table1_header = -1
    table2_header = -1

    for i, row in enumerate(rows):
        joined = " ".join(row).lower()
        if table1_header == -1 and "agent" in joined and ("csat" in joined or "productivity" in joined):
            table1_header = i
        if table1_header != -1 and i > table1_header and "agent" in joined and ("aht" in joined or "genesys inbound aht" in joined):
            table2_header = i
            break

    if table1_header == -1:
        raise ValidationError(
            "No 'Agent' + 'CSAT/Productivity' header row found",
            {"first_rows": [r[:5] for r in rows[:5]]},
        )

    # ── Parse Table 1: CSAT, Productivity, FCR ──
    headers1 = rows[table1_header]
    
    email1_col = find_col(headers1, ["agent's email", "agent email", "email"])
    csat_score_col = find_col(headers1, ["csat"])  # First CSAT column = score count
    csat_pct_col = -1
    # Find the second CSAT column (percentage)
    for i, h in enumerate(headers1):
        if "csat" in h.lower() and i != csat_score_col:
            csat_pct_col = i
            break
    prod_col = find_col(headers1, ["productivity", "prod"])
    fcr_col = find_col(headers1, ["fcr", "first call resolution"])

    # If csat_score_col and csat_pct_col are the same, we might have only one CSAT column
    # In that case, the percentage might be in a different column
    if csat_pct_col == -1 and csat_score_col != -1:
        # Try to find a percentage CSAT column
        for i, h in enumerate(headers1):
            if "csat" in h.lower() and i != csat_score_col:
                csat_pct_col = i
                break
    
    # Fallback: if no percentage column, use the CSAT column itself
    if csat_pct_col == -1:
        csat_pct_col = csat_score_col + 1 if csat_score_col != -1 else -1

    # Column mapping debug
    # (removed debug print)

    member_map: dict[str, dict[str, Any]] = {}
    csat_vals: list[float] = []
    prod_vals: list[float] = []
    fcr_vals: list[float] = []

    skip_names = {"team score", "average", "total", "floor", "floor average", ""}
    data1_start = table1_header + 1
    data1_end = table2_header if table2_header != -1 else len(rows)

    for i in range(data1_start, data1_end):
        row = rows[i] if i < len(rows) else []
        if len(row) < 2:
            continue
        
        email = row[email1_col] if email1_col != -1 and email1_col < len(row) else ""
        if not email or email.lower().strip() in skip_names:
            continue
        
        # Derive name from Bamboo ID mapping or email
        name = name_map.get(email.lower(), "")
        if not name:
            name = email.split("@")[0] if "@" in email else email
            name = name.replace(".", " ").replace("_", " ").strip()
            name = re.sub(r'\s+\d+$', '', name)
            name = name.title()
        
        csat_pct = parse_percent(row[csat_pct_col]) if csat_pct_col != -1 and csat_pct_col < len(row) else None
        productivity = parse_num(row[prod_col]) if prod_col != -1 and prod_col < len(row) else None
        fcr = parse_percent(row[fcr_col]) if fcr_col != -1 and fcr_col < len(row) else None
        
        # Skip "Team Score" summary row
        if email.lower().strip() == "team score":
            # This row has floor averages
            continue

        key = email.lower()
        member_map[key] = {
            "name": name, "email": email,
            "csat": csat_pct, "productivity": productivity, "fcr": fcr,
        }
        if csat_pct is not None:
            csat_vals.append(csat_pct)
        if productivity is not None:
            prod_vals.append(productivity)
        if fcr is not None:
            fcr_vals.append(fcr)

    # ── Parse Table 2: AHT ──
    aht_vals: list[float] = []

    if table2_header != -1 and table2_header < len(rows):
        headers2 = rows[table2_header]
        email2_col = find_col(headers2, ["agent's email", "agent email", "email"])
        aht_col = find_col(headers2, ["genesys inbound aht", "aht", "average handling time", "handling time"])

        # Table 2 column mapping
        # (removed debug print)

        for i in range(table2_header + 1, len(rows)):
            row = rows[i] if i < len(rows) else []
            if len(row) < 2:
                continue
            
            email = row[email2_col] if email2_col != -1 and email2_col < len(row) else ""
            if not email or email.lower().strip() in skip_names:
                continue
            
            aht = parse_num(row[aht_col]) if aht_col != -1 and aht_col < len(row) else None
            # AHT might be in minutes, convert from seconds if > 100
            if aht is not None and aht > 100:
                aht = round(aht / 60, 1)  # Convert seconds to minutes
            
            key = email.lower()
            if key in member_map:
                member_map[key]["aht"] = aht
            else:
                name = email.split("@")[0] if "@" in email else email
                name = name.replace(".", " ").replace("_", " ").strip()
                name = re.sub(r'\s+\d+$', '', name)
                name = name.title()
                member_map[key] = {
                    "name": name, "email": email,
                    "csat": None, "productivity": None, "fcr": None, "aht": aht,
                }
            if aht is not None:
                aht_vals.append(aht)

    # ── Validate ──
    if not member_map:
        raise ValidationError(
            "No member data rows found",
            {"table1_header": table1_header, "table2_header": table2_header},
        )

    if not csat_vals and not aht_vals:
        raise ValidationError(
            "No numeric data found — extracted data may be from wrong tab",
            {"members": len(member_map), "csat_count": len(csat_vals), "aht_count": len(aht_vals)},
        )

    # ── Compute floor averages ──
    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0

    floor_avg = {
        "csat": avg(csat_vals),
        "productivity": avg(prod_vals),
        "fcr": avg(fcr_vals),
        "aht": avg(aht_vals),
    }

    # ── Detect month label ──
    month_label = ""
    for i in range(min(5, len(rows))):
        text = " ".join(rows[i])
        # Try full month name first (e.g., "August 2026")
        m = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}",
            text, re.I,
        )
        if m:
            month_label = m.group(0)
            break
    # Also try date patterns like "01/08/26" or "1/8/2026" in the header area
    if not month_label:
        for i in range(min(5, len(rows))):
            text = " ".join(rows[i])
            m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
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

    # ── Build output ──
    members: list[dict[str, Any]] = []
    for key, d in member_map.items():
        scores = [v for v in [d.get("csat"), d.get("productivity"), d.get("fcr")] if v is not None]
        overall = round(sum(scores) / len(scores), 1) if scores else None
        members.append({
            "name": d["name"], "email": d.get("email", ""),
            "csat": d.get("csat"), "productivity": d.get("productivity"),
            "fcr": d.get("fcr"), "aht": d.get("aht"),
            "overallScore": overall,
            "floorAvgCsat": floor_avg["csat"],
            "floorAvgProductivity": floor_avg["productivity"],
            "floorAvgFcr": floor_avg["fcr"],
            "floorAvgAht": floor_avg["aht"],
        })

    members.sort(key=lambda m: m.get("overallScore") or 0, reverse=True)

    return {
        "members": members,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "monthLabel": month_label,
        "floorAvg": floor_avg,
        "_meta": {
            "table1_header_row": table1_header,
            "table2_header_row": table2_header,
            "total_rows_raw": len(rows),
            "members_found": len(members),
            "csat_col": csat_pct_col,
            "prod_col": prod_col,
            "fcr_col": fcr_col,
            "aht_col": aht_col if table2_header != -1 else None,
            "email_col": email1_col,
        },
    }