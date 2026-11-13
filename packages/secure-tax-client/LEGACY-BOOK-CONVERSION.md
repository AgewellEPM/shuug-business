# Reviewed legacy business-book conversion

The staff finance editor can now convert an authenticated imported client
business book into the canonical encrypted client ledger. It produces the
existing private review kit. Only separate firm approval and owner publication
write the resulting certified finance record. Importing an archive alone still
does not post anything.

## Trust path

`ledger.legacy.convert` carries `ledgerId`, the stable `bookId`, reviewed `from`
and `through` dates, the exact source document reference, retained `source`,
`reviewed: true`, and a client-visible review note. The private source is encrypted
in the proposal and in the resulting office history. No source names, account
numbers, amounts or action contents are added to public approval metadata.

Both staff preparation and offhost firm approval call `selectedCaseEvidence`.
That function opens the actual evidence envelope under the current enrollment
and staff assignment, verifies its sharing capsule, then independently verifies
the original migration signature, source digest, destination and period seal.
The conversion source must equal that authenticated source. The firm derives the
postings again, checks the private-review commitment and signs the resulting
office body. A handcrafted authenticated staff proposal cannot bypass this
original-source check.

`legacy-book-conversion.mjs` derives the current ledger directly from the retained
source. No caller-supplied after-state is accepted. The office certificate keeps
the complete source and conversion command, making later replay deterministic.

## Posting and business identity

- Every retained journal is included once. Whole safe-integer cents must balance.
  Repeated account lines on the same side are combined exactly; lines with both
  debit and credit on one account are rejected for reconciliation, never netted
  away or silently dropped. Original lines remain in the retained source.
- Original journal IDs map deterministically to canonical IDs under the stable
  legacy book UUID. Reversal links, original authors, recorded times, reasons and
  source kinds remain traceable. Missing, cyclic, multiply reversed or
  inconsistent reversal histories fail conversion.
- All retained accounting dates must fit the reviewed range. The historical
  conversion can span years, so it carries actual earlier balances instead of
  inventing opening journals. Original future postings are rejected.
- Original active period closure is enforced. Full close/reopen history and seal
  digests are retained; inconsistent chronology or a final active seal that
  disagrees with that history is rejected. An explicitly reopened source remains
  open. Subsequent approved journals obey the resulting period lock.
- Inactive source accounts remain inactive for new ordinary journal postings.
  Their historical entries and classifications are preserved.

Converted identity is `legacy:<source book UUID>`. A second conversion of that
UUID is rejected even when it comes from another archive revision, backup,
document or source login. Revised source history needs a separate reconciliation
workflow; it cannot be imported again as new money.

Ordinary `ledger.open` optionally carries a `bookId`. Existing histories without
one retain the `default` scope and their prior nonoverlap behavior. Distinct
business identities may have overlapping dates. Periods within the same business
must not overlap. Reserved legacy identities must originate from an approved
conversion, after which later ordinary periods can use that identity. Regular
periods retain the 366-day bound; the historical converted ledger is the explicit
exception. New ordinary periods still require reviewed opening balances.

Tax cases may link a ledger containing the whole case year. Their default report
uses that year's income activity while including all earlier retained postings
in the balance sheet. Book changes still require renewed link/draft review.

## Business invoices, bills and review

Imported business documents remain a traceable subledger baseline: original
invoice/bill metadata, credits, settlements, historical balances and mappings to
approved journal IDs are retained. They create no firm invoices and initiate no
payment or refund. The canonical business ledger reflects their already-posted
source journals once, rather than posting those documents a second time.

The preview and approved view compare each receivable/payable control-account
balance to the retained document balances. Any unmatched amount remains explicit
for reconciliation; no balancing invoice is invented. Later general-journal
adjustments do not rewrite the historical invoice baseline. A full editable
business AR/AP invoice workflow remains separate from firm billing.

The approved view shows original posting provenance, period events, source
freshness and subledger links. Missing or changed source evidence becomes visible
and affects linked case readiness without erasing approved postings. The offhost
inspector includes the selected source JSON and before/after finance reports.

## Bounds and remaining limits

Conversion requires stored journal state, explicit stored account metadata and
a stored period record. Missing metadata is not reconstructed from an assumed
legacy catalog. Source discrepancies must be reconciled before conversion.

Current limits include 100 accounts, 2,000 source journals, 100 historical command
receipts, 5,000 rows per retained audit array, and the existing 1 MiB certified
office body / 2,000 office actions / 100 ledger scopes. Other existing private
review framing limits still apply. Capacity errors preserve all source and
current history; conversion does not truncate or split silently. Larger books
and the common legacy case with no explicitly stored account catalog need
additional reviewed migration tooling.

This change does not migrate separate bank reconciliation, invoice delivery,
provider credentials or sharing links; alter real accounting processes; remove
legacy copies; or establish tax filing/certification readiness.

## Verification

`test/legacy-conversion.test.mjs` verifies exact posting/reversal/period behavior,
source UUID deduplication, separate businesses with overlapping dates, capacity
and missing-data rejection, inactive accounts, same-side aggregation and netting
rejection, reopened periods, unmatched control balances, annual income versus
opening balances, ordinary staff forms, and inert client rendering. Its real
crypto path prepares and approves a source-backed conversion, reopens the firm
certificate as the customer, and rejects a crafted HPKE proposal whose signed
source was changed even when the ordinary staff preparer is bypassed.

`scripts/secure-finance-http-proof.mjs` accepts `legacySourceId` to exercise
conversion through the compiled customer/staff API, actual firm approval and
owner publication. It checks the separate business ledger, original period lock,
unchanged firm fees, customer/staff reopen and encrypted backup restore. This is
synthetic integration evidence; no installed customer books were converted.
