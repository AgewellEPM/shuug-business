# Connecticut EITC and dependent schedules

The 2023–2025 packs include unchanged original DRS Schedule CT-EITC and
Schedule CT-Dependent PDFs. `data/ct-family-form-sources.json` pins the six
originals and the annual CT-1040 instructions. Each EITC original has two
612-by-792-point pages; each dependent original has one 792-by-612-point page.
They contain no AcroForm fields. The generated `.fields.json` inventories record
those original dimensions and empty field lists.

`state-ct-family-maps.mjs` records annual pins and measured printed boxes.
`state-ct-eitc-pdf.mjs` and `state-ct-dependent-pdf.mjs` overlay the originals
through `state-ct-overlay.mjs`, which verifies the hash, length, page structure,
rotation and field count before writing. It removes document actions and does
not truncate identifiers, names or amounts. Private values are confined to the
PDF; the export audit records field locations and counts, not their contents.

The EITC renderer prints the model's reviewed questions, linked employer and
business identifiers, derived income amounts, child identities, actual reviewed
months, and annual lines 8–16. Line 9 is already printed at .40. The 2025 line 15a
and relocated amount rows use the 2025 geometry; the earlier originals are not
relabelled. Separate-return allocation rows can be rendered for geometry testing,
but the current calculation does not claim that unsupported allocation is ready.

The CT-Dependent renderer consumes the federal model's claimed, eligible,
reviewed dependent records without separate editable identities. It prints the
four original rows and total count. Both schedules add clearly named continuation
statements containing taxpayer name/SSN and the required additional identities;
all 100 supported federal dependent records fit across bounded continuation
pages. EITC income-source overflow is rejected until a reviewed primary-source
selection or continuation treatment is implemented. Child and dependent
continuations are expressly allowed by the annual DRS instructions/originals.

Focused tests extract actual PDF text with bounding boxes, verify the printed
annual positions, test complete continuations, pin failures, changed-year bytes,
unknown blank amounts, and the complete central draft-PDF route. The 2023 main
CT-1040 original still contains its existing DRAFT mark and retains
`sourceDraft:true`. No 2026/2027 schedule fallback or filing certification is
implied by these preparation packets.
