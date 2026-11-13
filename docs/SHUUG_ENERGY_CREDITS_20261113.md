# Residential energy credit preparation

Shuug now calculates and exports limited Form 5695 / Schedule 3 preparation for
2023, 2024 and 2025. The existing encrypted return editor accepts property address,
eligible item costs, source references, manufacturer IDs, panel enabling-property
codes and prior clean-energy carryforward. Saved returns reopen through the
existing client and separately approved staff workflow.

The scope is one qualifying US home, with preparer-reviewed eligible costs and
annual product standards. Clean solar, solar water heating, wind, geothermal and
battery property, qualifying insulation/doors/windows, equipment and audits are
supported. Fuel cells, multiple homes, separate-return joint occupants and
fractional condominium/cooperative allocation require additional implementation.
Costs must already reflect eligible labor, rebates and business-use limitations.
2025 specified items require four-character QMIDs and retained manufacturer
verification; accepting the format does not verify a product or manufacturer.

Improvement credits consume ordinary tax first. Clean-energy credit uses the
remaining liability and carries unused credit forward. Improvement credit never
carries and neither credit offsets self-employment or Additional Medicare Tax.
Missing reviews/address/QMIDs and unsupported credit-limit treatments preserve
source records but suppress allowed credits and complete balance totals.
References: [2025 Form 5695 instructions](https://www.irs.gov/instructions/i5695),
[2024 instructions](https://www.irs.gov/pub/irs-prior/i5695--2024.pdf),
[2023 instructions](https://www.irs.gov/pub/irs-prior/i5695--2023.pdf).

Each annual original PDF has its own reviewed mappings and pinned bytes. Export
includes item costs, manufacturer IDs and source notes in a supporting statement,
including items exceeding the printed form rows. The two distinct IRS 2025 fields
sharing the suffix `f3_30` are addressed by full field name. Whole-dollar displayed
subrows sum to their category totals. All pages retain the draft marking.

Verification in [the receipt](verification/energy-credits-20261113.json): 92 focused
checks, 472 compiled synthetic HTTP checks, and independent packaged-client
execution of 123 modules / 12 annual return exports. Three
[published IRS examples](https://www.irs.gov/credits-deductions/frequently-asked-questions-about-energy-efficient-home-improvements-and-residential-clean-energy-property-credits-energy-efficient-home-improvement-credit-examples)
pass for every supported year. Tests inspect actual flattened PDF text/positions,
credit priority, missing data, rounding, overflow attachments and clear-on-lock.
The later focused PDF rerun passes 17 checks and verifies both duplicate-suffix
fields at their printed positions. No installed service was changed.

```sh
node --test packages/tax-engine/test/energy.test.mjs packages/secure-tax-client/test/energy-editor.test.mjs
node scripts/tax/qualification-report.mjs --out /new/path/qualification.json
```

This is preparation software under development. Neither published examples nor
draft PDFs establish complete ATS execution, real eligibility or agency approval.
The full requested federal/state/year scope, actual XML/transport/acknowledgments,
independent review, real key custody and installed office rollout remain open.
