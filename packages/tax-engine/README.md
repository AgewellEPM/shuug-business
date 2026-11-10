# Shuug tax preparation engine

This package supplies the first **2025 federal draft preparation pack** for both
individual/self-employed and business returns. It is integrated with the
independently trusted encrypted client and its existing client/staff authorization
boundary. It is not a completed filing product.

Inputs are versioned structured records containing integer cents. Calculations
use exact integer arithmetic, explicit whole-dollar rounding, the complete
2,062-row official IRS 2025 Tax Table below $100,000, and that year's Tax
Computation Worksheet above it. Different years never inherit these rates.

| Return | Current calculation / draft form coverage |
| --- | --- |
| Individual 1040 | Ordinary W-2 wages, taxable interest, nonqualified ordinary dividends, standard deduction, entered withholding/estimates |
| Self-employed | Schedule C eligible expenses/profit, per-person Schedule SE wage cap and Medicare tax, deductible half of SE tax, limited simplified 8995 QBI, Schedules 1 and 2 |
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

## Forms and sources

`forms/2025` contains eleven original public IRS PDF templates. `manifest.json`
and `templates.mjs` pin the original URL, SHA-256, byte count, pages and fields.
The generator checks these before filling mapped fields, flattens the form,
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

Complete dependent/credit/age eligibility, Schedule 1-A, qualified-dividend and
capital-gain treatment, retirement/rental/pass-through income, inventory/assets,
entity disclosures, K/K-1 basis/capital/separately stated items, special taxes,
additional years and state/local returns. Complete broader encrypted office
editing/review, trusted enrollment/migration and frontend/key custody,
firm-book/billing projections, preparer/client authorization and filing.

IRS MeF/state transmission, testing/production approvals, acknowledgment and
rejection/amendment workflows remain real product requirements. Draft generation,
synthetic tests and a configured MCP workspace do not supply them. Payment
activation remains deferred under the current project instruction.
