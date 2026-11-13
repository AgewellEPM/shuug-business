# New York earned income credits, 2023–2025

The resident pack calculates ordinary New York and NYC earned income credits
from the current, computed federal award. It also calculates the separate
noncustodial-parent alternative from retained person records, original support
orders, current obligations and actual payments. IT-215 or IT-209 is attached to
the preparation packet using the unchanged, pinned annual form. This does not
establish OTDA eligibility verification, agency acceptance or filing certification.

## Calculations and source links

`calculateNYEic(input, state, federal, context)` returns separate ordinary,
noncustodial and city amounts, source diagnostics, annual form lines, worksheets
and attachment records. The caller supplies independently calculated IT-201
line 39, line 40, New York AGI and established locality. The selected state
amount transfers to line 65 or line 66, never both. NYC transfers to line 70.
The larger state claim is selected; equal amounts use the ordinary claim.

Ordinary IT-215 uses the actual printed federal EIC, annual AGI line, saved
federal combat election and computed federal EIC worksheet. Every original W-2
must link to one reviewed IT-2 statement. Schedule C and SE records must reconcile
by business ID and owner. The primary business supplies its EIN, or the business
owner's SSN when it has no EIN. Earned wages, business profit, half-SE deductions,
interest, dividends and net capital gain are reconciled to the federal calculation.
An entered total cannot replace these source calculations.

The ordinary state calculation applies 30% of federal EIC and subtracts the
smaller of household credit and tax remaining after the resident and available
accumulation-distribution credits. The current source workflow supports a reviewed
absence of those two credit forms. Positive or unresolved amounts remain unknown;
they are not represented by a manually entered override. NYC uses the annual
10%–30% graduated rate worksheet, including the instructed four-decimal rounding
before multiplying federal EIC. NYC may remain known when only state Worksheet B
is unresolved.

All valid-SSN federal EIC qualifying children are retained, including people not
claimed as federal dependents. Additional children
use a continuation statement. The unusual federal self-only award with an
attached child who lacks a valid timely SSN remains an explicit unresolved New
York identifier treatment. Unsafe or incomplete child identities prevent an
original schedule from being emitted; the source remains in the workpaper.

## Noncustodial-parent alternative

A federal EIC of zero does not establish a zero New York noncustodial credit.
Existing returns without the new source section require a reviewed exclusion
unless an independent known annual AGI cutoff already excludes IT-209.
`newNYEic()` creates unknown answers, never a reviewed absence. Completeness
reviews cover children and the entire current support-order set.

Each child links to an existing retained person ID. Identity, biological/adoptive
parent relationship to the actual claimant, age, residence and timely employment-
valid SSN must have original reviewed sources. Spouse parentage is not inferred
from joint filing or from the taxpayer's relationship to the child. Retained and
new household evidence must agree. Unreviewed age or relationship classifications
cannot remove a possible child from the completeness check.

A qualifying New York SCU order must satisfy the annual one-half-year requirement.
The installed ordinary calculation recognizes unambiguous periods of at least
184 effective days and retains 181–183-day boundary periods as unknown; it does
not equate six calendar months with half the annual day count. OTDA's referenced
06-ADM-12-T Attachment 5 describes a six-month test. Its current bytes could not
be downloaded during this audit, so it is recorded as supporting research rather
than a byte-verified source. These boundary cases need confirmed SCU/calendar
period treatment before either credit eligibility or exclusion is established. All overlapping current orders, including non-SCU orders, must have
current support paid at least equal to current support due. Successor/modification
orders whose separate shorter periods collectively span half a year remain
unresolved until their continuity is established; their periods are not silently
combined into a qualifying order. Invalid/missing links and contradictory
claimant marriage or identity records remain unknown. The ordinary resident
scope requires matching federal/state filing status, an original return and no
Form 2555 treatment. Separated married claims require the applicable actual
separation sources.

IT-209 compares 20% of the hypothetical single-filer one-child credit against
2.5 times the hypothetical no-child credit using the applicable filing-status
column. Both annual comparison thresholds come from IT-209 itself. They are
not replaced by similar federal worksheet thresholds. The New York instruction
table is independently verified against the installed exact federal table before
sharing its lookup implementation. The reference contains 932, 982 and 1,009
annual rows, 8,760 numeric cells and all nine partial-interval footnotes.

Each owner with combat pay has a separate New York include/exclude election.
All candidates are calculated, but the selected amount stays unknown until the
actual election is saved. This election may differ from the federal election.
Original Worksheet A/B values and owner-linked business deductions remain in
the calculation result. A federal age denial can coexist with a positive
noncustodial credit because the IT-209 claimant minimum is 18.

## Sources, verification and remaining scope

`data/state-ny-eic-sources.json` pins eight annual instruction originals and six
annual forms. The official annual 2023 IT-215 HTML supplies that year's
instructions; its annual PDF URL returned 404. `data/state-ny-eic-reference.json`
retains the independently extracted IT-209 tables and footnotes. Runtime source
modules and `test/state-ny-eic.test.mjs` preserve exact annual arithmetic,
source-conflict propagation and the distinction between known component amounts
and unknown settlement. PDF geometry and actual packet checks are documented in
[NY-EIC-PDF.md](NY-EIC-PDF.md).

Primary instructions:

- [2023 IT-215](https://www.tax.ny.gov/forms/html-instructions/2023/it/it215i-2023.htm)
- [2024 IT-215](https://www.tax.ny.gov/forms/html-instructions/2024/it/it215i-2024.htm)
- [2025 IT-215](https://www.tax.ny.gov/forms/html-instructions/2025/it/it215i-2025.htm)
- [2023 IT-209](https://www.tax.ny.gov/pdf/2023/inc/it209i_2023.pdf)
- [2024 IT-209](https://www.tax.ny.gov/pdf/2024/inc/it209i_2024.pdf)
- [2025 IT-209](https://www.tax.ny.gov/pdf/2025/inc/it209i_2025.pdf)

Part-year/mixed-city residency, differing federal/state filing status, amended
claims, positive resident/accumulation credits and exceptional earned-income
sources still need their own calculation/source paths. Other New York family
credits, including Empire State child, dependent-care and NYC income-tax
elimination credits, retain their separate coverage gates. An EIC calculation
does not resolve those credits or imply a complete New York return. No 2026/2027
state form or rate is inferred from this annual pack.

The 2025 Empire State child definition is independent of the federal dependent
claim. A retained potential qualifying child can therefore leave IT-201 line63
and settlement unknown even when absent from the state dependent list. Reviewed
negative residence/relationship facts can exclude that person. An age exclusion
also requires sourced, reviewed identity; an unreviewed birth date cannot establish
a zero credit. This guard does not calculate or award IT-213.
