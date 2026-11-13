# Inventory and cost of goods sold

The encrypted business editor calculates a source-based inventory rollforward
for Schedule C and Forms 1065, 1120-S and 1120. Schedule C Part III is populated
for 2023–2026. Entity returns attach the original Form 1125-A: November 2018
revision for 2023, November 2024 revision for 2024 and 2025. Entity 2026 remains
unsupported by its annual return pack.

Opening inventory, gross purchases, personal withdrawals, labor, materials,
itemized additional section 263A costs, other costs and closing inventory remain
in the encrypted input. The engine subtracts withdrawals from purchases and
calculates goods available and cost of goods sold. Printed component lines round
to dollars before addition; the workpaper retains original cents and the rounding
difference. Form 1125-A lines 4 and 5 have supporting cost statements in the
packet. The source references and reviewed valuation explain the closing amount;
the engine does not appraise inventory or determine a capitalization exemption.

Supported valuation selections are cost and lower of cost or market, with
explicit quantity, valuation, accounting-method, opening-balance, capitalization
and duplicate-expense reviews. Additional section 263A amounts must come from a
reviewed allocation. Alternative small-business methods, method changes and
section 481(a), subnormal writedowns and LIFO require additional calculation and
form coverage. They remain preserved and unresolved. Partner withdrawals also
require actual K/K-1 distribution and capital/basis treatment. Corporate personal
withdrawals leave income and tax unresolved until fair market value, basis and
property-distribution gain are established.

Earlier aggregate COGS stays available for reconciliation. A nonzero aggregate
must match the original-cent component rollforward. Missing or conflicting inventory leaves
dependent income, AGI, self-employment tax, QBI, Medicare tax, corporate tax and
ordinary-income allocations unknown. It never silently treats missing COGS as
zero. These are draft packets; entity disclosures and filing remain incomplete.

Primary sources: the IRS [Schedule C instructions](https://www.irs.gov/instructions/i1040sc),
[2018 Form 1125-A and instructions](https://www.irs.gov/pub/irs-prior/f1125a--2018.pdf),
and [2024 Form 1125-A and instructions](https://www.irs.gov/pub/irs-prior/f1125a--2024.pdf).
Exact annual source hashes are in `test/inventory-reference.json` and the annual
form manifests. Tests use synthetic calculations, original rendered amount rows,
unknown propagation and editor save/reopen; they are not agency qualification.
