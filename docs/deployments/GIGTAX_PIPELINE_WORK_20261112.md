# Active pipeline and contracts follow-up — November 12

This is an unfinished implementation checkpoint, not a deployment receipt.

User requirements: visible agent sign-in; send office contracts; show signup
locations and where each office stands: contacted, replied, waiting on whom/what,
next step and conversion. Both shared and agent senders are wanted. The user
confirmed the business mailboxes are **not set up yet**. Keep payments deferred.
Earlier direction remains tools only: do not populate a real office list or send
real messages. No real messages, contracts, payments or prospect writes were made.

Canonical branch is `feat/gig-tax-pros-sales-integrated` in
`/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`.
Current live baseline is still the completed Rolodex deployment
`dpl_CaZtZTPJ2JeuLMSURpLgyZQsUy5D`, source/evidence `910d718`.
Its prepared artifact tree is
`/Users/lukekist/BuildCache/GigTaxContacts-20261112/release-final/.vercel/output`.
None of this follow-up has been deployed yet.

Implemented locally: typed pipeline facts and progress recording; separate
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

Remaining: commit/push with remote SHA verification; deploy the guarded build and verify actual bytes and
production reads. Leave the owner portal open in Safari for the user's review.
Direct provider delivery/inbound receipt remains blocked by uncreated mailboxes
and absent Mailgun credentials; report that precisely, not as live sending.

Relevant new source: `sales/pipeline.mjs`, `contracts.mjs`,
`contract-delivery.mjs`, `mail-provider.mjs`, `mail-webhook.mjs` and their tests;
`public/rideshare-tax-pros/{sales-progress,sales-contracts,contract-signature}.js`;
existing service/handler/model/templates/console and native MCP schemas/transport.
The unrelated untracked How It Works receipt must remain untouched.
