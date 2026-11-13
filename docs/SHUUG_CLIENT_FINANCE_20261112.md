# Encrypted client books and firm billing

The independent staff client now prepares a shared client finance record through
the existing private review kit → separate firm approval → owner MFA publication
path. Clients and assigned staff verify the private firm certificate and see the
same book reports, invoices and balance. This is source and synthetic execution
functionality; the installed service and real custody have not been activated.

## Working path

1. Open a signed client assignment in the independent staff client. Under
   **Client books and firm billing**, create its finance record and save the
   private review kit. Inspect and approve it on the separate firm computer or
   independently controlled key worker. Publish the approved encrypted packet
   using the existing owner approval upload.
2. Open a ledger period, add classified accounts, post balanced cent-based
   journals, retain reversals and close reconciled periods. Supporting files
   retain their exact encrypted revision references. Dates can span a fiscal
   year; reports describe posted ledger balances, not cash/accrual tax timing.
3. Link a case to the shared ledger, then review and link its draft against that
   book version. A book change invalidates every linked case review. An invoice
   or payment update leaves an unchanged book review current. Earlier case-only
   journals remain retained and are never silently merged into shared books.
4. Issue a firm invoice with explicit quantity, price, discount and tax amounts.
   Record completed partial payments, credits and refunds with unique references.
   An untouched invoice can be voided. Adjusted invoices retain all activity.
   Negative outstanding balances are client credits. No card/bank is charged,
   no refund is sent, and fee events do not automatically post business journals.

The same client-visible history, positive balance or credit survives a complete
host backup/restore. File counts in the intake dashboard remain distinct from
these posted invoices. The private operator inspector shows before/after finance
reports without sending financial fields to the app host.

## Binding and supported limits

- Exactly one canonical record per workspace, enrolled account and client scope.
  Its reserved object ID hashes those already-public opaque IDs. This makes the
  finance role recognizable to the host, but adds no names, balances or financial
  fields to public metadata. Distinct enrolled accounts are not consolidated.
- Creation uses the host's atomic revision/publication checks. A second creation
  cannot replace existing history. Generic customer edits/deletion are refused.
  A distinct private certificate purpose binds the whole finance history to its
  exact account, client, object and revision. The canonical ID cannot certify an
  ordinary tax case, and finance cannot certify under an arbitrary case ID.
- USD only; up to 100 nonoverlapping ledger periods of at most 366 days, 100
  accounts per ledger, 100 lines per invoice, 2,000 total retained finance events
  and 1 MiB of private finance history. Capacity is rejected without dropping
  history. Journal/account constraints remain those of the case ledger model.
- Case links currently require the case's calendar-year period. Tax calculations
  remain the existing partial 2025 federal drafts. Fiscal books do not imply
  fiscal return support. Invoice tax amounts are explicit staff inputs, not a
  sales-tax determination engine.
- Sharing, grant expiry, revocation and fresh enrollment are still required.
  Both independent-client and custody packages must be upgraded together; older
  clients reject the new private type/actions. The public opaque host protocol
  is unchanged. No legacy readable books or invoices were imported.

## Evidence and remaining work

[Execution receipt](verification/client-finance-20261112.json): 165 Node checks
pass with one unrelated full native-journal fixture skipped; 34 secure API
checks pass. The compiled HTTP fixture passes 320 checks including duplicate
creation rejection, client/staff balance agreement, shared review invalidation,
private metadata scanning and clean restore. The packaged client executes 98
modules in Node V8/DOM, including disabled finance controls before trusted setup.
Separate-computer CLI approval and the cloud worker run with synthetic keys.

This is still a prototype. Exact-package client authorization, complete tax
coverage, live filing/acknowledgments, enrollment/recovery/migration and a
reconciled installed rollout remain unfinished. Real payment collection stays
deferred. No real taxpayer, provider payment, physical custody, public TLS,
Safari screenshot or installed office acceptance is claimed by these checks.

The requested coverage target is tax years **2023–2026**, all four federal
families (1040/Schedule C, 1065, 1120-S, 1120), and **all 50 states**. That is a
target, not current support. Work continues beyond this finance checkpoint.
