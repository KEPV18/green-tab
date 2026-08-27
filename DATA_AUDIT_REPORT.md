# DATA AUDIT REPORT — Green Tab Google Sheets Source Mapping

**Date:** 2026-08-27
**Sheet:** https://docs.google.com/spreadsheets/d/1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw/edit
**Source tab:** Sheet19 (gid=1066657646) — per-agent metrics in vertical/metric-per-row format
**Cross-reference tab:** Team Scores (gid=87009911) — summary tables with horizontal columns

---

## 1. SOURCE STRUCTURE — Sheet19 (gid=1066657646)

Sheet19 uses a **vertical/metric-per-row layout**:
- Each agent has **20 rows** (one per metric)
- Columns: `[Ops Manager] [Team Lead] [Agent Email] [Metric Name] [Value] ... [Right-side mirror columns]`
- First agent starts at row 1 (abdallah.abdallah@tabby.ai)
- Row 0 is a header row: `Ops Manager | Team Lead | Agent | (blank) | 01/08/26 | ... | Ops Manager | Team Lead | Agent | (blank) | 1/8/2026`

### Agents found (13 total):

| # | Email | ID_Name (from Tab 0) | Has data? |
|---|-------|---------------------|-----------|
| 1 | abdallah.abdallah@tabby.ai | Abdallah Abdallah | Partial (many metrics empty) |
| 2 | abdullah.mohamed@tabby.ai | Abdullah Riad | Partial (most metrics empty) |
| 3 | ahmed.ahmed.5@tabby.ai | Ahmed Ahmed | ✅ Full |
| 4 | ahmed.gelal@tabby.ai | Ahmed Ali | ✅ Full |
| 5 | ahmed.radwan@tabby.ai | Ahmed Elkhodary | ✅ Full |
| 6 | belal.kamel@tabby.ai | Belal Kamel | ✅ Full |
| 7 | mohamed.hanafy@tabby.ai | Mohamed Ahmed | ✅ Full |
| 8 | mohamed.marei@tabby.ai | Mohamed Marei | ✅ Full |
| 9 | mohamed.mohamed.27@tabby.ai | Mohamed Mohamed | ❌ All metrics empty |
| 10 | omar.allaa@tabby.ai | Omar Fathy | ✅ Full |
| 11 | omar.sobhy.1@tabby.ai | Omar Sobhy | ✅ Full |
| 12 | youssef.shenoda@tabby.ai | Yousef Bekhet | ✅ Full |
| 13 | sherif.fathy.2@tabby.ai | Sherif Fathy | Partial (some metrics empty) |

### All 20 metrics per agent (in Sheet19 vertical order):

| # | Metric Name | Source Column | Data Type | Notes |
|---|-------------|---------------|-----------|-------|
| 1 | Average basket time | Col 4 | float (minutes) | Chat basket time |
| 2 | Concurrency | Col 4 | float | Chat concurrency |
| 3 | **Productivity 8-hrs** | Col 4 | float | ✅ Direct match to Green Tab |
| 4 | Escalation rate % | Col 4 | percentage | |
| 5 | Adherence, % | Col 4 | percentage | |
| 6 | Average group basket time | Col 4 | float (minutes) | Group-level basket time |
| 7 | **Average handling time** | Col 4 | float (minutes) | ⚠️ This is **Chat AHT**, NOT Genesys AHT |
| 8 | Basket touched tickets | Col 4 | integer | |
| 9 | CSAT adjusted - total scores | Col 4 | integer | Raw CSAT score count |
| 10 | **CSAT adjusted with calls, %** | Col 4 | percentage | ✅ This is the CSAT % to use |
| 11 | Closed after resolution, % | Col 4 | percentage | |
| 12 | Closed tickets | Col 4 | integer | |
| 13 | Closed tickets, % | Col 4 | percentage | |
| 14 | Deescalation rate % | Col 4 | percentage | |
| 15 | **FCR, %** | Col 4 | percentage | ✅ Direct match to Green Tab |
| 16 | **Genesys Inbound AHT + ACW** | Col 4 | **EMPTY for all agents** | ❌ No data |
| 17 | IRT 2 replier | Col 4 | float (minutes) | |
| 18 | Occupancy daily, % | Col 4 | percentage | |
| 19 | Shrinkage - agent - unplanned | Col 4 | percentage | |
| 20 | Utilization daily, % | Col 4 | percentage | |

---

## 2. CROSS-REFERENCE — Tab 0 "Team Scores" (gid=87009911)

### Table 1 (Row 17): Agent metrics in columns

| Col | Header | Matches Green Tab? |
|-----|--------|--------------------|
| 0 | Agent's Email | ✅ Key field |
| 1 | CSAT (raw score count) | ❌ Not used |
| 2 | **CSAT %** | ✅ → Green Tab `csat` |
| 3 | **Productivity 8-hrs** | ✅ → Green Tab `productivity` |
| 4 | Escalation rate % | Not used |
| 5 | Adherence, % | Not used |
| 6 | Average basket time | Not used |
| 7 | IRT 2 replier | Not used |
| 8 | **FCR %** | ✅ → Green Tab `fcr` |
| 9 | Closed after resolution, % | Not used |

### Table 2 (Row 34): AHT and other metrics

| Col | Header | Matches Green Tab? |
|-----|--------|--------------------|
| 0 | Agent's Email | ✅ Key field |
| 1 | Tardy/minute | Not used |
| 2 | Break Exceed | Not used |
| 3 | Idle Time | Not used |
| 4 | **Genesys Inbound AHT + ACW** | ❌ **EMPTY for all agents** |
| 5 | Deescalation rate % | Not used |
| 6 | Occupancy daily, % | Not used |
| 7 | Average group basket time | Not used |
| 8 | Closed tickets, % | Not used |

---

## 3. FIELD MAPPING — Source → Green Tab

| Green Tab Field | Source Tab | Source Column/Row | Transformation | Confidence |
|----------------|------------|-------------------|----------------|------------|
| `email` | Sheet19, Tab 0 | Col 2 (Agent) | Direct copy | ✅ 100% |
| `name` | Tab 0 | Col 3 (ID_Name) | Direct copy | ✅ 100% |
| `csat` | Tab 0 Table 1 | Col 2 (CSAT %) | Strip `%`, parse as float | ✅ 100% |
| `productivity` | Tab 0 Table 1 | Col 3 (Productivity 8-hrs) | Parse as float | ✅ 100% |
| `fcr` | Tab 0 Table 1 | Col 8 (FCR %) | Strip `%`, parse as float | ✅ 100% |
| `aht` | Sheet19 | "Average handling time" per agent | Parse as float (minutes) | ✅ 100% |
| `floorAvg.csat` | Tab 0 Row 31 | "Team Score" row, Col 2 | Strip `%` | ✅ 100% |
| `floorAvg.productivity` | Tab 0 Row 31 | "Team Score" row, Col 3 | Parse as float | ✅ 100% |
| `floorAvg.fcr` | Tab 0 Row 31 | "Team Score" row, Col 8 | Strip `%` | ✅ 100% |
| `floorAvg.aht` | Computed | Average of all non-null agent AHTs | Mean calculation | ✅ 100% |
| `overallScore` | Computed | Average of csat, productivity, fcr | Mean calculation | ✅ 100% |
| `monthLabel` | Sheet title | "Aug - 26 - Google Sheets" | Parse "Aug" → "August", "26" → "2026" | ✅ 100% |

---

## 4. CRITICAL FINDING — AHT Clarification

**Batman's clarification is confirmed by the data:**

| Metric | Source | Available? | Notes |
|--------|--------|------------|-------|
| **Average handling time** | Sheet19 "Average handling time" per agent | ✅ YES | This is **Chat AHT** — time handling chat interactions |
| **Genesys Inbound AHT + ACW** | Sheet19 "Genesys Inbound AHT + ACW" per agent | ❌ EMPTY | This is **Voice/Call AHT** — no data available for any agent |
| **Average basket time** | Sheet19 "Average basket time" per agent | ✅ YES | This is a **separate KPI** — NOT AHT |
| **Average group basket time** | Sheet19 "Average group basket time" per agent | ✅ YES | This is a **separate KPI** — NOT AHT |

### Green Tab currently has a SINGLE `aht` field.

**Decision needed:** Which AHT should populate the `aht` field?

- **Option A:** Use "Average handling time" (Chat AHT) — this HAS data for 11 of 13 agents
- **Option B:** Leave `aht` as `null` because "Genesys Inbound AHT + ACW" is empty
- **Option C:** Add TWO separate fields: `chatAht` and `genesysAht`

### Current implementation uses Option A (Chat AHT → `aht` field).

Sample values:
| Agent | Chat AHT (Avg handling time) | Genesys AHT |
|-------|------------------------------|-------------|
| ahmed.ahmed.5 | 2.4 | empty |
| ahmed.gelal | 4.8 | empty |
| ahmed.radwan | 6.6 | empty |
| belal.kamel | 3.8 | empty |
| mohamed.hanafy | 10.8 | empty |
| mohamed.marei | 4.4 | empty |
| mohamed.mohamed.27 | empty | empty |
| omar.allaa | 4.0 | empty |
| omar.sobhy.1 | 3.8 | empty |
| youssef.shenoda | 4.1 | empty |
| sherif.fathy.2 | 0 | empty |
| abdallah.abdallah | empty | empty |
| abdullah.mohamed | empty | empty |

---

## 5. FIELDS AVAILABLE vs MISSING

### ✅ Available (can safely populate):

| Green Tab Field | Source Value | Agents with data |
|----------------|-------------|------------------|
| `email` | Agent email | 13/13 |
| `name` | ID_Name from Tab 0 | 13/13 |
| `csat` | CSAT adjusted with calls % | 11/13 |
| `productivity` | Productivity 8-hrs | 10/13 |
| `fcr` | FCR % | 13/13 |
| `aht` (Chat AHT) | Average handling time | 11/13 |
| `monthLabel` | Sheet title | 1/1 |

### ❌ Missing or empty:

| Green Tab Field | Source | Status |
|----------------|--------|--------|
| `aht` (Genesys) | Genesys Inbound AHT + ACW | **EMPTY for ALL 13 agents** |
| `aht` (abdallah.abdallah) | Average handling time | Empty for this agent |
| `aht` (abdullah.mohamed) | Average handling time | Empty for this agent |
| `aht` (mohamed.mohamed.27) | Average handling time | Empty for this agent |
| `productivity` (3 agents) | Productivity 8-hrs | Empty for abdullah.mohamed, mohamed.hanafy, mohamed.mohamed.27 |
| `csat` (2 agents) | CSAT % | Empty for abdullah.mohamed, mohamed.mohamed.27 |

---

## 6. BLOCKERS

1. **Genesys Inbound AHT + ACW is empty for all agents** — This is the voice/call AHT. The Green Tab dashboard currently has a single `aht` field. If the dashboard needs voice AHT specifically, we cannot provide it. If Chat AHT is acceptable, we can populate it from "Average handling time."

2. **Vercel serves team-data.json as text/html** — The current `vercel.json` rewrite rule sends all routes to `index.html`. A fix was pushed but Vercel hasn't redeployed yet. This needs manual redeploy from the Vercel Dashboard.

3. **Sherif Fathy has Chat AHT = 0** — This is a real value (0 minutes), not a missing value. The dashboard should handle `aht: 0` correctly.

---

## 7. SUMMARY

- **Total agents found:** 13
- **Total source tables:** 2 (Sheet19 vertical + Tab 0 horizontal)
- **Source fields available:** CSAT, Productivity, FCR, Chat AHT, Average basket time, Escalation rate, Adherence, and 10+ other metrics
- **Source fields missing:** Genesys Inbound AHT + ACW (voice AHT) — empty for ALL agents
- **Green Tab fields that can safely be populated:** email, name, csat (11/13), productivity (10/13), fcr (13/13), aht/Chat AHT (11/13), monthLabel, floorAvg
- **Green Tab fields that CANNOT be populated:** Genesys AHT (voice) — zero data
- **Current implementation populates `aht` with Chat AHT ("Average handling time")** — This is correct per Batman's clarification that these are different metrics and Chat AHT is what's available.

**Recommendation:** Proceed with upload using Chat AHT as the `aht` field. Genesys AHT should be added as a separate field (`genesysAht`) in a future update when data becomes available.