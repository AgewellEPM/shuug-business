# 2026 federal preparation boundary

Checked November 13, 2026. Final annual rates and final return forms are separate
dependencies. The installed sources support 2026 ordinary annual deductions,
Social Security limits, statutory tax schedules, a limited QBI calculation and
the final Schedule C/SE blanks. The full 2026 federal return pack remains incomplete.

The current IRS final Form 1040, Tax Table and main instructions still identify
2025. The IRS lists a 2026 Form 1040 draft; no draft is installed as a filing form
or used to create a tax table. Ordinary taxable income below $100,000 therefore
returns an explicit missing-table diagnostic and an unknown tax amount, including
zero taxable income. At or above $100,000, the final statutory base-plus-excess
rates are available, labeled as statutory calculations rather than a final IRS
Tax Computation Worksheet. Form rounding determines the $100,000 boundary.

Final 2026 basic standard deductions are $16,100 single/separate, $32,200 joint/
surviving spouse and $24,150 head of household. The Social Security wage base is
$184,500. The limited QBI threshold uses the amounts actually published in
Rev. Proc. 2025-32: $403,500 joint, $201,775 separate and $201,750 other returns;
these are not inferred by halving another status's amount.

Section 199A(i) adds a $400 minimum QBI deduction when aggregate qualified income
from materially participating businesses reaches $1,000. `qualifiedBusinessDeduction2026`
accepts the reviewed active portion after the owner's deductible self-employment
adjustment. The $1,000 test uses the supplied cents. It does not convert an unknown
active-business allocation into an exemption. Prior-loss allocation and income
above the applicable annual threshold remain explicit incomplete work. These
limited calculations do not establish complete Form 8995/8995-A coverage.

The downloaded final 2026 Schedule C separates city, state and ZIP and adds
vehicle-loan interest at line 16b. General other interest belongs at line 16c.
The 2026 field map is independently recorded; it does not reuse the 2025 map.
Final Schedule SE and its 2026 instructions are available and retain the ordinary
92.35% net-earnings and combined 12.4%/2.9% calculation path. Other SE arrangements
still require their own workpapers.

All source byte counts/SHA-256 pins and the observed final/draft availability are
in `data/2026-sources.json`. Only the two reviewed final schedule PDFs appear in
`forms/2026/templates.mjs`. Their identity/amount mappings are in
`form-maps-2026.mjs`. Full-return PDF export must retain explicit missing-form
diagnostics; it must never replace the unavailable main return with another year.

Authoritative sources:

- [IRS Revenue Procedure 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf),
  annual rates and thresholds.
- [SSA annual determination](https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf),
  2026 contribution and benefit base.
- [26 U.S.C. 199A](https://uscode.house.gov/us/usc/119-118/t26/s199A/),
  active-business minimum deduction.
- [2026 Form 1040-ES](https://www.irs.gov/pub/irs-pdf/f1040es.pdf),
  final annual estimated-tax guidance; no estimated payment or filing is made.
- [Schedule C](https://www.irs.gov/pub/irs-pdf/f1040sc.pdf),
  [Schedule SE](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf), and
  [SE instructions](https://www.irs.gov/pub/irs-pdf/i1040sse.pdf), pinned final 2026 revisions.

Tests distinguish statutory arithmetic vectors from IRS-provided examples,
exercise the unavailable Tax Table boundary and QBI floor, and inspect text from
the actual populated 2026 PDFs. None establishes agency acceptance, complete
annual coverage, production readiness or support for another unimplemented tax
treatment.
