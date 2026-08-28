#!/usr/bin/env python3
"""
Green Tab — Google Sheet CSV Parser (v2)

Parses data from EXACTLY TWO sources:
1. "Team Scores" tab CSV (gid=87009911) → team metrics per agent
2. "KSCAT Calc" tab CSV (gid=758073782), range P1:X15 → KSCAT/Karma data per agent

NO other tabs are supported. NO auto-detection of format.
NO fallback to Sheet19, Tab 0, Bamboo ID, etc.

Team Scores structure:
  - Rows 1-13: Bamboo ID section (IGNORED)
  - Row ~16: Header for metrics: Agent's Email, CSAT, CSAT, Productivity 8-hrs,
    Escalation rate %, Adherence %, Average basket time, IRT 2 replier,
    FCR %, Closed after resolution %
  - Rows 17+: Agent metric data
  - Second table: Agent's Email, Tardy, Break exceed, Idle Time, Genesys AHT, etc.

KSCAT Calc structure (P1:X15):
  - P: Agent (email)
  - Q: CSAT (count)
  - R: KSCAT (count)
  - S: DSAT (count)
  - T: Total count
  - U: Total without Karma
  - V: KSCAT (percentage)
  - W: CSAT (percentage)
  - X: Variance between CSAT and KSCAT

Usage:
    from sheet_parser import parse_team_scores, parse_kscat_calc, ValidationError

    team_data = parse_team_scores(csv_text)
    kscat_data = parse_kscat_calc(csv_text)
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


def parse_tsv(text: str) -> list[list[str]]:
    """Parse tab-separated values from Google Sheets clipboard."""
    if not text or not text.strip():
        raise ValidationError("Empty TSV input", {"length": 0})

    lines = text.split("\n")
    rows: list[list[str]] = []
    for line in lines:
        cells = [c.strip() for c in line.split("\t")]
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


# ── Column finder ────────────────────────────────────────────────────────────────

def _find_col(headers: list[str], keywords: list[str]) -> int:
    """Find a column by any of several keywords. Case-insensitive partial match."""
    for keyword in keywords:
        kw = keyword.lower()
        for i, h in enumerate(headers):
            if kw in h.lower():
                return i
    return -1


# ── Team Scores Parser ────────────────────────────────────────────────────────────

def parse_team_scores(csv_text: str) -> dict[str, Any]:
    """
    Parse the Team Scores tab CSV.

    The tab has two tables stacked vertically:
    - Table 1 (upper): Agent's Email | CSAT | CSAT | Productivity 8-hrs | Escalation rate % |
      Adherence % | Average basket time | IRT 2 replier | FCR % | Closed after resolution %
    - Table 2 (lower): Agent's Email | Tardy | Break exceed | Idle Time |
      Genesys Inbound AHT + ACW | Average handling time | De-escalation rate % |
      Occupancy daily % | Avg group basket time | Closed tickets %

    Returns dict with 'members', 'floorAvg', 'monthLabel', 'fetchedAt'.
    """
    rows = parse_csv(csv_text)

    if not rows:
        raise ValidationError("No rows in Team Scores CSV", {"row_count": 0})

    # ── Find Table 1 header row ──
    table1_header_idx = -1
    for i, row in enumerate(rows):
        joined = " ".join(row).lower()
        if "agent" in joined and ("csat" in joined or "productivity" in joined):
            # Make sure it's NOT the Bamboo ID section
            if "bamboo" not in joined:
                table1_header_idx = i
                break

    if table1_header_idx == -1:
        raise ValidationError(
            "Could not find Team Scores header row (Agent + CSAT/Productivity)",
            {"first_5_rows": [" ".join(r[:5]) for r in rows[:5]]}
        )

    headers1 = rows[table1_header_idx]
    email1_col = _find_col(headers1, ["agent's email", "agent email", "email"])
    csat_raw_col = _find_col(headers1, ["csat"])  # First CSAT = raw score count
    csat_pct_col = -1
    # Find second CSAT column (percentage)
    for i, h in enumerate(headers1):
        if "csat" in h.lower() and i != csat_raw_col:
            csat_pct_col = i
            break
    prod_col = _find_col(headers1, ["productivity", "prod"])
    esc_col = _find_col(headers1, ["escalation rate", "escalation"])
    adh_col = _find_col(headers1, ["adherence"])
    aht_col = _find_col(headers1, ["average basket time", "basket time"])
    irt_col = _find_col(headers1, ["irt 2 replier", "irt"])
    fcr_col = _find_col(headers1, ["fcr", "first call resolution"])
    car_col = _find_col(headers1, ["closed after resolution"])

    # ── Find Table 2 header row ──
    table2_header_idx = -1
    for i in range(table1_header_idx + 1, len(rows)):
        joined = " ".join(rows[i]).lower()
        if "agent" in joined and ("break exceed" in joined or "idle time" in joined or "genesys" in joined or "aht" in joined):
            table2_header_idx = i
            break

    headers2 = rows[table2_header_idx] if table2_header_idx != -1 else []
    email2_col = _find_col(headers2, ["agent's email", "agent email", "email"]) if headers2 else -1
    break_exceed_col = _find_col(headers2, ["break exceed", "break_exceed"]) if headers2 else -1
    idle_time_col = _find_col(headers2, ["idle time", "idle_time"]) if headers2 else -1
    genesys_aht_col = _find_col(headers2, ["genesys inbound aht", "genesys aht", "genesys"]) if headers2 else -1
    chat_aht_col = _find_col(headers2, ["average handling time"]) if headers2 else -1
    deesc_col = _find_col(headers2, ["de-escalation rate", "deescalation rate", "de-escalation", "deescalation"]) if headers2 else -1
    occupancy_col = _find_col(headers2, ["occupancy daily", "occupancy"]) if headers2 else -1
    agbt_col = _find_col(headers2, ["avg group basket time", "average group basket time", "group basket"]) if headers2 else -1
    close_rate_col = _find_col(headers2, ["closed tickets", "close rate", "closed tickets, %"]) if headers2 else -1

    # ── Parse Table 1 (metrics) ──
    skip_names = {"team score", "average", "total", "floor", ""}
    member_map: dict[str, dict[str, Any]] = {}

    data1_end = table2_header_idx if table2_header_idx != -1 else len(rows)

    # Track which emails appear to find summary rows (no @ sign)
    for i in range(table1_header_idx + 1, data1_end):
        row = rows[i] if i < len(rows) else []
        if len(row) < 2:
            continue
        email = row[email1_col].strip() if email1_col != -1 and email1_col < len(row) else ""
        if not email or "@" not in email or email.lower().strip() in skip_names:
            continue

        key = email.lower()
        member_map[key] = {
            "email": email,
            "name": "",  # Will be filled from ID_Name or email
            "csat": parse_percent(row[csat_pct_col]) if csat_pct_col != -1 and csat_pct_col < len(row) else None,
            "productivity": parse_num(row[prod_col]) if prod_col != -1 and prod_col < len(row) else None,
            "escalationRate": parse_percent(row[esc_col]) if esc_col != -1 and esc_col < len(row) else None,
            "adherence": parse_percent(row[adh_col]) if adh_col != -1 and adh_col < len(row) else None,
            "aht": parse_num(row[aht_col]) if aht_col != -1 and aht_col < len(row) else None,
            "irtReplier": parse_num(row[irt_col]) if irt_col != -1 and irt_col < len(row) else None,
            "fcr": parse_percent(row[fcr_col]) if fcr_col != -1 and fcr_col < len(row) else None,
            "closedAfterResolution": parse_percent(row[car_col]) if car_col != -1 and car_col < len(row) else None,
        }

    # ── Parse Table 2 (AHT/break/idle/de-escalation) ──
    if table2_header_idx != -1:
        for i in range(table2_header_idx + 1, len(rows)):
            row = rows[i] if i < len(rows) else []
            if len(row) < 2:
                continue
            email = row[email2_col].strip() if email2_col != -1 and email2_col < len(row) else ""
            if not email or "@" not in email or email.lower().strip() in skip_names:
                continue

            key = email.lower()
            if key not in member_map:
                member_map[key] = {"email": email, "name": ""}

            if break_exceed_col != -1 and break_exceed_col < len(row):
                v = parse_num(row[break_exceed_col])
                if v is not None:
                    member_map[key]["breakExceed"] = v

            if idle_time_col != -1 and idle_time_col < len(row):
                v = parse_time_to_minutes(row[idle_time_col])
                if v is not None:
                    member_map[key]["idleTime"] = v

            if genesys_aht_col != -1 and genesys_aht_col < len(row):
                v = parse_time_to_minutes(row[genesys_aht_col])
                if v is not None:
                    member_map[key]["genesysAht"] = v

            if chat_aht_col != -1 and chat_aht_col < len(row):
                v = parse_time_to_minutes(row[chat_aht_col])
                if v is not None:
                    member_map[key]["chatAht"] = v

            if deesc_col != -1 and deesc_col < len(row):
                v = parse_percent(row[deesc_col])
                if v is not None:
                    member_map[key]["deescalationRate"] = v

            if occupancy_col != -1 and occupancy_col < len(row):
                v = parse_percent(row[occupancy_col])
                if v is not None:
                    member_map[key]["occupancy"] = v

            if agbt_col != -1 and agbt_col < len(row):
                v = parse_num(row[agbt_col])
                if v is not None:
                    member_map[key]["avgGroupBasketTime"] = v

            if close_rate_col != -1 and close_rate_col < len(row):
                v = parse_percent(row[close_rate_col])
                if v is not None:
                    member_map[key]["closeRate"] = v

    # ── Fill names from Bamboo ID section (rows 1-13) ──
    # The first section has: Bamboo ID, Queue, Email, ID_Name, Batch, Citrix user
    name_map: dict[str, str] = {}
    for row in rows[:table1_header_idx]:
        if len(row) < 4:
            continue
        # Find the email column (contains @)
        row_email = ""
        for cell in row:
            if "@" in cell.strip():
                row_email = cell.strip().lower()
                break
        if not row_email:
            continue
        # ID_Name is the 4th column (index 3)
        id_name = row[3].strip() if len(row) > 3 else ""
        if id_name:
            name_map[row_email] = id_name

    # ── Build member list ──
    members: list[dict[str, Any]] = []

    # Track floor averages
    csat_vals = []
    prod_vals = []
    fcr_vals = []
    aht_vals = []
    esc_vals = []
    adh_vals = []
    irt_vals = []
    car_vals = []
    be_vals = []
    it_vals = []
    de_vals = []
    occ_vals = []
    agbt_vals = []
    cr_vals = []

    for key, d in member_map.items():
        # Fill name
        name = name_map.get(key, "")
        if not name:
            name = d["email"].split("@")[0].replace(".", " ").replace("_", " ").strip()
            name = re.sub(r'\s+\d+$', '', name).title()
        d["name"] = name

        # Collect floor average values
        if d.get("csat") is not None: csat_vals.append(d["csat"])
        if d.get("productivity") is not None: prod_vals.append(d["productivity"])
        if d.get("fcr") is not None: fcr_vals.append(d["fcr"])
        if d.get("aht") is not None: aht_vals.append(d["aht"])
        if d.get("escalationRate") is not None: esc_vals.append(d["escalationRate"])
        if d.get("adherence") is not None: adh_vals.append(d["adherence"])
        if d.get("irtReplier") is not None: irt_vals.append(d["irtReplier"])
        if d.get("closedAfterResolution") is not None: car_vals.append(d["closedAfterResolution"])
        if d.get("breakExceed") is not None: be_vals.append(d["breakExceed"])
        if d.get("idleTime") is not None: it_vals.append(d["idleTime"])
        if d.get("deescalationRate") is not None: de_vals.append(d["deescalationRate"])
        if d.get("occupancy") is not None: occ_vals.append(d["occupancy"])
        if d.get("avgGroupBasketTime") is not None: agbt_vals.append(d["avgGroupBasketTime"])
        if d.get("closeRate") is not None: cr_vals.append(d["closeRate"])

        members.append(d)

    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0

    # Sort by CSAT descending
    members.sort(key=lambda m: m.get("csat") or 0, reverse=True)

    # Detect month label from the sheet
    month_label = ""
    for row in rows[:table1_header_idx]:
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
        "floorAvg": {
            "csat": avg(csat_vals),
            "productivity": avg(prod_vals),
            "fcr": avg(fcr_vals),
            "aht": avg(aht_vals),
            "escalationRate": avg(esc_vals),
            "adherence": avg(adh_vals),
            "irtReplier": avg(irt_vals),
            "closedAfterResolution": avg(car_vals),
            "breakExceed": avg(be_vals),
            "idleTime": avg(it_vals),
            "deescalationRate": avg(de_vals),
            "occupancy": avg(occ_vals),
            "avgGroupBasketTime": avg(agbt_vals),
            "closeRate": avg(cr_vals),
        },
        "_meta": {
            "source": "Team Scores",
            "gid": "87009911",
            "total_rows_raw": len(rows),
            "members_found": len(members),
            "table1_header_idx": table1_header_idx,
            "table2_header_idx": table2_header_idx,
            "name_map_size": len(name_map),
        },
    }


# ── KSCAT Calc Parser ────────────────────────────────────────────────────────────

def parse_kscat_calc(csv_text: str) -> dict[str, Any]:
    """
    Parse the KSCAT Calc tab CSV, extracting ONLY range P1:X15.

    Columns P through X (0-based indices 15-23):
    - P (15): Agent (email)
    - Q (16): CSAT (count)
    - R (17): KSCAT (count)
    - S (18): DSAT (count)
    - T (19): Total count
    - U (20): Total without Karma
    - V (21): KSCAT (percentage)
    - W (22): CSAT (percentage)
    - X (23): Variance between CSAT and KSCAT

    Rows 1-15: Header + 13 agents + Team Score row
    Row 1 IS included (header).
    Row 15 IS included (Team Score).

    Returns dict with 'agents', 'team_score', 'headers', 'raw_range'.
    """
    rows = parse_csv(csv_text)

    if not rows:
        raise ValidationError("No rows in KSCAT Calc CSV", {"row_count": 0})

    # Extract only rows 1-15, columns P-X (indices 15-23)
    # In CSV, row indices are 0-based, so rows 0-14 = rows 1-15 in sheet
    p_col = 15  # Column P (0-based)
    x_col = 23  # Column X (0-based)
    col_count = x_col - p_col + 1  # 9 columns

    raw_range: list[list[str]] = []
    for i in range(min(15, len(rows))):
        row = rows[i]
        px = row[p_col:x_col + 1] if len(row) > x_col else (
            row[p_col:] + [""] * (col_count - max(0, len(row) - p_col))
            if len(row) > p_col else [""] * col_count
        )
        raw_range.append(px)

    if len(raw_range) < 2:
        raise ValidationError(
            "KSCAT Calc range P1:X15 has too few rows",
            {"rows_extracted": len(raw_range)}
        )

    # Row 1 = header (index 0)
    headers = raw_range[0]
    # Expected: Agent, CSAT, KSCAT, DSAT, Total count, Total without Karma, KSCAT, CSAT, Variance between CSAT and KSCAT
    print(f"[kscat_parser] KSCAT Calc headers (P1:X1): {headers}")

    # Parse agent rows (2-14) and team score row (15)
    agents: list[dict[str, Any]] = []
    team_score: dict[str, Any] | None = None

    for i in range(1, len(raw_range)):
        row = raw_range[i]
        if not row or not row[0]:
            continue

        agent_val = row[0].strip()
        csat_count = parse_num(row[1]) if len(row) > 1 else None
        kscat_count = parse_num(row[2]) if len(row) > 2 else None
        dsat_count = parse_num(row[3]) if len(row) > 3 else None
        total_count = parse_num(row[4]) if len(row) > 4 else None
        total_without_karma = parse_num(row[5]) if len(row) > 5 else None
        kscat_pct = parse_percent(row[6]) if len(row) > 6 else None
        csat_pct = parse_percent(row[7]) if len(row) > 7 else None
        variance = parse_percent(row[8]) if len(row) > 8 else None

        record = {
            "agent": agent_val,
            "csat_count": csat_count,
            "kscat_count": kscat_count,
            "dsat_count": dsat_count,
            "total_count": total_count,
            "total_without_karma": total_without_karma,
            "kscat_pct": kscat_pct,
            "csat_pct": csat_pct,
            "variance": variance,
        }

        if agent_val.lower() in ("team score", "team", "total"):
            team_score = record
        else:
            agents.append(record)

    return {
        "agents": agents,
        "team_score": team_score,
        "headers": headers,
        "raw_range": raw_range,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "_meta": {
            "source": "KSCAT Calc",
            "gid": "758073782",
            "range": "P1:X15",
            "rows_extracted": len(raw_range),
            "agents_found": len(agents),
        },
    }


# ── Legacy compatibility (used by fetch_team_data.py --csv/--tsv test modes) ─────

def validate_team_data(rows: list[list[str]], name_map: dict[str, str] | None = None) -> dict[str, Any]:
    """
    Legacy compatibility: parse rows from Team Scores horizontal format.
    Used by --csv/--tsv test modes.
    """
    # Reconstruct CSV text from rows and delegate to parse_team_scores
    import io, csv
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return parse_team_scores(buf.getvalue())