# Enterprise readiness

The repository now contains working service/nonprofit records and critical workflows, a scoped client portal, notes/AI roadmaps, owner and employee sign-in, durable local stores, backups, source packaging and optional Shopify/MCP integration. **It is not yet a completed enterprise release.**

The [workflow and release guide](WORKFLOWS-AND-RELEASE.md) lists implemented behavior and the remaining requirements for each area. Several remaining items require code, not just credentials or an infrastructure decision.

## Verified foundation

- Owner and employee passwords, hashed expiring sessions, persistent sign-in throttling, one-use activation/reset links and immediate session revocation. Employees have personal assignments, private notes and separate AI planning. Roles bind to accounts; the owner preview cookie cannot elevate staff.
- Server-side section guards on legacy actions/pages and protected exports; account/role/connection administration remains owner-only. The employee role starts with personal work only.
- Separate service/nonprofit record contracts, SQLite transactions, revision conflict checks, idempotent transitions, retained audit snapshots and protected posted financial entries.
- Three tested pilot paths: donation/payment/acknowledgment/reconciliation; enrollment/session/attendance/reviewed costs/report; inquiry/accepted scope/scheduled work/approved changes/completion/invoice/payment.
- Expiring and revocable client portal access with isolated client views and recorded acceptance.
- Durable notes, real AI-generated roadmap validation, editable plans and progress persistence.
- Durable tasks/mail/operations/payment-session/onboarding state, source packaging, white-label templates and verified offline backup/restore into a new directory.
- Connected WordPress plugin with native specialist forms, private employee work, server-side session storage and a protected full-application launch. WordPress runtime tests cover capabilities/nonces, shared records, isolation and restart persistence. See [WordPress setup](WORDPRESS.md).
- Guided connection/configuration/attachment setup, public request forms, assigned employee request access, and tested website-request workflows with idempotent task creation and optional durable Slack/Zapier delivery. Exact supported triggers/actions and remaining provider acceptance checks are in [Getting started](GETTING-STARTED.md).
- Optional Shopify OAuth, signed proxy/webhooks, durable queues, reconciliation and bounded writes; no store is required for standalone operation.

- Searchable industry presets, composable capability packs and named/versioned configuration export/import with module dependency checks. Reviewed VIN saves and versioned labor/parts estimates now work through customer approval and fixed billing; explicitly shared pricing definitions import as drafts. Published inspection checklists drive employee assignments, work timers, measurements/photos, reviewed labor costs and private customer reports; checklist definitions also import as drafts. Restaurant menu/options, stock, reservations/floor, kitchen, recorded payments, shared ledger/daily close, staff attendance and specials have connected acceptance paths. The [industry](INDUSTRY-AND-WEBSITE-ACCEPTANCE.md) and [restaurant](RESTAURANT-ACCEPTANCE.md) audits retain unfinished execution, inventory, tax/payroll and provider work.
- Separate customer account lifecycle, scoped prices/order history, reviewed wholesale ordering with retry protection, authenticated proposal acceptance, published availability with transactional conflict checks, and customer cancellation. Public quote/volunteer intake creates its business records atomically. See [customer website setup](CUSTOMER-WEBSITE.md).
- Restaurant owner reports use reviewed opening duration, date ranges, coverage checks and explicit credit-date treatment. Corrections preserve closed books; Money permissions protect aggregate JSON and CSV. [Report definitions](RESTAURANT-REPORTS.md) retain seasonal, forecasting, customer-quality and full profitability limitations.

## Release gates still open

1. SSO/MFA, independent security review, security-event export, automated invitation delivery and organization-specific retention policies. Basic employee identity, session-bound permissions and account lifecycle are implemented and tested.
2. Connect and test the new donation/service records with payment, mail, accounting and document providers; implement the remaining specialist automation and lifecycle controls described in the capability matrix.
3. Finish the readiness pass on fixture-backed legacy accounting/product functionality; retain clear boundaries around financial calculations, regulated-domain requirements and actual source data.
4. Complete visual interaction tests using the configured IsolatedTester/TinkyVision stack. Its MCP transport is currently unavailable. Passing HTTP and component tests does not replace this check.
5. Verify a chosen real deployment's HTTPS, secrets, recovery, monitored failure handling, upgrades and expected peak load. The source package does not imply high-availability or multi-tenant readiness.

Do not describe this version as completing every detail in the 40-feature requirements list. It replaces the requirement-only pages with working operational foundations and tested core paths; the documented remaining work is still required for the full enterprise goal.

## QuickBooks manual audit

The complete 20-chapter requirement catalog and incomplete accounting workflows are documented in [QUICKBOOKS-MANUAL-ACCEPTANCE.md](QUICKBOOKS-MANUAL-ACCEPTANCE.md). Reviewed manual journal posting/reversal and editable accounts now preserve history with transactional retry protection. The chart supports 15 classifications and five hierarchy levels, and custom accounts participate in the ledger. This is a foundation improvement, not certification of full accounting, tax or payroll parity.

Product-invoice receipt and bank-return history now captures journal entries atomically with actual dates, review evidence and retry protection; original fees and receipts remain intact. [Receivables](RECEIVABLES.md) documents the tested replacement-payment path and remaining invoice, deposit, currency, period and provider work.
