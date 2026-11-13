# Connecticut EITC, 2023–2025

`state-ct-eitc.mjs` derives the refundable state credit from the same-year federal
EIC and its saved source facts and combat election. The supported path is an
original full-year Connecticut resident return using the same filing status as
the federal return. No credit, wage total or business profit can be entered as
an independent override.

The base is 40% in all three years. The 2025 schedule adds $250 for an eligible
claimant with a qualifying child listed on line5. The supplement is added after
any state allocation; the separate-status allocation itself is not supported.
The calculation rounds the exact base product once to whole dollars, adds the
supplement, and supplies schedule line16 for CT-1040 line20a. State refundable
payments remain separate from federal settlement.

`newCTEarnedIncomeCredit()` creates unknown original-return/filing-status facts,
four incomplete source reviews and empty wage/business lists. It lives at
`individual.stateReturns[CT].earnedIncomeCredit`. Every W-2 and Schedule C must
have one stable source link. W-2 disclosures add original employer EIN/state ID
and Connecticut withholding. Positive withholding must match a distinct reviewed
CT-1040 statement by identifier and exact original amounts. Existing state W-2
employer identifiers are reconciled. Business income comes from the calculated
Schedule C line31; the original EIN or actual owner's SSN supplies the business
identifier. State IDs must be provided or explicitly reviewed as absent on the
source. An unreviewed blank is unknown.

Federal valid-SSN EIC children supply the state identity, relationship code,
calendar months and actual student/disability checkbox branch. Dependency claim
and EIC child qualification remain separate. All qualifying children are retained;
the annual form's permitted child continuation handles more than three. Required
CT-Dependent disclosures are independently prepared by the resident integration.

`calculateCTEitc(input, ctState, federalResult)` returns `required`, `known`,
`eligible`, `amountCents`, `lines`, `questions`, linked source rows, children,
forms and diagnostics. Its `ct1040eitc` form item carries cents-only monetary
lines, `rateBps:4000`, and a null allocation ratio. A known positive federal
credit without complete state sources leaves the state amount unknown. Proven
federal disqualification preserves zero without demanding irrelevant sources.
Neither this source review nor a known amount establishes agency acceptance.

## Explicit boundaries

- Separate federal/state filing status requires an independently reconstructed
  separate federal AGI and annual lines12–15, which are not inferred.
- Part-year, nonresident and amended state returns remain outside this path.
- In 2025, an eligible federal table-rounded zero within the child income range
  does not prove a zero state child supplement. The amount remains unresolved.
  A qualifying child lacking a valid SSN also requires separate CT treatment;
  a positive or within-range zero self-only federal award is not silently
  converted into a state childless credit or an added $250.
- The original schedule and instructions describe mixed withholding differently.
  Mixed positive wages with and without CT withholding remain unresolved while
  all original rows are retained. Zero-dollar W-2s do not create this ambiguity.
- More than three printed wage or primary-business rows require a reviewed
  continuation/selection treatment; none are dropped to fit the form.
- No 2026/2027 CT EITC annual pack is substituted. The existing main 2023 CT-1040
  source DRAFT mark remains a separate filing-template limitation.

## Sources and verification

`data/ct-eitc-sources.json` pins eleven official sources, including three annual
two-page Schedule CT-EITC originals, annual CT-1040 instructions, DRS guidance
and the amended §12-704e statute. The source forms have no AcroForm widgets;
the annual PDF module uses pinned overlays. The 2023 instructions incorrectly
refer to federal line27a; the actual annual federal and CT schedules identify
line27. This anomaly is retained in the source record.

Focused tests cover annual federal-to-state amounts, rounding, source identity,
withholding order, stale-year rejection, original/separate status, child identity
and checkbox branches, source overflow and both supplement uncertainty paths.
`test/state-ct-eitc-source-reference.mjs` verifies original bytes and printed
annual rules. `test/state-ct-eitc-reference.json` explicitly classifies the
$2,182/$2,452/$2,849 Connecticut Grey-family results as derived arithmetic with
synthetic CT facts. They are not published CT taxpayer examples or certification.
