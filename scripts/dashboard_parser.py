#!/usr/bin/env python3
"""
Green Tab — Dashboard Sheet Parser (v3)

Parses the new Performance Dashboard sheet format:
- Overall Performance (all channels combined)
- Chat Performance (chat-specific metrics)
- Phone Performance (phone-specific metrics)
- Previous Month Performance
- Floor Averages (team averages)

Each section has columns:
  Agent, CSAT, KSCAT, DSAT, Total Count, Total w/o Karma,
  KSCAT %, CSAT %, Variance, ABT, Productivity 8-hrs,
  Escalation Rate %, Deescalation Rate %, Adherence %, AGBT, AHT,
  Closed After Resolution %, Closed Tickets %, FCR %, Tardy/minute, Idle Time

The Floor Average section has metric names and values.
"""

import csv
import io
from typing import Any


def _parse_floor_and_team_row(row: list, result: dict) -> None:
    """Parse team and floor average values from right-side columns (10-14).
    
    Only extracts values when col 10 contains an alphabetic metric name
    (not a numeric value from agent data rows like in Overall section).
    """
    if len(row) > 14:
        team_metric = row[10].strip() if len(row) > 10 else ""
        team_value = row[11].strip() if len(row) > 11 else ""
        floor_metric = row[13].strip() if len(row) > 13 else ""
        floor_value = row[14].strip() if len(row) > 14 else ""
        
        # Only process if col 10 looks like a metric name (contains letters)
        if team_metric and any(c.isalpha() for c in team_metric) and team_value and team_value != "-":
            try:
                result["team_averages"][team_metric] = float(team_value.replace("%", "").replace(",", ""))
            except ValueError:
                result["team_averages"][team_metric] = team_value
        
        if floor_metric and floor_value and floor_value != "-":
            try:
                result["floor_averages"][floor_metric] = float(floor_value.replace("%", "").replace(",", ""))
            except ValueError:
                result["floor_averages"][floor_metric] = floor_value


def parse_dashboard_csv(csv_text: str) -> dict[str, Any]:
    """
    Parse the full Dashboard CSV into structured data.
    
    Returns:
    {
        "overall": [...],        # Overall Performance rows
        "chat": [...],            # Chat Performance rows
        "phone": [...],           # Phone Performance rows
        "previous_month": [...],  # Previous Month Performance rows
        "floor_averages": {...},   # Team floor averages
        "lastUpdated": "...",      # ISO timestamp
    }
    """
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    
    result = {
        "overall": [],
        "chat": [],
        "phone": [],
        "previous_month": [],
        "team_averages": {},
        "floor_averages": {},
        "lastUpdated": "",
    }
    
    current_section = None
    headers = None
    
    for i, row in enumerate(rows):
        # Detect section headers
        first_cell = row[0].strip() if row else ""
        
        if first_cell == "Overall Performance":
            current_section = "overall"
            headers = None
            continue
        elif first_cell == "Chat Performance":
            current_section = "chat"
            headers = None
            continue
        elif first_cell == "Phone Performance":
            current_section = "phone"
            headers = None
            continue
        elif first_cell.startswith("Previous Month"):
            current_section = "previous_month"
            headers = None
            continue
        
        # Skip empty rows
        if not any(cell.strip() for cell in row):
            continue
        
        # Parse header row (starts with "Agent")
        if first_cell == "Agent" and current_section:
            headers = [cell.strip() for cell in row]
            continue
        
        # Parse data rows
        if headers and current_section and first_cell and "@" in first_cell:
            agent_data = {}
            for j, header in enumerate(headers):
                if j < len(row):
                    value = row[j].strip()
                    # Convert percentage strings
                    if value.endswith("%"):
                        try:
                            agent_data[header] = float(value[:-1])
                        except ValueError:
                            agent_data[header] = value
                    elif value.startswith("#"):
                        agent_data[header] = None  # Error value like #DIV/0!
                    else:
                        try:
                            # Try to convert to float
                            if value and value != "-":
                                agent_data[header] = float(value)
                            else:
                                agent_data[header] = None
                        except ValueError:
                            agent_data[header] = value
            agent_data["email"] = first_cell
            result[current_section].append(agent_data)
            # Parse floor/team averages from right side of sheet
            # In chat/phone sections, cols 10-14 contain team/floor averages
            # In overall section, cols 10-14 contain agent data (skip)
            if current_section in ("chat", "phone"):
                _parse_floor_and_team_row(row, result)
            continue
        
        # Parse Total row
        if first_cell == "Total" and headers and current_section:
            total_data = {}
            for j, header in enumerate(headers):
                if j < len(row):
                    value = row[j].strip()
                    if value.endswith("%"):
                        try:
                            total_data[header] = float(value[:-1])
                        except ValueError:
                            total_data[header] = value
                    elif value.startswith("#"):
                        total_data[header] = None
                    else:
                        try:
                            if value and value != "-":
                                total_data[header] = float(value)
                            else:
                                total_data[header] = None
                        except ValueError:
                            total_data[header] = value
            total_data["email"] = "Total"
            result[current_section].append(total_data)
            # Also parse floor/team averages from total row's right side (chat section only)
            if current_section == "chat":
                _parse_floor_and_team_row(row, result)
            continue
        
        # Parse standalone floor/team average rows (right side of sheet)
        # Only parse from chat/phone sections, NOT from overall section
        # (overall section has agent data in cols 10-14, not averages)
        if current_section in ("chat", "phone"):
            _parse_floor_and_team_row(row, result)
    
    # Set timestamp
    from datetime import datetime, timezone
    result["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    
    return result


def compute_kcsat(agent: dict) -> float:
    """
    Compute KCSAT score: 40% CSAT + 30% Productivity + 30% Closed Tickets %
    Uses the CSAT% and other percentage fields directly from the sheet.
    """
    csat = agent.get("CSAT %", 0) or 0
    productivity = agent.get("Productivity 8-hrs", 0) or 0
    closed = agent.get("Closed Tickets %", 0) or 0
    
    # Normalize: CSAT% is already 0-100, Productivity is tickets/8hrs, Closed% is 0-100
    # For KCSAT: 40% * CSAT% + 30% * Productivity_weighted + 30% * Closed%
    # Productivity needs normalization — use as-is from sheet (already weighted)
    return csat * 0.4 + productivity * 0.3 + closed * 0.3


if __name__ == "__main__":
    import sys
    from pathlib import Path
    
    # Test with local CSV
    csv_path = Path(__file__).resolve().parent.parent / "public" / "new-sheet-data.csv"
    if csv_path.exists():
        data = parse_dashboard_csv(csv_path.read_text())
        print(f"Overall: {len(data['overall'])} agents")
        print(f"Chat: {len(data['chat'])} agents")
        print(f"Phone: {len(data['phone'])} agents")
        print(f"Previous Month: {len(data['previous_month'])} agents")
        print(f"Floor Averages: {data['floor_averages']}")
        print()
        for agent in data["overall"][:3]:
            print(f"  {agent['email']}: CSAT={agent.get('CSAT %', 'N/A')}%, "
                  f"KSCAT={agent.get('KSCAT %', 'N/A')}%, "
                  f"Prod={agent.get('Productivity 8-hrs', 'N/A')}, "
                  f"Closed={agent.get('Closed Tickets %', 'N/A')}%")
    else:
        print(f"CSV not found at {csv_path}")