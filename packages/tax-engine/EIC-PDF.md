# Earned Income Credit annual PDF support

The 2023–2025 packets use the unmodified annual IRS Schedule EIC originals.
Each annual manifest and template inventory pins the URL, SHA-256, byte length,
two-page count and actual AcroForm field count: 39 for 2023/2024, 38 for 2025.
The field inventories come from the pinned bytes and were reconciled with the
reviewed source cache. No 2026 or 2027 original or earlier-year fallback is added.

Primary sources are the annual
[2023 Schedule EIC](https://www.irs.gov/pub/irs-prior/f1040sei--2023.pdf),
[2024 Schedule EIC](https://www.irs.gov/pub/irs-prior/f1040sei--2024.pdf),
[2025 Schedule EIC](https://www.irs.gov/pub/irs-prior/f1040sei--2025.pdf), and
[2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf),
pages 40–48. Prior-year line-27 annotations follow the corresponding annual
Form 1040 instructions, rather than the 2025 checkbox layout.

`eic-pdf.mjs` exports `eicMaps`, `eicIdentity`, `eicAnnotations`, and
`eicWorkpaper`. The ordinary PDF pipeline passes the computed
`earnedIncomeCredit` result on its main Form 1040 and Schedule EIC items.
Schedule EIC has empty monetary `lines`; its child fields are identity data.

The attachment requires a known eligible positive credit and one to three
reviewed child rows. Valid-SSN amount children are selected first, up to three.
For a self-only credit with a qualifying child who has no valid EIC SSN, the
schedule contains Child 1; it retains a recorded ITIN, ATIN or nonvalid SSN and
leaves the identifier blank when none exists. The schedule does not create
dependency claims or infer an EIC child from a claimed-dependent count.

Child names, identifier, birth-year digits, relationship and explicit reviewed
U.S. home months are printed in their annual fields. No days-to-months conversion
occurs. The supported ordinary-residence input must supply 7–12 months, including
the instructed 7 for more than half a year but less than seven months. Special
birth/death/placement exceptions require their own reviewed eligibility support;
this renderer does not manufacture those exceptions. The under-19-and-younger
branch skips lines 4a/4b. Otherwise, the student-and-younger or disability branch
sets the appropriate annual yes/no checkboxes. If an independently qualifying
disabled child's student/younger comparison is unresolved, line 4a remains blank
and the workpaper identifies that missing comparison; the known disability
answer is retained on line 4b.

Form 1040 line 1i prints only the selected nontaxable combat-pay election. It does
not increase taxable wage income. The EIC amount uses line 27 in 2023/2024 and
27a in 2025. The separated-spouse marker belongs to Schedule EIC in 2023/2024
and Form 1040 in 2025. The 2025 main-home checkbox uses the reviewed aggregate
filer residence result, including both spouses when filing jointly.

Known zero is not a general instruction to check 2025 line 27c. The explicit
`noCreditIndicator` result identifies the annual instructed denial/worksheet-stop
branches; earlier forms instead receive “No” beside line 27. Unknown results and
a high-AGI exclusion alone leave this marker blank. Clergy line 27b is separate.

Focused tests flatten the actual annual templates, extract their printed text
with the bounded file-based `test/pdf-text.mjs` helper, and check values and
checkmarks against the original widget coordinates. End-to-end packet tests
exercise the normal `calculateReturn`/`generateDraftPdf` route separately.
All packets retain the draft marking. This scope does not establish paid-preparer
due diligence, Form 8862 completion, agency certification or filing acceptance.
