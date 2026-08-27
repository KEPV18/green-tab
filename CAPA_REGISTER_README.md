# CAPA Register Module

This module implements a production-ready CAPA (Corrective and Preventive Action) Register for QMS web applications using Google Sheets as the backend database.

## Overview

The CAPA Register module provides functionality to manage corrective and preventive actions in accordance with ISO 9001 Clause 10.2. It uses Google Sheets as the single source of truth, with each QMS module represented as a separate sheet tab.

## Architecture

- **Server-side only**: No OAuth logic in the frontend
- **Google Sheets Integration**: Uses Google APIs with refresh token authentication
- **TypeScript**: Strict typing throughout
- **Clean Architecture**: One service per register with clear separation of concerns

## Files

- `src/lib/googleAuth.ts` - Google OAuth 2.0 authentication service
- `src/lib/googleSheetsService.ts` - Google Sheets API service
- `src/lib/riskRegisterService.ts` - Risk Register service (for traceability)
- `src/lib/capaRegisterService.ts` - CAPA Register business logic
- `src/server/capas.ts` - Express API routes (optional)
- `src/server/index.ts` - Express server setup with CORS and error handling

## Google Sheets Structure

The "CAPA Register" tab contains the following columns:

| Column | Description |
|--------|-------------|
| CAPA ID | Unique identifier (auto-generated as CAPA-YY-001) |
| Source of CAPA | Origin (NC, Audit, Complaint, Risk) |
| Type | Corrective or Preventive |
| Description of Issue / Nonconformity | Detailed description |
| Reference | NC / Audit / Complaint ID |
| Root Cause Analysis | Mandatory root cause analysis |
| Corrective Action | Actions to correct the issue |
| Preventive Action | Actions to prevent recurrence |
| Responsible Person | Person accountable |
| Target Completion Date | Deadline for completion |
| Status | Open, In Progress, Under Verification, Closed |
| Effectiveness Check | Verification of effectiveness |
| Effectiveness Review Date | Date of effectiveness review |
| Closure Approval | Approval for closure |
| Related Risk | Linked Risk ID (optional) |

## Business Rules (ISO 9001 Critical)

- **Root Cause Analysis**: Mandatory for all CAPAs
- **Closure Requirements**: CAPA cannot be closed unless:
  - Effectiveness Check is completed
  - Effectiveness Review Date exists
  - Closure Approval is provided
  - Root Cause Analysis exists
- **Status Transitions**: Open → In Progress → Under Verification → Closed
- **Traceability**: Each CAPA must link to its source (NC, Audit, Complaint, or Risk)
- **Effectiveness Review**: Normally 3-6 months after action completion

## Environment Variables

Set the following environment variables:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```

## API Endpoints (Optional)

If using the Express server:

- `GET /api/capas` - Fetch all CAPAs
- `POST /api/capas` - Add new CAPA
- `PUT /api/capas/:id` - Update existing CAPA

## Usage

```typescript
import { CAPARegisterService } from './lib/capaRegisterService';

const capaService = CAPARegisterService.getInstance();

// Get all CAPAs
const capas = await capaService.getAllCAPAs();

// Add new CAPA
const newCAPA = await capaService.addCAPA({
  sourceOfCapa: 'Audit Finding',
  type: 'Corrective',
  descriptionOfIssue: 'Process deviation identified',
  reference: 'AUD-2024-001',
  rootCauseAnalysis: 'Insufficient training',
  correctiveAction: 'Implement additional training program',
  preventiveAction: 'Update training procedures',
  responsiblePerson: 'John Doe',
  targetCompletionDate: '2024-12-31',
  effectivenessCheck: '',
  effectivenessReviewDate: '',
  closureApproval: '',
  relatedRisk: 'R001' // Optional
});

// Update CAPA
const updatedCAPA = await capaService.updateCAPA('CAPA-24-001', {
  status: 'In Progress',
  correctiveAction: 'Training program implemented'
});
```

## Validation Rules

- **Type**: Must be Corrective or Preventive
- **Status**: Must be one of: Open, In Progress, Under Verification, Closed
- **Target Completion Date**: Must be a valid future date
- **Effectiveness Review Date**: Must be a valid date
- **Root Cause Analysis**: Mandatory for all CAPAs
- **Closure Validation**: All effectiveness requirements must be met before closing

## Status Transition Rules

- **Open** → **In Progress**
- **In Progress** → **Under Verification**
- **Under Verification** → **Closed** (or back to **In Progress** if verification fails)
- **Closed** → No further transitions

## Traceability Features

- **Source Linking**: CAPAs can be linked to NC, Audit, Complaint, or Risk references
- **Risk Integration**: When a CAPA related to a Risk is closed, the Risk status is automatically updated to "Controlled"
- **Audit Trail**: All changes tracked through Google Sheets history

## ISO 9001 Compliance

- **Clause 10.2**: Nonconformity and Corrective Action
- **Root-cause based**: Ensures correction addresses root causes, not just symptoms
- **Closed-loop**: Effectiveness verification and review requirements
- **Traceability**: Complete audit trail from issue identification to closure
- **Preventive Actions**: Support for proactive improvement actions

## Error Handling

All methods throw descriptive errors for:
- Authentication failures
- Invalid input data
- Sheet access issues
- CAPA not found scenarios
- Status transition violations
- Closure requirement violations

## Security

- Refresh tokens stored securely in environment variables
- Server-side authentication only
- No sensitive data exposed to frontend