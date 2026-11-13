# Encrypted legacy client business accounting

The copied-backup preparation now retains business accounting for books whose
stored `clientId` exactly matches the independently reviewed source client.
It never selects a book by name, an employee grant, or an office-wide match.
The existing reviewed copied-backup/offhost CLI inputs and encrypted import
workflow apply; there is no live-data migration or new server route.

For each selected book, preparation reads only these document keys:

- `client-book:<bookId>` (`client-book`): complete supported book metadata,
  including the historical name, currency, revision and grants.
- `state:client-journal:<bookId>` (`state`): stored accounts, account-change
  audit, journal entries, reversal links/reasons, command receipts, journal audit,
  and client-business invoices/bills with credits and settlements.
- `accounting-periods:<bookId>` (`accounting-periods`): active sealed entries,
  original digest and complete close/reopen history.

Missing state and period documents are retained as `null`. A missing journal
produces an unknown balance, not an invented empty ledger. Absence of stored
accounts is reported as the historical default catalog being unavailable in
this source record; account numbers remain readable without guessed types.
Supported fields have strict bounded schemas. Unknown structural fields fail
preparation rather than silently copying an unexpected credential container.
Free-text accounting notes retain their original content and need the same
offhost source review as other client financial documents.

Office journal state, other clients' book/state documents, global audit and
command snapshots, provider connections/secrets, sharing tokens, and invoice
delivery metadata are excluded. A business settlement's nonsecret provider
payment identifier is retained as a historical reference. Original staff grants
are evidence only and confer no access in the destination account. Separate
bank-statement/reconciliation stores are not migrated by this path.

## Authentication and duplicate prevention

Each book is an existing `tax-document` envelope whose signed export entry adds
`sourceType: "client-book"` and the exact source plaintext SHA-256. Preparation
checks balanced safe-integer journal cents and verifies each original active
period digest before writing an export. The signed report separately counts
client business books, journal entries, billing documents, period events and
books missing journal state. Existing driver/receipt/tax-file report formats
remain accepted unchanged.

The customer import normalizes this into `type: "legacy-accounting"`, retaining
the entire source payload and exact firm-signed report bytes/signature. On each
customer or staff reopen, `opened-record.mjs` checks that signature, the destination
workspace/account/client, the selected source digest and original period digest
before supplying `verifiedLegacyBooks` to the view. Editing imported source JSON
does not produce verified accounting history. This historical proof uses the
original signed preparation manifest, so changing the destination client key
through the authorized recovery workflow does not invalidate historical evidence.
The current encrypted access and staff assignment checks still apply separately.

Duplicate detection uses the stable legacy book UUID within the destination,
including existing records and encrypted pending retries. Re-exporting another
backup or reaching the same book through another old customer login cannot create
a second destination object. Changed source revisions stop for separate
reconciliation; they do not overwrite earlier evidence.

## Readable history and current boundary

The private customer and staff views show exact journal lines, reversals,
trial-balance amounts, original business invoice/bill totals and settlements,
period events, and sealed journal snapshots. Large histories page locally in
groups of 50. All text uses inert DOM text nodes. Full retained source metadata
can be downloaded only through its explicit readable-JSON button. Locking clears
the surrounding opened-record view as before.

A journal that differs from its retained period snapshot, an inconsistent
reversal link, or a missing billing journal reference is visibly flagged for
accounting review. The retained versions remain available; no repair is inferred.
Trial balance covers all retained journal dates, not tax or cash-basis treatment.

**Import alone is authenticated source retention and review.** It does not
automatically create current ledger entries, business receivables, firm-fee
invoices, payments, tax deductions or filing authority. A separate reviewed
conversion is now available; see [canonical conversion](LEGACY-BOOK-CONVERSION.md).
Reconciliation of revised imports and omitted bank/delivery/provider stores,
backup recovery, and any separately authorized legacy removal remain distinct
requirements. Migration and product-completion flags remain false. The copied
backup is never modified.

## Evidence

`test/legacy-books.test.mjs` uses disposable synthetic SQLite backups and real
firm/client envelope crypto to verify exact source retention, isolation from
office/foreign/provider records, signed source tamper rejection, unknown missing
state, invalid seal rejection, source-ID duplicate prevention across old account
mappings and pending retries, and inert customer/staff rendering. The existing
14 migration tests continue to pass.

`scripts/secure-migration-http-proof.mjs` extends the compiled synthetic API
check with a signed business book. It imports through the actual `VaultClient`,
reopens the verified book on the customer and firm paths, checks exact journal
cents and period seals, and verifies retries keep revision 1. The parent
`secure-staff-http-check.mjs` includes this object in staff sharing and restored
encrypted-backup checks. This is synthetic integration evidence, not installed
office migration or approval to erase real records.
