# Tax Firm industry pack

Shuug remains a configurable business operating system. Tax & accounting firm is
an industry configuration, with Rideshare Tax Pros as its first supplied brand
template. No unrelated industry changes its branding or default tools.

In Setup, search for **Tax & accounting firm**. Review the seven questions, preview
the resulting tools, then apply using the existing industry setup flow. Enable
rideshare records for Uber, Lyft and other gig-worker clients. The pack uses
Shuug's existing service client, inquiry, proposal, agreement, work order, staff,
billing, private portal, role authorization, API and module storage paths.

Five SDK modules add tax engagement queues and accountant assignments, document
request tracking, external filing handoffs, rideshare records checklists and
quarterly staff reviews. They support existing table, board, calendar, summary
and authenticated API surfaces. Module records persist in the private SQLite
workspace. Client, engagement and invoice IDs are staff-entered references;
these tracker fields do not enforce relational foreign keys or stage transitions.

`rideshareTaxProsTemplate` in `src/lib/industry/rideshare-tax-pros.ts` is a version 2
business template accepted by the existing template preview/import flow. It
includes branding, capability selections and exact module dependencies, with no
client records, account credentials or uploaded documents. A new firm gets its
own installation and private data volume; this is not shared multi-tenancy.

These modules track work. They do not calculate returns, determine eligibility
or deductions, generate statutory due dates, process tax documents with AI,
provide identity-verified signatures, transmit returns or make payments.
External filing status and acceptance references are entered by staff and do not
prove independent provider verification. Drake is optional and external.
Existing AI assistant/provider integrations remain optional and separately
configured; installing this pack does not send taxpayer records to a model.

## Invited client accounts

Use Shuug's existing **Customer website access** setup at `/setup/customers`.
Enable the portal and its service access, link each account to the actual service
client, and give the client their private invitation using your verified channel.
The application does not send invitations automatically. Tax-only deployments
can leave product pricing, ordering and order status off. Client sessions remain
separate from employee and owner sessions.

In Tax engagements, Tax document requests, Rideshare tax records and Quarterly
tax reviews, **Share safe status with linked client** is unchecked by default.
Existing records remain private. Add an optional **Client-facing message** for
text you intend the linked client to read. Shared fields are:

| Record | Client-visible fields |
| --- | --- |
| Engagement | Name, year, workflow stage and client-facing message. |
| Document request | Requested document, request status, requested-by date and client-facing message. |
| Rideshare records | Name, platform, income/mileage/expense record statuses and client-facing message. |
| Quarterly review | Name, year, quarter, status, staff review date and client-facing message. |

Document requests and rideshare records must also reference an unarchived,
explicitly shared engagement belonging to that same linked service client.
Orphans and mismatched client/engagement references do not appear. Unsharing or
archiving the parent removes its children from the client view. Hidden modules,
disabled service access and revoked accounts are respected on each request.
Internal notes, accountant assignments, vault/advice references, agreement,
work-order and invoice references are excluded from this tax projection.
Filing-handoff records remain staff-only. Client-facing messages and record
names are shared deliberately; review them before checking the sharing box.

The branded responsive client view is at `/api/website/customer`; use that full
HTTPS destination for the public website's `workspaceUrl` when persistent public
hosting is ready. The workspace root is the employee/owner entry point. This view
does not upload documents, calculate returns or independently verify filing.
Staff review dates are not statutory tax deadlines.

`npm run workspace:rideshare:smoke` exercises the compiled production server with
disposable synthetic clients: actual owner/invitation/customer HTTP sign-in,
sharing/isolation, forbidden staff APIs, cross-origin denial and revocation.
It stops its owned server and deletes its disposable workspace on completion.

The public Rideshare Tax Pros website has its own Vercel deployment from the same
repository. A static site on Vercel can launch before the private workspace is
hosted. Never place the SQLite database or vault on an ephemeral serverless
filesystem. Connect the client workspace only after persistent hosting, owner
sign-in, employee permissions, backups and the actual client flow are verified.
