# Vehicle inspections and assigned technician work

Choose the auto-repair capability pack, then open **Services → Vehicle inspections** (`/m/vehicle-inspections`). The connected workbench sits above earlier reference records. Employees see assigned inspections in **My work** (`/me`), using their own employee logins. They need no access to other service clients or the manager's financial screens.

## Publish a reusable checklist

Open **Manage reusable inspection checklists → New inspection checklist**. Give the checklist a name and version. Add up to 60 points, each with a unique key, group, name, instructions, measurement unit and optional measurement requirement. Save a draft, inspect its points, record your review notes and publish it. Use the appropriate vehicle specifications in your inspection instructions; the software records observations and does not supply manufacturer-specific pass/fail thresholds.

Published checklists cannot be rewritten. Copy to a new version to make changes, or retire one to stop new assignments. Each assigned inspection captures its complete checklist version, so later template changes preserve the original inspection requirements.

A published checklist marked **Share checklist in templates** is included in Branding exports. Format 4 supports these definitions alongside any shared repair-pricing definitions. Imports validate points, name/version conflicts and required vehicle/inspection module versions, then create unshared drafts for local review. They do not import vehicles, jobs, employees, photos, findings, reviewer identities, costs or credentials. Existing template formats remain supported. Retrying a matching import does not duplicate a checklist or republish an existing retired version. Template import is retryable across configuration stores, rather than one transaction across every store.

## Assign actual work

Create the client, vehicle, accepted proposal and signed agreement through the normal service workflow. Book a resource and schedule the work order. In **Assign an inspection**, select that job, its client's vehicle, a published checklist and an active employee account (or the owner). Enter the technician's instructions.

An assignment requires a confirmed booking and a matching vehicle/client. The same checklist version cannot be assigned twice to the same vehicle/job unless the earlier assignment was cancelled. A manager can reassign before attended work; once work is recorded, the original technician remains part of the inspection evidence. Cancel and create a new assignment for another technician. Cancelled records retain their history.

## Technician workflow

1. Sign in and open **My work → My vehicle inspections**. Read the captured vehicle identity, job instructions and inspection points.
2. Select **Start inspection work**. This starts the work timer and advances the scheduled job into progress using its existing signed-agreement and deposit checks. Only the assigned technician can start or record the inspection, including when a manager has broader Services access. A technician can run only one inspection timer at a time.
3. Record the odometer and unit. For each point, choose Pass, Needs attention, Unsafe finding or Not applicable, then enter measurements, observations and recommended work. Draft saves may contain unfinished points; submission requires every point, required measurements, an explanation for skipped checks and recommendations for concerns.
4. Save findings before pausing the timer, adding photos or submitting. Pause when not working and start again to resume. Paused time is excluded. Private staff notes are separate from the customer report summary.
5. Attach JPEG, PNG or WebP evidence photos to specific points. Up to 12 photos are retained, each at most 500 KB. Larger browser uploads are resized on the device. The authenticated backend validates type signatures and bounds, stores the photo with a hash and retains upload identity/time. Photos are access-controlled; a filename or photo ID grants no access.
6. Confirm completion and **Submit inspection for review**. Submission stops the timer and freezes technician edits. If the manager returns it, read the requested changes, resume work, correct the findings and submit again.

Timer segments preserve actual start/end timestamps. Managers may correct the total before review with a recorded explanation; the original segments and audit history remain. An inspection retains up to 100 timed sessions, and review supports up to 7,200 total minutes. Recorded time rounds up once to whole minutes for the job time record; labor cost uses the reviewed hourly cost and exact corrected duration. Pricing/customer billing follows the separate agreed proposal.

## Manager review and job completion

Review all findings, measurements, photos and time. For every Needs attention or Unsafe finding, record an outcome: completed/verified repair, evidenced customer decline, documented deferral/follow-up, or specialist referral. Supply supporting evidence for each outcome. These are recorded shop outcomes; choosing a disposition does not perform a repair, send a message or create a customer authorization.

Enter the technician's reviewed hourly cost in the job's currency, review notes and the review confirmation. Choose whether to share the report and its photos with the customer. **Approve inspection & record labor cost** commits the reviewed inspection, a single approved job time/cost record, audit evidence and the command receipt together. The time record has no automatic billable charge. Approved inspection and time records stay immutable; correction of an already approved inspection cost is not yet provided by this workflow. A zero hourly cost is permitted when explicitly reviewed; it is not an inferred payroll rate.

Pending inspections block the work order's normal completion action. After inspection review, the work order still requires its ordinary completion checks, evidence and resolution of other open issues. Fixed invoicing enforces the original accepted price plus approved changes and prior deposits. It does not add the inspection's internal labor cost to the customer invoice.

A reviewed inspection can be selected as an optional reference when calculating a new vehicle repair estimate. The quote records its reviewed identity and revision. Only the work described and priced in the proposal is offered; linking an inspection does not automatically authorize or price every recommendation. Changes to the linked inspection invalidate an unused estimate review.

## Customer report and photo access

Explicitly shared, reviewed reports appear in the matching customer login and in authorized, expiring client portal links. They show the vehicle, odometer, recorded findings, measurements, recommendations, shop-recorded outcomes and point photos. They omit private staff notes, manager evidence, labor costs, time records, technician identities and photo hashes. Sharing can be withdrawn after review; both report and photo access then stop. Revoking a customer session or private portal grant also prevents its photo access.

The existing WordPress customer-entry capability opens the same backend customer account. No business rules or privileged inspection credential need to be placed in WordPress.

## API and MCP

- Manager GET/POST: `/api/auto-repair/inspections`, with Services view/edit access.
- Assigned employee GET/POST: `/api/workspace/me/inspections`, with a current signed-in employee identity and record ownership. Management commands are rejected here.
- Staff photo GET: `/api/auto-repair/inspections/photo/{id}`, restricted to the assignee or an authorized Services viewer.
- Customer photo GET: `/api/website/customer/inspection-photo/{id}`, with enabled customer service access, a current customer session and a shared reviewed report for that client.
- Private portal photo GET: `/api/portal/{token}/inspection-photo/{id}`, restricted by the same unexpired client grant and report sharing.

POST requires the configured application origin. JSON commands contain a UUID `requestId`, an `action` and its validated `input`; edits require the last observed revision. Reuse the exact request ID and payload after an interrupted request. Photos and audit/command receipts commit in the same SQLite transaction as their inspection metadata. Back up the complete private data directory and its vault key.

`inspection_catalog` and `inspection_command` are available through both MCP transports and the authenticated backend envelope. Read `business_read` with `resource: "auto-repair-inspections"` for current records. The backend actor acts as the owner, so technician operations can execute only on inspections assigned to the owner; it cannot impersonate another employee. Backend credentials still authorize the whole deployment.

## Verification and remaining work

```sh
npx vitest run src/lib/auto-repair src/components/auto-repair
npm run build
npm run workspace:smoke
```

Tests cover assignment/permission isolation, required observations, work timing and correction, review returns, stale revisions, immutable checklist capture, protected photo access, customer projections, template conflicts and reviewed time posting. The installed check uses separate real employee and customer sessions, races timer starts and reviews, verifies private reports/photos and sharing withdrawal, and checks the original invoice amount. It uses synthetic evidence and makes no external payment or message call.

This adds working inspection execution and job-costed technician time. Parts reservations/procurement, richer technician dispatch and repair execution, automatic reminders, manufacturer specification feeds and separate repair tax-ledger posting remain unfinished. There is no offline inspection/photo queue; keep an active connection and save before leaving the page. Visual and large-photo resize acceptance still require the configured UI testing tools. Passing domain, DOM and HTTP checks does not establish vehicle condition or an independent business pilot.
