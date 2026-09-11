# Operational workflows and release boundaries

## What is implemented

All 40 specialist routes now open record forms, tables, linked history and workflow actions instead of requirement-only pages. The implementation uses **45 distinct record contracts** in `src/lib/workspace/catalog.ts`; related modules share the relevant records rather than duplicating them. Examples: a donation is distinct from its payment or acknowledgment; a grant award is distinct from a grant receipt; a proposal, agreement, job and invoice are distinct records.

Each save validates the record contract and linked types. SQLite transactions protect transitions; updates require the current revision; transition commands have idempotency receipts. Audit snapshots identify the action, time and owner/gateway role. Confirmed payments and approved financial figures are locked. Corrections use new records or the explicit workflow actions rather than silently rewriting posted figures.

### Nonprofit

- Donors/supporters include type, household relationship, communication preference and assigned owner. Giving records remain linked in their history.
- Gifts and pledges remain separate. Receipts/refunds validate amounts and unique bank/processor references. Recorded noncash gifts do not create cash receipts.
- Acknowledgments require reviewed organization-supplied text and evidence; they capture the gift/payment snapshot. Delivery requires an actual delivery reference. No tax-deductibility claim is invented by the app.
- Funds describe purpose, conditions and dates. Approved allocations cannot exceed received, unallocated cash in that fund. Grant awards, receipts, costs and reimbursement claims have separate records; a cost cannot be claimed more than its amount.
- Volunteers need reviewed onboarding before assignment; shifts prevent overlaps and require verification of hours.
- Enrollment requires eligibility review and respects program capacity/duplicate enrollment. Sessions check room/staff conflicts. Attendance requires enrollment and enforces session capacity.
- Reports capture reviewed costs, attendance, service records and outcomes for a specified reporting period. Unreviewed costs/outcomes and incomplete attendance prevent review. The reviewed evidence snapshot remains attached to the report; submission needs a reference.
- Campaigns, event registrations/purchases/sponsorships, memberships, and board/policy/filing records have their own forms and transitions. Event purchases are not silently converted to contributions.

### Services

- Separate clients, properties, inquiries, effective-dated rates, scoped proposals and signed agreements.
- Proposals require recorded customer acceptance before agreements can be signed. Work requires signed terms, any required paid deposit, and a booking before scheduling.
- Resource bookings check overlaps and buffers. Jobs include required checks, milestones/dependencies, field updates, time/cost entries, approved scope changes, customer acceptance, and callback/rework records.
- Final fixed-fee billing uses the accepted proposal plus approved changes and subtracts prior deposit invoices. Itemized billing uses approved unbilled time/material entries; milestone billing requires a completed milestone; recurring billing uses a distinct period and included-hours/overage calculation. Charges have source IDs to prevent repeat billing.
- Invoices with posted entries cannot simply be voided. Payments/refunds/credits validate remaining balances and preserve recorded transaction evidence.
- Private client links show only that client's public proposal/work/appointment/invoice fields. They permit proposal/completion acceptance, expire after seven days and support revocation. They do not expose internal client notes, job costs or other clients. Acceptance proves use of the private link; it is not an identity-verified electronic-signature service.

### Shared platform

- Profile selection, hybrid configurations, service templates, group/tool visibility, correct sidebar placement, and profile-specific home metrics.
- Durable editable notes with source-page access checks. Selected notes can feed an actual AI conversation and editable milestone roadmap. Roadmaps retain progress/revisions; invalid AI output does not overwrite saved work. Manual plans require no AI provider.
- Older task, mail, operations, payment-session and onboarding stores now persist in the workspace SQLite database. Nested sample approval/shipment/inventory changes commit in one transaction. Customer/order archives, expenses, trackers and other existing stores retain their own persistence mechanisms.
- Employee accounts with roster-linked assignments, private notes/roadmaps, owner-managed setup/reset links, profile/role updates, disabling, personal task creation/status updates, password changes and logout. Account and permission administration is owner-only; role preview never changes an employee identity. [Employee account guide](EMPLOYEE-ACCOUNTS.md).
- Built-in owner password sign-in with scrypt hashes, random hashed session tokens, expiry, persistent login throttling and session revocation. An authenticated owner gateway remains supported.
- Reusable white-label templates include branding, enabled profiles/features and custom tracker definitions. No records, passwords, sessions or connection credentials are exported. Imports are reviewed and idempotent; because legacy configuration spans multiple files, retry the same template after an interrupted import.
- Source packaging, MIT licensing, integrity-checked offline backup/restore, production HTTP smoke checks and optional Shopify/MCP integration.

## Boundaries of this release

These are substantive remaining requirements, not features hidden behind a paywall:

| Area | Remaining work for the full requested enterprise workflow |
| --- | --- |
| Staff security | SSO/MFA, independently reviewed security controls, security-event exports and automated invitation email delivery. Local account lifecycle and session-bound section roles are implemented; broader roles intentionally grant shared section access. |
| Payment automation | New specialist workflows record confirmed external transactions. Automatic donation charging, provider-managed recurring gifts, payment-failure recovery, automated specialist-invoice payment links, refunds and ledger/accounting synchronization are not yet connected to the new records. Existing product-order Stripe Checkout remains separate. |
| Communications | AI reply drafts, acknowledgment review and recorded delivery references work. Automatic sending, outbound mail-provider delivery events, reminder schedules and annual acknowledgment letter batches are not implemented for these new workflows. |
| Documents and signatures | New forms accept evidence/document references. Existing expense receipt uploads remain available. A general secure document library, document versioning and verified e-signatures are not implemented across every specialist record. |
| Scheduling and resources | Conflict checks and manually created appointments/sessions/shifts work. Automated recurrence expansion, travel dispatch optimization, staff skill matching and self-service volunteer signup need further implementation. |
| Financial detail | Reviewed integer-cent records and source-based invoices work. These records are not a double-entry ledger or automatic tax/fund-accounting compliance. Multi-jurisdiction tax rules, revenue recognition, bank feeds and accountant-reviewed posting mappings remain separate work. |
| Service billing combinations | The tested fixed-fee + approved-change path works, as do source-based itemized/milestone/recurring records. A job keeps a consistent billing family (itemized time/materials, milestones, recurring, or fixed), with deposits applied separately. Complex mixed billing arrangements and revising issued invoice series remain unsupported. |
| Programs and funders | Enrollment, attendance, reviewed costs/outcomes and evidence snapshots work. Organization-specific intake/document requirements, shared cost allocation calculations, grant report templates and external submission integrations still need configuration/development. |
| Mobile and portal | Responsive forms and scoped portal acceptance work. Full offline operation, file uploads through the portal, client payment processing, ticketing and customer-managed scheduling are not complete. |
| Legacy product/accounting modules | Existing sample catalog assumptions and fixture-backed accounting/analysis inputs still exist. They require a separate readiness pass before they can be described as a universal production ERP. |
| Operations at scale | This is one client per private persistent deployment. Managed multi-tenancy, retention policies, tested high availability, load certification and production monitoring are not supplied by the source archive. |

## Recovery and deployment

Use a private persistent local filesystem volume. Do not place SQLite WAL databases on a shared network filesystem or ephemeral serverless filesystem. Give each client a distinct volume and credentials. External Postgres is optional for the existing deal store, and requires its own backup/restore procedure.

For Docker, build the example compose services, run `docker compose -f compose.backend.yaml run --rm web npm run workspace:setup` interactively against the shared volume, then start the services. The worker remains idle when Shopify is disabled. `APP_BASE_URL` must match the public HTTPS origin; configure your reverse proxy accordingly. Docker itself has not been exercised by the HTTP smoke test.

Stop every web/worker writer before `workspace:backup`. The command refuses active SQLite journal/lock files, checks source stability, copies the complete private data directory, and records SHA-256 checksums. Restore checks every listed file and each SQLite database, and creates a new destination rather than overwriting current data. Existing external database backups are not included. Treat the complete backup as sensitive, including its vault key. To recover, configure `DEALDESK_DATA_DIR` to the restored directory and restart the same compatible source release.

## Verification

`npm test` covers record contracts, critical transition invariants, three pilot workflows, portal isolation/revocation, durable notes/roadmaps, owner/employee sessions, private work isolation, forged-role denial, account revocation, backup integrity, imports, navigation, existing integrations and genuine MCP protocol sessions. `npm run workspace:smoke` verifies a temporary installed production HTTP server and its cleanup with synthetic data. `npm run planning:smoke` verifies a real configured local AI response without sending workspace notes.

Visual interaction verification is still blocked: the configured IsolatedTester MCP transport closed during the earlier UI check. No Chrome, Chromium, browser automation library, VM replacement or downloaded browser runtime was used. The temporary native test application and this task's isolated helper were stopped. HTTP checks do not establish visual usability.
