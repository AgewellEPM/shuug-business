# New York Empire State child credit originals

`state-ny-child-pdf.mjs` renders the unchanged 2023, 2024 and 2025 IT-213
originals. `nyChildPdfYearPack(year)` supplies the original IT-213 and
IT-213-ATT pins and maps to the annual PDF pack. `renderNYChildForm` accepts
the calculated item with `empireChildCredit`, monetary `lines`, integer
`counts`, source `children` and annual eligibility `flags`.

The first six children appear on IT-213. Additional children appear on the
same-year IT-213-ATT original, seventeen per page. Up to the model's 100 retained
children are preserved. Every attachment repeats the filer name(s) and SSN.
The renderer does not duplicate the editable source identities or infer a birth
date. The field named `Year of Birth` on the older originals actually requires
the complete printed **mmddyyyy** date. The attachment is a prescribed official
form, not a generated lookalike or a prior-year relabeling.

The 2024 PDF retains misleading 2023 money field names. Printed 2024 lines
5, 6, 7, 8, 9, 10, 11 and 12 map respectively to native fields
`Line 6 Dollars`, `Line 7 Dollars`, `Line 8 Dollars`, `Line 9 Dollars`,
`Line 13 Dollars`, `Line 14 Dollars`, `Line 15 Dollars`, `Line 16 Dollars`.
The 2025 original has a different one-page layout and generic zone names;
its money and child-count fields have separate maps. Fixed printed amounts
are never filled again. Source names and identifiers remain complete; an
unprintable or too-long value stops the export instead of truncating it.

SHA-256, byte count, page size, rotation and native field count are checked
before filling. The original fields are flattened, actions and annotations
removed. Audit entries contain field references, choices, attachment pins and
counts; they do not copy names, SSNs or birth dates. Unknown amounts stay blank.
`nyChildWorkpaper` preserves the linked source children, annual intermediate
worksheets and source reviews separately from the original form.
The reconstructed `worksheets.federalPayroll` is labeled **New York old-law
payroll alternative from current original sources**. It may apply to three
timely ITIN children even when modern federal Schedule8812 PartII does not.
Actual federal Credit Limit Worksheet B imports used by the New York
Worksheet A line11 remain separately identified and subject to applicability.

The calculation decides eligibility and whether an original should be emitted.
The 2025 instructions explicitly say not to submit a zero-or-negative credit
form. This renderer itself does not authorize filing, supply a signature or
claim software approval. No 2026 or 2027 original is substituted.

`data/ny-child-form-sources.json` pins the six forms and three annual instructions
from New York Taxation and Finance. The 2023 instruction PDF URL returned404;
the official annual HTML instructions are pinned instead. Source downloads,
native field inventories, extracted printed geometry and synthetic review
artifacts are in the project evidence cache, not taxpayer data.

Verification: `node --test packages/tax-engine/test/state-ny-child-pdf.test.mjs`.
Tests use the bounded temporary-file `test/pdf-text.mjs` extractor to check
actual printed rows, full birth dates, distinct annual counts, reversed/stale
field naming, the six/seventeen-child boundaries and all100 children, plus
wrong-year bytes, unsupported years, unknown blanks and rejected truncation.
Actual `calculateReturn` and `generateDraftPdf` paths cover annual $30,000 and
$80,000 wages, the independent 2025 unclaimed-child rule, the under4/age4–16
split, seven-child continuation, IT-201 line63 transfer, zero-credit omission,
and unresolved identity or conflicting birth sources suppressing the original.
The 2024 actual packets also verify the $686 old-law payroll alternative for
both three-SSN and three-ITIN groups, and the $330 ITIN/ODC-plus-solar case where
the actual federal Credit Limit Worksheet B is inapplicable.
These are engineering checks of source calculations and original PDF output;
agency acceptance and installed visual acceptance remain separate gates.
