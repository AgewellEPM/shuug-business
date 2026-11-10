# Shuug tax/accounting product — Luke's current requirements

Updated November 8, 2026 from Luke's explicit corrections and additions.

November 9 continuation: Luke explicitly chose individual/self-employed and
business-entity returns **both from the start**. The first implemented draft
calculation/form pack declares 2025 federal coverage; it does not remove the
remaining years, schedules, state returns or filing requirements below. Payment
activation remains deferred under his explicit instruction.
He also selected a separate cloud key service for setup and then required both
custody options. Preserve a separately controlled firm-computer kit and the
separate-account cloud service. Neither option puts recovery/signing keys on
the application/data host. This does not authorize replacing an existing firm's
trust pins or treating separate key initializations as a migration.

Shuug is intended to be the complete tax preparation, accounting and filing
software. It is not scoped as merely a companion to another return product.
Current absence of calculation, forms and transmission is missing implementation,
not permission to remove those requirements.

## Build the business workspace through Shuug

Connect to the actual Shuug MCP server, describe the firm, inspect installed
capabilities and preview the generated configuration, then apply the reviewed
plan and observe the running application. Keep unrelated industries out of the
firm's everyday navigation. Reuse Shuug's real records, accounting, permissions
and industry builder; do not make a separate custom shell that merely resembles it.
See [the MCP workflow](WORKSPACE-BUILDER-MCP.md).

The present MCP builder configures installed tools. It cannot turn a tracker or
menu into a tax calculation/transmission engine. Its capability report must keep
missing work explicit. The generated workspace must preserve required supporting
modules, existing records and authorization boundaries.

## Complete tax and accounting work

- Individual, self-employed and business return preparation, with declared tax
  years and federal/state form coverage, calculations, diagnostics and review.
- Filing-ready forms, client authorization, transmission and attributable official
  acknowledgments, rejection correction and amendments.
- Client records, source documents, separate business books, imports,
  reconciliation, accounting reports and staff workflow in the same system.
- Useful everyday operation for independent and small family-run tax practices.

Current capability limits and defects are recorded in
[the assessment](SHUUG-READINESS-20261108.md). Existing handoff-only functionality
must not be advertised as completed tax computation or electronic filing.

## Client billing

The firm needs to create and send invoices, accept payments, provide receipts,
retain payment history and show each client's balance. Partial payments,
corrections and previously confirmed refunds must preserve accounting history.
Invoice delivery and payment-provider confirmation must have observable outcomes;
queued or uncertain work must not be labeled delivered or paid.

Existing native invoice, credit, settlement, private-link and Stripe Checkout
code should remain the accounting source. Sending invoice email is an additional
workflow, not copying a link into an outside message by hand. Live email and
payment accounts need actual authorized setup and verification. No real message,
charge or payment activation is authorized merely by a synthetic demonstration.

## Private client portal

Each client needs a private place to upload statements, receipts, invoices,
billing records and other business information the firm needs. Routine intake
must support multiple files, clear purpose/category, progress, failed-file retry
and readable attachments. Preserve exact bytes and prevent duplicate retries.
Support staff-requested records and a general intake area without forcing the
client to understand internal database identifiers or raw JSON.

Clients should see their own business information, requested/missing documents,
upload/review state, invoices, payment history and balances, with updates reflected
in the firm's system and the client view. Show actual last-update/pending/error
state. Polling is near-real-time refresh, not instantaneous delivery; missing
sharing approval or disconnected providers must remain visible.

Do not expose another client's records or invent financial totals. Keep private
documents and sensitive payloads encrypted before upload. Key enrollment,
authorized staff review/editing, metadata and existing legacy migration are part
of making the complete portal operational, not optional shortcuts around it.

## Firm-owned Mac mini option

A firm can host its own application and data on its own Mac mini. Rented
application hosting and AWS are optional. Finish startup, secure office/remote
access, updates, visible failures and recoverable backups for this model.
Staff and firm recovery/signing authority must remain separate from the server
for the established host-compromise protection. Email/payment services can be
connected as needed; their use does not require renting Shuug application hosting.

## Acceptance

Observe a client upload and staff access, correction and client-visible update;
issue/send a reviewed invoice, verify a provider-confirmed payment and preserve
the balance/history after restart and restore. Then complete declared return
preparation/forms/transmission with real external approvals and acknowledgment
evidence. Screenshots, source tests, simulated providers and live filing each
prove different boundaries and must be reported separately.
