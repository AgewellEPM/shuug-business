# Shuug tax preparation engine

This package supplies limited **2023–2025 federal draft preparation packs** for both
individual/self-employed and business returns. It is integrated with the
independently trusted encrypted client and its existing client/staff authorization
boundary. Partial 2026 individual calculations and final Schedule C/SE templates
are also installed, plus limited Connecticut and New York resident packs for 2023–2025.
It is not a completed filing product.

Inputs are versioned structured records containing integer cents. Calculations
use exact integer arithmetic, explicit whole-dollar rounding, the complete
2,062-row official IRS Tax Table for 2023–2025 below $100,000, and that year's Tax
Computation Worksheet above it. The final 2026 Tax Table is missing, so tax below
$100,000 remains unknown; higher amounts use the published 2026 statutory rates.
Different years never inherit these rates.

| Return | Current calculation / draft form coverage |
| --- | --- |
| Individual 1040 | Ordinary W-2 wages, taxable interest, ordinary/qualified dividends, standard deduction, entered withholding/estimates |
| Self-employed | Schedule C eligible expenses/profit, per-person Schedule SE wage cap and Medicare tax, deductible half of SE tax, limited simplified 8995 QBI, Schedules 1 and 2 |
| Additional Medicare Tax | Form 8959 ordinary Medicare wages/SE income and W-2 box 6 withholding reconciliation; RRTA/unreported wages and uncollected box-12 tax excluded |
| Residential energy credits | Form 5695 / Schedule 3, reviewed eligible costs at one home, annual caps and tax limits, clean-energy carryforward; 2025 manufacturer identifiers |
| Household employment | Schedule H annual worker limits, Medicare/withholding, FUTA Sections A/B, late contributions and annual credit reduction; separate taxpayer/spouse employers |
| Investment income | Schedule B payer records/foreign disclosures and limited Form 8960 interest/dividends/capital gains, reviewed MAGI and deduction scope |
| Capital income | Schedule D / 8949 ordinary securities, reviewed adjustment codes and short/long carryovers; qualified dividend / capital-gain tax worksheet |
| Retirement and benefits | Reviewed ordinary IRA/pension distributions, qualified Roth distributions, eligible rollovers and Social Security benefits worksheet; basis, annuity, early-distribution and special elections remain limited |
| Inventory | Schedule C Part III and Form 1125-A for reviewed cost/LCM components; source-based capitalization, itemized costs and aggregate reconciliation |
| New York resident | 2023–2025 IT-201 / IT-2, annual NYS/NYC/Yonkers rates, benefit recapture, household/school credits, reviewed MCTMT and mandatory linked W-2 supplements |
| Connecticut resident | 2023–2025 CT-1040 resident calculation, annual rates/credits, reviewed adjustments, property/use tax and payments; other jurisdictions/supplements remain explicit gaps |
| 2026 individual | Published annual standard deduction, SS base and QBI minimum; final C/SE templates. Main 1040 and several schedules remain unavailable |
| Partnership 1065 | Ordinary business income/deductions, exact ordinary-income owner allocations, partial K-1 workpapers |
| S corporation 1120-S | Ordinary business income/deductions, exact ordinary-income shareholder allocations, partial K-1 workpapers |
| C corporation 1120 | Ordinary taxable business income, regular corporate tax, estimates/balance, Schedule J |

Enter tax-adjusted eligible deductions, not gross spending. Ownership inputs are
reviewed ordinary-income allocation percentages, not an inference from book
transactions or a complete partner-capital/basis computation. Stable owner IDs
break whole-dollar rounding ties, preserving the total regardless of roster order.

Unsupported treatments remain attached to the original input and diagnostics.
Known missing additional taxes, complex QBI and loss limitations suppress a
complete tax/balance figure rather than supply zero. A saved review checkbox is
a preparer's declaration, not independent verification. Every result has
`filingReady: false`; there is no transmission or acknowledgment fabrication.
New York intake can reveal federal dependent-credit, claimability or age-65
requirements. Those source facts now withhold affected federal deduction, credit
and settlement totals until their federal worksheets exist, while retaining known
AGI for state preparation. A state record never supplies a missing federal credit. IT-2 source facts also
flag unresolved federal allocated tips, statutory-employee routing, dependent-care,
HSA/adoption benefits and uncollected/409A additional taxes. Ordinary W-2 box 1
input cannot silently absorb those missing treatments.

## Forms and sources

Each of `forms/2023`, `forms/2024` and `forms/2025` contains twenty original public IRS PDF templates. `manifest.json`
and `templates.mjs` pin the original URL, SHA-256, byte count, pages and fields.
Connecticut CT-1040 originals have no fillable fields, so their reviewed annual
coordinate overlays use separate pinned state templates. The 2023 DRS-linked
original still carries its agency draft mark; no verified final 2023 state template
is claimed. The generator checks templates before filling mapped fields, flattens the form,
removes interactive actions/annotations, and adds calculation/diagnostic pages.
Every page is visibly marked **SHUUG DRAFT - DO NOT FILE**. Blank disclosures,
signatures, questions and unsupported schedules remain unfinished. Unsupported
glyphs or field overflow fail export rather than truncate source values.

Field suffix mappings were checked against the pinned PDF text and geometry.
Tests inspect actual flattened PDF text and the positions of selected official
amount rows, including 1040 total tax, Schedule C profit, QBI and Schedule J.
This is engineering verification, not an independent tax-provider certification.

The generated table records its IRS instructions HTML source hash.
`scripts/tax/import_irs_tax_table.py` can rebuild it from a locally saved 2025
IRS instructions HTML snapshot. It refuses another year, missing intervals or
the wrong published worked example. New IRS revisions require review of both
source and generated differences. Year-specific reference links are in
`catalog.mjs`; do not silently replace this pack with mutable current-year rules.

## Run and package

```sh
npm ci --prefix packages/tax-engine --ignore-scripts
npm ci --prefix packages/secure-tax-client --ignore-scripts
node --test packages/tax-engine/test/*.test.mjs
node --test packages/secure-tax-client/test/returns.test.mjs
node packages/secure-tax-client/prepare-browser.mjs --output EMPTY_DIRECTORY
node --experimental-vm-modules scripts/tax/verify_browser_artifact.mjs EMPTY_DIRECTORY
```

PDF text verification uses `pdftotext`. The independent artifact includes the
locked local PDF library and its dependency licenses, public blank forms and pure
calculation modules. It makes no remote calculator call. Its default configuration
remains disabled. Same-origin fetch permission loads bundled public blank PDFs;
configured API calls still carry ciphertext and existing routing metadata only.

Return input is encrypted in the existing `tax-document` domain. A durable
encrypted retry is saved before upload; a lost receipt reuses the exact mutation
and ciphertext. Recovered pending returns appear in the existing retry queue.
Staff can calculate/export only client revisions covered by their signed grant
and sharing capsule. The correction editor can prepare a private review kit;
separate firm approval and owner MFA publish one exact encrypted replacement
with its fresh capsule. Their read grant remains unchanged. See the
[correction workflow](../../docs/SHUUG_RETURN_CORRECTIONS_20261109.md).
Preparers can also originate a new return for a signed client scope, using a
private review kit and separate firm approval of the initial encrypted revision.
This does not complete office document review, books or filing authorization.

## Work still required for the full product

The [qualification workflow](../../docs/SHUUG_FILING_QUALIFICATION_20261113.md)
and `node scripts/tax/qualification-report.mjs` reproduce the local reference
checks and identify gaps in selected official ATS scenarios. Neither constitutes
agency test execution or certification. Missing required W-2 box 6 values remain
unknown; they never silently become zero. [Schedule B and Form 8960](INVESTMENT-INCOME.md) require explicit income/MAGI/deduction reviews; unsupported investment treatments retain incomplete totals.

The [energy workflow](../../docs/SHUUG_ENERGY_CREDITS_20261113.md) requires explicit
eligibility review. Improvement credits consume ordinary tax before clean-energy
credits; only unused clean-energy credit carries forward. Missing reviews,
required manufacturer IDs or unsupported credit-limit treatments withhold totals.

[Household payroll](../../docs/SHUUG_HOUSEHOLD_EMPLOYMENT_20261113.md) is entered
per worker and quarter. Prior-year FUTA quarters preserve unknown versus zero.
Employer payroll liabilities reach Schedule 2, never the employer's withholding
credits. [Section B](HOUSEHOLD-FUTA.md) now uses reviewed state rate periods, contribution timing and per-worker state wage allocations, including annual credit reductions and printed continuation tables. State payroll returns and employer W-2/W-3 are separate.

Complete dependent/credit/age eligibility, Schedule 1-A, remaining special capital
and retirement treatments, rental/pass-through income, alternative inventory
methods, depreciation/assets,
entity disclosures, K/K-1 basis/capital/separately stated items, special taxes,
additional years and state/local returns. Complete broader encrypted office
editing/review, trusted enrollment/migration and frontend/key custody,
firm-book/billing projections, preparer/client authorization and filing.

IRS MeF/state transmission, testing/production approvals, acknowledgment and
rejection/amendment workflows remain real product requirements. Draft generation,
synthetic tests and a configured MCP workspace do not supply them. Payment
activation remains deferred under the current project instruction.

Detailed scope: [inventory](INVENTORY.md), [retirement](RETIREMENT-INCOME.md),
[New York](NEW-YORK.md) and [legacy posting conversion](../secure-tax-client/LEGACY-BOOK-CONVERSION.md).
