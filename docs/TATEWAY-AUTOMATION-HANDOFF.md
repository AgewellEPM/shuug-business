# TateWay shop automation — November 12

The active objective is a complete automated auto-shop business solution, not
only a demonstration. Luke selected TateWay's own provider accounts and a
dedicated cloud deployment. The public Vercel website and its original centered
design remain unchanged; no public intake connection or cloud host is claimed.

## Source and installed boundaries

- Engineering checkout: `/Users/lukekist/Worktrees/TateWayShuugAutomation-20261112`.
- Branch: `feat/tateway-shop-automation-20261112`, based on `03a60c1`.
- Private remote: `AgewellEPM/shuug-business`.
- Actual compiled acceptance build: `XYICSTwCjq6Evnr_mCVFC`.
- Build output is on PRO-G40 at `TateWayShuugBuild-20261112/.next`; the checkout's
  `.next` points there. Its parent has a dependency symlink for Node resolution.
- Existing real workspace3131, demo entrance3132/upstream3133, and GigTax3126
  were not upgraded or reconfigured by this engineering milestone.
- The temporary compiled server3134 was stopped (owned PID23465, session3541,
  exit143). Its private data and receipts remain for recovery. Do not infer that
  it is still running or restart it without checking the live port/process.

## Implemented paths

- Native automotive website form: request, self-reported vehicle details,
  optional versioned SMS consent, durable receipt, client/inquiry, eligible
  unverified vehicle and native owner inbox all commit in one transaction.
  Exact retries recover the original receipt. Existing customers/VINs are never
  silently associated using self-reported contact information.
- Staff follow-up tasks, appointment confirmations/reminders, agreed-work
  status updates and recorded-payment receipts use the native records.
- Canonical repair invoices use the existing service invoice and office ledger.
  Reviewed quote net/tax amounts and deposits post once; no duplicate Finance
  invoice is created. Customer completion acceptance remains explicit.
- Private invoice links reuse native Stripe reservation/verification/settlement.
  Automatic issue respects master and invoice settings; ambiguous drafts,
  scope changes and deposit allocations go to review.
- Message Center has transactional email/SMS queues, encrypted bodies, readable
  owner history with private links redacted, consent and STOP/START handling,
  signed Twilio/Mailgun callbacks, provider receipts and uncertain-send review.
  Sending is off by default and never enabled by the setup helper.
- `/shop` exposes owner controls and readiness. A supervised shop worker handles
  form tasks, invoice preparation, reminders, payment reconciliation and sending.
  Its lease renews during long passes and stops further phases after takeover.
- The real stdio/HTTP MCP has53 tools, including shop/website/communications
  catalogs, reads and commands. `scripts/tateway-mcp-setup.ts` previews/applies
  the exact plan and configures native intake/workflows/settings, preserving
  existing owner decisions and providers. It never dispatches messages.
- `deployments/tateway-auto` contains the dedicated persistent-volume/Caddy
  cloud profile, readiness checks, exact MCP setup and recovery instructions.
  A Railway variant is separate from the portable server profile.

## Evidence earned

The source compiled, typechecked and built successfully before the final review
fixes below. Through actual stdio MCP into compiled HTTP, the isolated fixture
completed website intake → customer/inquiry/vehicle/inbox/task → reviewed quote
→ accepted proposal/agreement → booked, completed and accepted work → one invoice.

Synthetic reviewed amounts posted exactly10000 cents revenue +625 cents tax to
10625 cents receivable. There was one service journal entry, zero Finance copies,
zero payments and zero provider attempts. The625-cent example is test data, not
TateWay's tax rate or a determination of taxable work.

Compiled owner/auth/origin checks, exact request retries, repeated worker/issue
idempotency, invoice privacy and token revocation passed. Private sanitized
evidence: `~/.shuug-workspaces/tateway-acceptance-20261112/receipts/compiled-live-verification.json`.
Raw proofs, private tokens, command checkpoints, keys and business data remain
outside Git. The tracked `scripts/tateway-live-check.ts` is deliberately pinned
to this isolated build/workspace; prepare a new guarded fixture for a new build.

Focused tests passed for native intake, financial posting/Stripe/billing,
communications, MCP, notification reservation/receipts, worker leases and health.
Compose configuration was validated without launching Docker or any VM.
These are source/compiled HTTP proofs, not actual provider delivery, public TLS,
Linux-container execution or Luke's visual acceptance.

## Final review changes and current blocker

After the compiled acceptance pass, review added master-pause checks inside
automatic invoice transactions, local accounting dates, fair invoice backlog
ordering, the Stripe form-action allowlist, long-pass lease renewal, payment
receipt notifications, all-history message counts, fail-closed bounded inbound
email and clearer provider configuration/readable message history.

Several of these focused checks passed before disk/access failures. The latest
financial/connection/history changes still require the final typecheck, focused
regressions and rebuilt compiled acceptance. Do not claim the old build proves
the latest source. PRO-G40 began rejecting file reads with `EPERM` even after
approved escalation, including dependencies and its build directory. Both disks
were also nearly full. A request to restore drive access is pending. Do not
delete unrelated files, install another dependency tree, or claim failed checks
passed. Only dispose of explicitly owned generated caches with appropriate access.

## Remaining acceptance gates

1. Restore readable/writable build/dependency access; finish final checks and
   compile. Install the exact new frozen build into the intended real/demo
   services while preserving each data directory, credentials and other firms.
2. Finish the dedicated cloud deployment after the hosting account is connected
   and actual cost/resources are approved. Railway was suggested, not verified
   connected; no host, VM/container, volume, DNS or certificate was provisioned.
3. Initialize the owner's private sign-in; prove HTTPS, client isolation,
   restart persistence, supervised worker behavior and backup/restore on the host.
4. Connect TateWay's own Stripe, Twilio and Mailgun accounts through Connections.
   Verify sender/domain/number setup, signed callbacks and actual test-mode
   delivery/payment behavior, then explicitly authorize live operation.
5. Wire the real enabled form into the public Vercel website, preserving the
   approved layout. Verify a real public request reaches the correct business,
   followed by the owner/customer pilot and Luke's screenshots.
6. Verify the wider parts/inventory, expense/report and customer-portal journeys
   against their existing native implementations. Template visibility alone is
   not proof of complete automation or correct stock/accounting behavior.

Keep the full goal active until these end-to-end requirements are true.
