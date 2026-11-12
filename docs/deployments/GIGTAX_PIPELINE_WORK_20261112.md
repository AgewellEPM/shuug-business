# GigTax pipeline, contracts and signup locations — November 12

Deployed and verified. Human visual acceptance and actual email delivery remain unverified.

User requirements: visible agent sign-in; send office contracts; show signup
locations and where each office stands: contacted, replied, waiting on whom/what,
next step and conversion. Both shared and agent senders are wanted. The user
confirmed the business mailboxes are **not set up yet**. Keep payments deferred.
Earlier direction remains tools only: do not populate a real office list or send
real messages. No real messages, contracts, payments or prospect writes were made.

Canonical branch is `feat/gig-tax-pros-sales-integrated` in
`/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`.
Live deployment is `dpl_98Q6B9mVuKY1JQp2x19Q7C3Q6irU` at
https://gigtax.pro, source `5baa007` (GitHub SHA verified).
The tested release is
`/Users/lukekist/BuildCache/GigTaxPipeline-20261112/release-final`.
It preserves baseline `dpl_CaZtZTPJ2JeuLMSURpLgyZQsUy5D` except the
explicitly requested changes described below.

Implemented and deployed: typed pipeline facts and progress recording; separate
payment-deferred agreement signature/receipt; contract preparation and retrieval;
shared/agent sender details; reviewed manual-email composer and explicit manual
send records; one durable Mailgun attempt with uncertain-outcome protection;
signed delivery/opt-out/reply callbacks; six optional native Shuug MCP tools.
The UI adds Contracts, Signup locations and Senders, cards with contact/reply/wait/
next step, signed-address/state view, and an Agent sign-in public footer link.
Public changes must be limited to this exact footer link; preserve all other
public content, artwork, media, routing/CSP/headers.

Evidence so far: all 159 focused checks pass, including the real stdio MCP over
synthetic HTTP, signed callbacks and the complete shipped DOM path through
signature/signup locations. The full TypeScript check passes. Actual Worker/D1
workflow evidence is `gigtax-workflow-backend-20261112.json`; its four diagnostic
boards were archived and verified. No real prospect records were created.
The release guard verifies all 137 baseline artifacts: 60 public assets unchanged,
23 public HTML pages gain only the sign-in footer, existing routes/headers/CSP
remain exact, and one mail callback route is added (176 total artifacts).

External-drive dependency access was intermittent. A bounded cache of only
lockfile-pinned public SDK/DOM/TypeScript check packages now serves this checkout.
Other dependencies point at the original tree, which was not changed. The
original link is preserved under the task's BuildCache; no browser runtime was
downloaded. Internal storage remains low; preserve unrelated files.

Live proof: `gigtax-workflow-live-final-20261112.json` verifies all 176
published hashes, all 91 static HTTP responses and 83 protected public files/
headers. Installed Shuug MCP reads all six tools and agrees with the deployed
workspace: zero real offices, agents, contacts, contracts or sender records.
Email and payments are unconfigured. Anonymous access and foreign origins are
rejected, and the unconfigured mail callback returns 503.

## Using the workflow

Open `/sales` or use `~/bin/gigtax-sales` for private local owner access. Public
footers include Agent sign-in. Under **Sales team**, create an agent, assign
territories/offices, and share the login URL and access code privately.
Select an office in **Pipeline** to record contact/reply, who is waiting, next
step and date. Contract preparation requires reviewed independent ownership.
Use the office's contract section to prepare its private signing link and review
an exact email from an available sender. **Contracts** retains send history and
signed agreement downloads. **Signup locations** shows signed offices by state
with saved street/city/ZIP and map links; it does not imply paid activation.

Under **Senders**, save shared and agent identities. A saved address is not an
email account connection. Until a mailbox exists, copy links for authorized
sharing. Once a working account is available, the reviewed email-app composer
can open the message; explicitly record actual sends afterward. Opening the app
alone does not mark anything sent. Record replies manually through progress.

## Remaining email setup

Luke confirmed shared and agent mailboxes are not set up. No mailbox accounts,
paid services, provider credentials, real messages or domain/DNS changes were
created. Those are the remaining direct-send/inbound-delivery prerequisites.
The adapter supports Mailgun; the email-app path can use any working mailbox.
Configure secrets privately in production, never in source/chat/client assets:
`GIGTAX_MAILGUN_API_KEY`, `GIGTAX_MAILGUN_DOMAIN`,
`GIGTAX_MAILGUN_REGION` (`US` or `EU`), `GIGTAX_MAILGUN_MODE`
(`test` or `live`), and `GIGTAX_MAILGUN_WEBHOOK_KEY`.
Direct sender addresses must use that configured sending domain. Configure
signed delivery/complaint/unsubscribe callbacks and a correlated inbound-reply
route to `https://gigtax.pro/api/sales-mail-webhook`. This is contract-thread
tracking, not a general inbox. The sending provider is separate from mailbox
hosting. Domain authorization and actual outbound/inbound tests still need to
be completed with the intended business accounts.

The adapter makes one durable provider attempt; acceptance is not recipient
delivery. Test mode never counts as contact, delivery or conversion. An uncertain
attempt requires owner review before another send. No real delivery has been
verified. Payments remain deferred by explicit instruction. Human Safari/phone
acceptance remains Luke's.

Relevant new source: `sales/pipeline.mjs`, `contracts.mjs`,
`contract-delivery.mjs`, `mail-provider.mjs`, `mail-webhook.mjs` and their tests;
`public/rideshare-tax-pros/{sales-progress,sales-contracts,contract-signature}.js`;
existing service/handler/model/templates/console and native MCP schemas/transport.
The unrelated untracked How It Works receipt must remain untouched.
