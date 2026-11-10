# Private client intake and firm billing

The trusted encrypted client has a routine multi-file inbox for statements,
receipts, invoice documents and other supporting information. Clients choose a
purpose/category, add notes, upload a batch, see each file's state and retry failed
items. Names, notes and exact file bytes are encrypted before upload. PDF, JPEG,
PNG and UTF-8 CSV are currently supported within the displayed limits.

An encrypted pending copy is committed to browser storage before its first upload.
If the server commits but the response is lost, retry uses the same ciphertext and
mutation ID. Pending uploads can be recovered after reload. Atomic storage updates
preserve concurrent tabs' queues. Raw selections and opened content clear on lock,
tab exit or authentication loss. New selections that have not yet been encrypted
must be selected again after lock.

The client's dashboard shows their opened files and entered business records.
Refresh runs every 15 seconds while visible, signed in, unlocked and idle, and
pauses during unsaved edits. Last-check and pending/error states remain visible.
Uploaded invoices are documents, not recorded payments or calculated balances.

Firm billing now supports invoice email from the existing invoice screen, through
a reviewed Mailgun preview and exact recipient/revision binding. A durable send
attempt prevents duplicate retries; uncertain responses require provider review.
Mailgun acceptance does not establish mailbox delivery. The existing private
invoice link and Stripe Checkout remain the online-payment path. Native billing
is also available through the actual `billing_catalog`, `billing_read` and
`billing_command` MCP tools.

## Verified boundary

Build `9h_nkSWkgyo230eSQ0qzW` passed 51 focused billing/MCP/navigation tests. The
customer, portal and staff browser modules passed 49 Node tests, including queue,
scope, lock, refresh and DOM regressions. These are code/DOM checks, not Safari
visual acceptance.

The compiled app passed 54 encrypted-client/staff checks using synthetic keys and
an explicit HTTPS-origin adapter to an owned loopback server. Three files survived
a lost upload receipt, reload-safe retry, authorized client refresh, signed sharing
to readonly staff and a stopped-writer backup/restore. Exact bytes matched; the
protected plaintext marker was absent from the host copy. This does not prove
public TLS, physical offhost custody or real enrollment.

Through real stdio MCP against that compiled app, the sample workstation has seven
working primary screens. A fictional $250 firm invoice with a fictional $100
recorded payment shows $150 outstanding. Its private rendering excludes internal
notes. No real invoice email, payment or provider account was activated.

A separate 86-check compiled stdio-MCP fixture verified invoice revisions, exact
retries, office/two-client book isolation and partial-settlement accounting after
stopped-writer backup and a fresh-process restore. Its external-fetch guard saw
zero provider attempts; all owned children and synthetic files were removed.
Detailed source hashes and limits are in
[the verification record](verification/client-portal-billing-20261108.json).

## Remaining work

### Current staff synchronization milestone — November 9

The independent staff reader now checks its selected signed client scope every
60 seconds while visible, unlocked and idle, or on the existing refresh button.
It uses the original complete read protocol and final grant recheck; no staff
write privilege or crypto format changed. Changed records still require new
signed sharing capsules. A missing capsule, withdrawn/revoked access or read
failure clears opened records and the summary rather than displaying old data
as current. Tab hiding/page exit locks the key and clears the view; late reads
cannot populate a different scope. There are no overlapping automatic reads.

Staff and clients now share the same record-count and exact-currency summary
renderer. The staff view explicitly describes its signed scope as potentially
partial. Invoice files, bank/provider facts and native snapshots do not become
ledger income, receivables or payment balances. This is a read synchronization
milestone; it does not post financial entries into the firm's books.

Across the client, portal and staff browser suites, 54 checks pass; one optional
native-Journal ciphertext fixture was not supplied and remains skipped. The
actual disabled staff entrypoint, assembled module imports, scope changes,
malformed decrypted views and authenticator tab switching are covered. Exact
source hashes and the final artifact location are recorded in
`verification/staff-client-sync-20261109.json`.

The compiled backend fixture passes 62 checks, including client uploads, a new
unshared income record clearing the staff view, offhost-approved sharing, an
approved revision refreshing the visible amount, page-exit clearing, and a
stopped-writer backup/fresh-process restore. The server used the unchanged
`9h_nkSWkgyo230eSQ0qzW` backend build and new browser modules from source. No real
client data, account activation, payment or installed-service update occurred.
The assembled independent browser artifact includes the new module and keeps
its strict CSP and offhost-tool exclusions. Public TLS, Safari/device behavior
and human visual acceptance remain unverified. Automatic staff checks currently
repeat the bounded complete signed read; an incremental staff protocol is not
claimed.

Real client use still needs independent trusted-client deployment, signed key
enrollment and the separate recovery/signing service. Staff must receive signed
sharing capsules before opening new uploads. Their current encrypted interface
is readonly. Shared financial projections, accountant corrections/review state,
office-book synchronization and client-visible payment balances remain incomplete.
The client's local dashboard does not substitute for those workflows.

Mailgun sender/domain setup and actual delivery verification, and Stripe account
setup and live payment verification, remain required. The separate running office
service was preserved; this implementation has not been promoted into it. Tax
calculations, filing-ready forms and federal/state transmission remain required
for the full filing product.

Luke explicitly deferred payment activation on November 9. Keep Stripe/payment
connection work pending until he changes that instruction.
