# Encrypted case working ledgers

The independent staff client can now open a working ledger within an encrypted
tax case, post balanced journals, add classified accounts, reverse an earlier
posting and close a posting period. The assigned preparer and client see the
same certified history, balances and reports after refresh. A later book change
invalidates the draft's previous book review.

This is a bounded case-ledger milestone. It does not complete client-wide
bookkeeping, migration, firm receivables/billing, client filing authorization or
the full tax product. It does not merge the older ordinary Client books into
encrypted cases or combine books across cases. No live office upgrade occurred.

## Office workflow

1. Select a current signed client grant in the independent staff client, then
   select the client's case under **Client case work**.
2. Choose **Open this case's working ledger**. Review its title, USD currency,
   dates within the case's 2025 tax year and starting chart. Opening an empty
   ledger does not import opening balances. Use reviewed journals for those.
3. Add accounts or choose **Post a balanced journal**. Enter the date, description
   and debit/credit lines. Select an opened supporting file when available; the
   review kit includes that exact encrypted revision and its readable evidence.
   A journal without an attached file remains explicitly labeled as such.
4. Save the private case review kit. Review it on the separate trusted operator
   computer. The existing `inspect-case-review.mjs` now includes before/after
   ledger reports in `review.json`, as well as the actual selected file.
5. Approve the exact reviewed kit through `case-offline-cli.mjs` or the separately
   controlled cloud worker. The worker reconstructs the ledger from actual
   decrypted history, reapplies the command and checks the private commitment.
   Owner MFA publication installs ciphertext and the fresh preparer capsule.
6. Client and preparer refresh to see balances, trial balance, income activity,
   original/reversal entries and source freshness. Selecting a report range
   changes income activity; balance-sheet rows retain earlier postings through
   the end date. The private CSV contains trial-balance amounts in exact cents.
7. Review the draft against the current books and select **Link a prepared
   draft**. The link records the current book version inside encryption. It
   does not copy amounts into the return or certify tax treatment.

CSV downloads and operator review kits are readable private copies. Handle them
through the firm's trusted private workflow. No readable journal descriptions,
chart, amounts, source links, book versions or commands are sent to host metadata.

## Accounting and review rules

- Every posted line uses a known account, an exact nonnegative cent amount and
  exactly one debit or credit. Each account occurs once per journal. A journal
  needs 2–100 lines and equal total debits and credits. Each line is bounded at
  99,999,999,999 cents; every aggregate is checked for exact integer arithmetic.
- Accounts have explicit classifications. Bank, receivable and payable balances
  sum direct postings to every account in that class. Account numbers and
  classifications are retained in the certified history; the starting chart is
  recorded in the open command rather than silently taken from future defaults.
- A reversal adds the exact opposite lines and retains the original. Its date
  must be on or after the original and in an open period. An original can be
  reversed once; reversal entries cannot themselves be reversed. Corrected
  entries are separately reviewed postings.
- A period lock only advances, within the ledger's date range. Journals and
  reversals cannot post on or before the locked date. Earlier reports retain
  the original posting until the actual reversal date.
- Reports use **ledger timing**. They do not claim cash/accrual treatment,
  deductibility, automatic reconciliation, tax-line mapping or final financial
  statements. Income activity and cumulative unclosed earnings are distinct.
- The reference on a supported posting binds object ID, domain, revision and
  envelope digest. An active source that changed, disappeared or is outside the
  current read scope makes case readiness incomplete. Reversed originals retain
  their historical source state but no longer make an active balance depend on
  that source. Reversing and replacing a posting preserves both decisions.
- Every book action changes the private book version. A draft link must name
  the exact version current when linked. Later book actions mark that review
  stale, even if the resulting balances happen to be unchanged. Source changes
  also remain visible independently of the book-version link.
- All existing case limits remain: at most 256 retained actions, a 128-KiB
  case body and 100 accounts. No history is truncated to fit. A capacity limit
  refuses the proposed change. This is not an unbounded operational ledger.

## Protocol and distribution

The five new private commands are `books.open`, `books.account.add`,
`books.journal.post`, `books.journal.reverse` and `books.period.close`.
`draft.link` optionally carries `booksVersion`; it is required to match the
current ledger when a ledger exists. Old document-only cases and draft links
remain readable without rewriting their signed content.

The case certificate, native v2 envelope, public proposal/approval framing and
v1 read grants are unchanged. This does not grant direct staff writes. The
unchanged server verifies opaque approval/scope/CAS and cannot read or validate
the ledger. Validation belongs to the updated independent client and key worker.

Distribute the updated client and the selected updated custody package together
before publishing book actions. Older clients/workers reject unknown commands;
they do not silently ignore postings. Both custody packages include the new
ledger model. The browser artifact excludes private firm modules and still ships
with activation disabled unless separately configured through trusted delivery.

## Verification and remaining work

The [execution receipt](verification/encrypted-case-books-20261112.json) records
synthetic model, browser-controller/DOM, separate operator process, cloud-worker,
Swift/CryptoKit, API and compiled HTTP evidence. The updated client/worker path
passed against the existing compiled opaque host; no server rebuild was needed.
That is a deliberate compatibility test, not an installed service upgrade.

Next connect authoritative client-wide encrypted books and firm receivables,
payments/credits/refunds and correct client balances. Preserve the separation
between a client's business receivables and fees owed to the tax firm. Then
bind client authorization to the exact complete filing package and current
sources/books/return, with revocation and correction history. Broader tax coverage,
authentic filing/acknowledgments, enrollment/lost-key recovery, trusted migration,
reconciled installation and real office/screenshot acceptance remain unfinished.
Payment activation remains deferred; no provider or real taxpayer was activated.
