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

The public Rideshare Tax Pros website has its own Vercel deployment from the same
repository. A static site on Vercel can launch before the private workspace is
hosted. Never place the SQLite database or vault on an ephemeral serverless
filesystem. Connect the client workspace only after persistent hosting, owner
sign-in, employee permissions, backups and the actual client flow are verified.
