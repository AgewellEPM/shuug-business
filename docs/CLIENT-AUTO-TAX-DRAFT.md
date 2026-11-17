# Automatic tax drafts in the client's private workspace

An unlocked `client-only-v1` account now prepares a managed Form 1040 / Schedule C
draft from its current authenticated Gig Tax Pros records. Opening the account
performs a full encrypted sync first. Subsequent successful portal refreshes
recompute the draft without a separate generate action. An empty account does
not silently create a zero-income return.

The existing Shuug tax engine runs locally in the trusted client. No calculator
endpoint, administrator recipient, server decryption, or new provider is added.
The result is a draft within the engine's declared annual coverage. It neither
signs nor files a return and does not establish an agency acknowledgment.

## Source conversion and review

The adapter opens no keys and performs no network calls: it consumes only the
current vault's authenticated decrypted record map. Journal account/object
bindings must match. Exact duplicate copies count once; differing copies,
native conflicts, invalid dates/currency/amounts, unsupported formats and
contradictory deletion history block complete amounts. The semantic source
fingerprint includes relevant source variants, conflicts, deletions and intake
facts; unrelated chat, capture time and revision-only changes do not invalidate
the review. Source object/revision references remain available separately.

Entered income initially supplies provisional Schedule C receipts. The client
must reconcile it to gross business receipts before those figures become reviewed
totals. Bank downloads, trip fares, offers and provider payouts are not added to
those entries. Possible duplicates need explicit source-bound include/exclude
decisions; one bank transaction cannot be included twice. Missing income cannot
be proved zero by recorded trip fares. This distinction follows the IRS's
[1099-K gross-payment guidance](https://www.irs.gov/businesses/what-to-do-with-form-1099-k).

The first bridge is for one taxpayer-owned sole-proprietor gig activity. Native
partnership/corporation intake prevents routing into this Schedule C. The client
confirms the business arrangement; a default filing-status value is not proof
of status, ownership, income completeness or identity.

Every nonpersonal expense needs a current, fingerprint-bound tax category and
eligible deductible cents, including an explicit zero exclusion where applicable.
Amounts cannot exceed the recorded expense or its recorded business-use share.
A receipt, meal label or planning percentage is not itself a deduction. Actual
vehicle costs/depreciation require separate workpapers and are not implemented
by this bridge. Standard mileage requires an explicit eligibility review;
operating costs cannot be counted again. Parking and tolls still need their own
review. See [Schedule C instructions](https://www.irs.gov/instructions/i1040sc).

Business mileage uses verified dated IRS rates, original local dates, completed
nonoverlapping trips and exact decimal arithmetic. Missing dates, tracking gaps,
overlaps and known rate-boundary trips leave the amount unknown. The 2026 rate
change is respected; 2027 mileage is unavailable until an annual rate is pinned.
Sources and the rounding contract are recorded in
[the mileage receipt](verification/business-mileage-source-pin-20261117.json)
and the [IRS rate table](https://www.irs.gov/tax-professionals/standard-mileage-rates).

The managed activity owns only its app-derived income and deduction fields.
Other businesses, identity, wages, state inputs and other manually entered return
facts remain separate. Its source-controlled amounts cannot be silently edited
in the full return editor. Changed records invalidate prior gross-income review
and changed expense decisions; unresolved features suppress complete AGI/tax.
The panel lists missing return facts from the actual tax engine. Draft PDF export
requires reviewed app amounts; the output still carries the engine's draft marks
and incomplete-return diagnostics.

## Private persistence and concurrent work

One deterministic account/year UUID identifies the encrypted automatic draft.
The `client-auto-tax-draft` payload contains its account binding, settings,
semantic source digest and derived input. It uses the existing v3 single-client
envelope, account revision checks and durable exact-ciphertext retry queue.
Generated drafts are excluded from their own source fingerprint.

A lost acknowledgment retries the original mutation and ciphertext. A competing
revision is read and authenticated before a stale request is archived locally
as encrypted bytes. That durable copy precedes active-queue removal. The current
saved draft can then be loaded; an earlier copy can be opened separately for
review. Unpublished local edits require an explicit reload decision rather than
silently overwriting another session. Deleted drafts are not resurrected.

Private models, settings and unfinished view inputs clear on lock, account
change and page hide. Only encrypted pending and archived requests persist in
browser storage; no readable tax inputs, identity or amounts enter localStorage
or server logs through this feature. Explicit PDF/download actions create
readable files outside the vault and are labeled accordingly.

## Release evidence and limits

Focused checks cover real client-only HPKE Journal opening, source conversion,
engine calculation, exact saved ciphertext, missing-data behavior, independent
client reopening, quota failure, lost acknowledgments, conflicting sessions,
source-change invalidation, editor boundaries and view cleanup. These are
engineering checks, not tax-agency certification or an independent security audit.

The new native sync candidates still need app-store distribution and physical
device acceptance. A deployed portal/module check does not establish a completed
phone-to-hosted-account journey. The older accountant workspace's intentional
firm-sharing mode remains a separate profile and workflow.
