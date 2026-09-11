# Connect → Configure → Attach → Automate

Shuug coordinates business work alongside your existing tools. Start at **Setup → Connect, configure & launch** (`/setup`). This guide describes the implemented path and its current boundaries.

## 1. Connect what you already use

Each provider card describes its supported actions, credentials and connection check. Secrets are kept in the backend vault and are never included in templates, source downloads or embed code. Owner access is required.

| Tool | What this release supports | Setup boundary |
| --- | --- | --- |
| WordPress | Employee workspace, customer access/ordering/booking links and public forms | Separate Shuug backend; only employees need WordPress accounts. Download the plugin directly under Attach. |
| Wix / Squarespace / another website | Hosted request links and iframe forms | An embed is not a native platform account connection. The site must permit iframe code; plan/editor restrictions may apply. |
| Shopify | Existing OAuth, verified webhooks, durable commerce synchronization and optional reviewed writes | Merchant authorization and app configuration are required. Website request automation does not reserve inventory or post order accounting. |
| QuickBooks | Existing OAuth, customer/invoice integration and reviewed sync screens | Requires an Intuit app and authorized company. Website intake does not post ledger entries. |
| Slack | Incoming webhook notifications to its configured channel | No conversation reading or arbitrary channel selection. The **Send Slack test message** button actually posts one labeled message. |
| Zapier | Existing prospect events/inbound prospect creation; new website request-reference delivery | Configure the downstream Zap yourself. A Catch Hook response does not prove downstream actions completed. |
| Stripe | Hosted Checkout for supported order payments; secret-key setup in Connections | Connection check reads account access. It does not charge a card or verify payment reconciliation. |
| Google Workspace / Microsoft 365 | Supported event forwarding through Zapier or the existing inbound-mail API | Native mailbox OAuth and two-way calendar synchronization are not implemented. |

Do not mark a provider proven just because credentials were saved. Use the labeled connection check, then complete a real workflow in the intended account. This release's automated tests use synthetic data and mocked external delivery; they do not establish live merchant/provider acceptance.

## 2. Configure the workspace

Start with **What do you run?**: ten searchable industries, six or seven questions and composable capability packs. Preview the workspace before applying it. See [industry setup](INDUSTRY-SETUP.md). You can also choose one or more Product, Service and Nonprofit profiles. Change the brand and visible tools using the same branding editor available at `/branding`. Save before continuing. Profile changes preserve underlying records.

Create employees through **Employee accounts**, assign roles, and share individual activation links. A selected assignee receives follow-up tasks in **My work**. Task assignment grants access to that specific website request's contact details; changing a task goal does not grant access. Owners can review all incoming requests.

Export a business template when you want to reuse the organization's configuration. Templates omit business records and credentials. Hosting a separate data directory per client remains the supported deployment model.

## 3. Attach a website form

Create a Contact request, Quote request, Appointment request, Wholesale application, Volunteer signup, or Job application inquiry. Specialized choices follow enabled profiles. The forms collect a name, email, message and affirmative consent. Quote intake also creates a prospective service client and linked inquiry; volunteer signup creates a volunteer record awaiting onboarding review. Other form kinds remain intake requests. These forms do not confirm bookings, purchases or payments. Use [customer website access](CUSTOMER-WEBSITE.md) for confirmed booking of agreed work, customer login, reviewed wholesale orders and order history.

1. Save a draft and preview it. Preview pages cannot accept submissions.
2. Enter exact HTTPS website origins allowed to frame it, for example `https://www.example.org`. No wildcard origins. Include any necessary platform editor/nested-frame origins; all ancestors must satisfy the policy. Leave the list empty to use a hosted link without embedding on another site.
3. Publish, then copy the embed or hosted link.
4. WordPress: choose published forms and customer capabilities in **Business → Connection**, then use their shortcodes. A Custom HTML iframe also works. Use `[shuug_workspace]` for the employee workspace. Wix: use an Embed HTML element. Squarespace: use an HTML Code block on a plan that permits iframes. Shopify: use a Custom Liquid section or a link in the theme.
5. Submit one consented request and confirm it appears under **Incoming website requests**. Pause intake by editing the form and clearing **Publish and accept requests**.

Only the dedicated anonymous form endpoint permits configured framing. Owner/employee pages keep their existing frame protection. Forms use no third-party cookies, JavaScript, API credentials or permissive CORS. Signed, expiring form proofs, byte limits, a honeypot, explicit consent and durable per-form/per-email limits bound intake. These controls do not replace a hosting-level abuse filter for a heavily targeted public site. Defaults: 100 new submissions per form/hour and 5 per email/form/hour. Contact data and consent remain in the private backend database and its backups.

The interface shows the latest 200 incoming requests and runs; earlier records remain in the backend. Support limits are 50 forms and 100 workflow versions. Sensitive intake requiring a specialized privacy/access model needs a domain-specific implementation.

## 4. Test and enable a workflow

Start with a complete supported path:

**Website quote request → create a task for Alice → Alice opens the request and follows up.**

Choose the saved form, task instruction, assignee and priority. Optional Slack/Zapier steps send a reference after the task is created. The reference includes event/request IDs, request type, received time and an owner workspace link. It omits the visitor's name, email and message. The Slack channel is determined by the webhook installation, not by natural-language text.

Use **Draft with AI** to propose the supported steps, or edit them manually. AI uses the already configured provider and receives the instruction you enter; no account credentials or incoming visitor records are included. Unsupported requested actions are listed for review. No AI response executes code, reserves inventory, posts accounting, charges payments or changes a live workflow. Review the complete request yourself before accepting a supported subset.

**Test workflow without sending** validates the configuration and displays sample steps. It is a dry run, not a live provider test. Enabling requires that exact tested definition and the same destinations within 30 minutes. Changes require another test. Enabling applies only to future submissions. A paused workflow cannot be resumed without reviewing and testing a new version.

Submissions and queued steps commit together. Local task creation normally runs immediately and has a durable idempotency key. Slack and Zapier deliveries require the worker:

```sh
npm run workflow:worker
# Or process the currently pending work once:
npm run workflow:worker -- --once
```

The provided Docker Compose configuration includes this worker, sharing the same private data volume and `APP_BASE_URL`. For another host, run it under a process supervisor alongside the web application. Keep its provider settings/data directory the same as the web app. Do not start a worker against real data just to test installation; it processes enabled delivery work.

Pause cancels steps that have not started. In-progress delivery may finish. Completed steps do not repeat. Interrupted local tasks retry with their original task ID; external delivery with an uncertain outcome stays in **review** and does not automatically resend. Inspect the destination before manually completing any missed work. Replacing/disconnecting a destination prevents the old workflow from forwarding to a new one; review and test a new workflow version.

The older `/automation` rules are signal detection and review screens. Their task/notification labels do not mean they persist tasks or send messages. The new website workflow engine executes the supported steps described here. General order-to-inventory-to-accounting orchestration remains future integration work.

## Verify an installation

```sh
npm run test:setup
npm test
npm run lint
npm run build
npm run workspace:smoke
```

The production HTTP check uses a disposable workspace to verify owner setup, plugin ZIP download, public form submission, duplicate prevention, assigned employee details, access denial, and the existing employee/nonprofit/service workflows. It never contacts an external message channel or modifies real business records. Visual verification requires the configured IsolatedTester MCP; its transport was unavailable during this release. Wix/Squarespace/Shopify theme embedding and live provider/account setup still need testing in the customer's environment.

Platform references: [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/), [Wix embedding](https://support.wix.com/en/article/wix-editor-embedding-a-site-or-a-widget), [Squarespace code blocks](https://support.squarespace.com/hc/en-us/articles/206543167-Code-blocks), [Shopify theme sections](https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor/customizing-sections), [Stripe account balance API](https://docs.stripe.com/api/balance/balance_retrieve), [WordPress plugin installation and permissions](WORDPRESS.md), [Shopify integration guide](SHOPIFY-BACKEND-MCP.md).
