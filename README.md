# Shuug

**The free, open-source operating system for your business.**

Keep your website. Keep your accounting and payment tools. Connect supported services and run the work in Shuug. Customize each workspace, white-label it, reuse industry templates, and build your own implementations. Full source, no paid edition, and no Shuug per-seat license fee. Hosting and third-party services have their own costs and terms.

A self-hosted business workspace with ten searchable industry starting points and configurable **Sales / products**, **Service industry**, and **Nonprofit** profiles. Combine profiles, apply your own branding, and show or hide individual tools. Source code and implemented features are included under the [MIT license](LICENSE).

This release provides working records and workflows for all 40 service/nonprofit sidebar sections, a client portal, notes with AI roadmaps, and an optional Shopify/MCP backend. It is a **single-client deployment with owner and employee accounts**, not a completed enterprise or multi-tenant product. See the exact [capability boundaries](docs/WORKFLOWS-AND-RELEASE.md) before deploying it for an organization.

## Install the full source

Use Node 24 (`.nvmrc`) and npm. From the extracted repository:

```sh
npm ci
npm run db:generate
npm run workspace:setup
npm run build
npm start -- --hostname 127.0.0.1
```

Open **http://localhost:3000** and sign in with the owner password created during setup. Setup keeps password input hidden and stores a salted password hash in the encrypted local vault. It does not require Shopify, Postgres, an AI account, or a subscription.

Open **Setup → Connect, configure & launch** (`/setup`) for the guided **Connect → Configure → Attach → Automate** flow. Connect providers, configure profiles and employee access, choose an industry, configure customer access, download the WordPress plugin or publish a website form, then test and enable assigned follow-up tasks with optional Slack/Zapier delivery. Follow the [getting-started guide](docs/GETTING-STARTED.md) for exact capabilities and a complete first workflow. Google/Microsoft mailbox/calendar OAuth and general order-to-inventory-to-accounting automation are not included.

Development: `npm run dev`. Development permits local-owner access only before an owner password is configured. Configuring the owner password turns on sign-in in development too; deleting a session cookie never restores owner access. Copy `.env.example` to `.env.local` for optional settings. New task, mail, inventory and sales stores start without example records; set `DEMO_DATA=true` only when you want sample data. Some legacy accounting/analysis tools still use fixture-backed inputs; their output is not a posted accounting ledger.

## Configure your organization

- **Industry setup** (`/setup`): searchable business types, six or seven questions, reusable capability packs and named/versioned template exports. See [industry setup and remaining domain work](docs/INDUSTRY-SETUP.md).
- **Branding & workspace** (`/branding`): select one or more profiles; configure service templates, identity, logo, colors, groups and individual tools. Export a reusable business template, then preview and import it into another installation. Templates include custom tool definitions and explicitly shared published repair pricing; they omit business records and credentials.
- **Auto repair**: reviewed labor matrices and parts cost-band markups create itemized vehicle proposals for customer approval and exact service billing. Shared pricing versions export with consultant templates and import as drafts. [Pricing setup and limits](docs/AUTO-REPAIR-PRICING.md). [Assigned inspections](docs/AUTO-REPAIR-INSPECTIONS.md) add reusable checklists, employee work timers, measurements/photos, reviewed job costs and private customer reports. Also includes NHTSA VIN lookup, explicit staff review, real service-client links and preserved lookup history, with duplicate/retry and stale-edit protection. See [vehicle setup and current mechanic limits](docs/AUTO-REPAIR.md).
- **Restaurant operations**: costed menus with sizes/sides/extras, a cart for configured pickup orders, ingredient lots/expiry, purchasing, public reservations with booking hours, floor/waitlist/kitchen, priced checks, online pickup with payment at pickup, staff shifts and employee attendance, restaurant journal entries/daily close, and limited specials with shared discount limits and recorded advertising results. [Kitchen prep](docs/RESTAURANT-PREP.md) adds measured ingredient consumption, batch yields, source-lot history, prepared stock and food-cost postings. [Owner reports](docs/RESTAURANT-REPORTS.md) add date ranges, reviewed opening-hour comparisons, channel/menu totals and private CSV downloads. See [setup and current limits](docs/RESTAURANT.md).
- **Employee logins** (`/admin/users`): create accounts or link existing team members, assign roles, and generate one-use setup links. Employees land in **My work** (`/me`) with their assigned tasks, private notes and personal AI roadmap. See [employee setup and permissions](docs/EMPLOYEE-ACCOUNTS.md).
- **Sidebar profile selector**: switch between the enabled profiles. Shared tools stay available; profile-specific tools follow your selection. Taxes and service billing are under Money; programs, fundraising, volunteers and governance have their corresponding groups.
- **Assistant → Mail → Notes → My roadmap**: create and edit durable notes, select the notes the AI may read, discuss your job goal, review an editable roadmap, and save progress. Manual planning works without AI. AI uses a separately configured local Ollama model or Anthropic account; no model is downloaded by setup.
- **Service workflows**: client/location → inquiry → proposal acceptance → signed agreement/deposit → resource booking → work/checks/changes → customer acceptance → invoice → recorded payment/reconciliation. Private client links expire after seven days and can be revoked.
- **Nonprofit workflows**: donors/gifts/pledges/receipts/acknowledgments, grant awards and cash, restrictions/allocations, campaigns, volunteers/shifts, programs/enrollment/attendance, reviewed costs/outcomes/reports, events, memberships and governance.

Workflow actions validate references, enforce transitions, preserve revision history, and protect confirmed financial records. All new workflow records use a private SQLite database. A payment marked confirmed represents an externally completed transaction with recorded evidence; the action does not itself charge a card. Recurring gift schedules need an actual provider subscription reference. Provider automation coverage is listed in the [workflow guide](docs/WORKFLOWS-AND-RELEASE.md).

Existing tools include customer imports, expenses/receipt uploads, calendars, pricing, orders, inventory, shipping, marketing, accounting connections and custom trackers. Their individual documentation is in `docs/`.

## WordPress plugin

Upload `dist/shuug-business-wordpress-0.1.0.zip` through **WordPress → Plugins → Add New → Upload Plugin**. Set your backend HTTPS address under **Business → Connection**, then add `[shuug_workspace]` to a page. Choose website capabilities in Business → Connection: customer login, confirmed booking for agreed work, customer-specific prices, wholesale ordering, order status, restaurant table booking and pickup ordering, invoice payments, donations, quote requests, volunteer signup and contact forms. The plugin also provides employee work, private notes/AI roadmaps, specialist business forms, account administration and access to the full application. Follow the [customer website guide](docs/CUSTOMER-WEBSITE.md). Invoice payments and one-time donations use Stripe Checkout through the backend, with private customer authorization, verified payment status, test-mode isolation and durable retries. See [website payment setup and limitations](docs/WEBSITE-PAYMENTS.md).

**The WordPress plugin connects to this separately hosted backend; it does not run the Node.js backend inside PHP hosting.** It shares the existing accounts, permissions and records. WordPress users connect their own business accounts; a WordPress administrator needs the actual backend owner password to connect as owner. Read the [installation and permission guide](docs/WORDPRESS.md).

Build the uploadable ZIP with `npm run wordpress:package`. No Shopify store or WooCommerce installation is required.

## Optional Shopify and MCP

Run `npm run backend:setup`, then import the private `.data/mcp-client.json` into your MCP client. Authenticated HTTP is at `/api/backend`; Streamable HTTP MCP is at `/api/mcp`; stdio is `npm run mcp`.

The MCP includes record definitions, reads, saves and validated transitions for service/nonprofit workflows, plus transactional restaurant commands, staff scheduling, reviewed VIN lookup and versioned repair pricing/proposal commands and assigned inspections. Its credential authorizes the entire client workspace, including confidential records. Give each client a separate deployment and data volume.

Shopify remains disabled until a client enables and connects it. OAuth, signed app-proxy calls, webhook verification, durable sync queues, reconciliation and optional product/inventory writes are included. You do not need a store to install the app. Follow the [Shopify/backend guide](docs/SHOPIFY-BACKEND-MCP.md) when a client wants a connection.

## Hosting, updates and recovery

Set `APP_BASE_URL` to the public HTTPS origin before deploying behind your reverse proxy. Keep `DEALDESK_DATA_DIR` (default `.data`) on a private persistent volume. The example `compose.backend.yaml` includes the web app and optional Shopify worker; see [deployment and recovery](docs/WORKFLOWS-AND-RELEASE.md).

Stop the web app and workers before backing up:

```sh
npm run workspace:backup -- backup /private/backups/business-2026-09-10
npm run workspace:backup -- restore /private/backups/business-2026-09-10 /private/restored-business
```

Restore refuses to overwrite an existing directory and verifies checksums and SQLite integrity first. Keep the complete backup private: it includes the vault key, encrypted credentials and business data. If you use external Postgres, back that database up separately. Password rotation: `npm run workspace:setup -- --reset-password` revokes existing owner sessions.

For an update, stop writers, take a backup, retain the previous source release, install dependencies, regenerate Prisma, build, then restart with the existing data directory. Test recovery into a new directory before switching a real deployment.

## Verification and release

```sh
npm test
npm run lint
npm run build
npm run workspace:smoke
npm run planning:smoke
npm run release:source
```

`workspace:smoke` starts one temporary production HTTP server, verifies owner and employee sign-in, account activation, private task access, role-forgery denial, immediate revocation, and the donation/program/service acceptance paths using synthetic data, then stops it and removes its private test workspace. `planning:smoke` needs your configured AI provider and sends only a synthetic planning request. Neither check uses a browser runtime.

The source archive and checksum appear in `dist/`. Packaging excludes `.data`, credentials, dependencies, build output and Git history. No repository is published automatically. Check [enterprise readiness](docs/ENTERPRISE_READINESS.md) for remaining release gates, including visual verification, SSO/MFA and deployment hardening.

## Yes, you can make money with this

Rename it, white-label it, customize it, host it, and charge clients for your software, implementation or support. There is no project revenue share or feature paywall. Keep the copyright and license notice required by [MIT](https://opensource.org/license/mit). Third-party dependencies retain their own licenses.

Accounting coverage: the [QuickBooks manual audit](docs/QUICKBOOKS-MANUAL-ACCEPTANCE.md) tracks every chapter and its unresolved requirements. `/ledger` provides reviewed manual posting and retained reversal history; Money → Chart of accounts provides classified custom accounts, subaccounts and history; `/books` provides the filterable coverage checklist. Full QuickBooks parity is still under implementation.

Money → Collections now records dated product-invoice receipts and bank returns with supporting evidence, captured journal entries, retained fees and retry protection. [Receivables instructions and limitations](docs/RECEIVABLES.md).
