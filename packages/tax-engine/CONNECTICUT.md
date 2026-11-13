# Connecticut resident pack, 2023–2025

The encrypted individual return now holds a separate `individual.stateReturns`
collection. Connecticut full-year residents can prepare CT-1040 from the federal
AGI, reviewed Schedule 1 adjustments, Connecticut withholding, estimated and
extension payments, eligible property taxes, reviewed use-tax worksheet amounts
and an election to apply overpayment to next year. State liabilities remain
separate from federal totals. No state return is transmitted or acknowledged.

The calculator applies each year's Tax Calculation Schedule: exemption reduction,
seven rate brackets, phase-out add-back, recapture and personal credit. The 2024
rate reductions and additional recapture stage are annual rules; 2023 rates are
not reused. Property credit applies the $300 maximum, filing-status AGI phase-out
and income-tax limit. Whole-dollar form rows reconcile to their totals.

`state-ct-rates.mjs` contains the annual calculation; `state-returns.mjs` validates
inputs and propagates unresolved amounts. Federal AGI must be explicitly known.
Source references and reviews accompany state adjustments, withholding and
property taxes. Adjustments are already-computed eligible state amounts; the
module does not independently reconstruct retirement, Social Security, bonus
depreciation or Section 179 worksheets. CHET/ABLE contribution ceilings are
checked. The 2023 CHET account disclosure remains unsupported.

The original DRS four-page PDFs have no AcroForm fields. `state-ct-maps.mjs`
records annual SHA-256 pins and reviewed overlay boxes; `state-ct-pdf.mjs` checks
bytes, page dimensions and structure before drawing. Identity digits use the
original SSN/EIN/date positions. Long text and unsupported glyphs fail instead of
being truncated. The full packet keeps its Shuug draft watermark and adds a
state calculation/source workpaper. Missing treatments leave affected totals
unresolved, rather than inserting zero tax or credit.

The 2023 PDF presently linked from the official DRS annual page contains the
text `DRAFT 12-12-2023`. The exact linked revision was checked on 2026-11-13 and
returns the same bytes. The original source is retained and a blocking review
diagnostic requires a verified final template before filing. 2024 and 2025 do
not carry that source mark. No approval, substitute-form certification or filing
authorization is inferred from published forms or this implementation.

## Remaining coverage boundaries

- Other states and DC are recordable requirements with unavailable status; the
  jurisdiction registry is not tax coverage. No 2026 Connecticut pack is installed.
- Nonresident/part-year, amended, dependent, other-jurisdiction credit, AMT,
  earned-income, pass-through, claim-of-right and other credit schedules remain
  outside this pack. They are explicit selections, not silent assumptions.
- More than five withholding statements need CT-1040WH. Every statement stays in
  the encrypted source/workpaper, but payment/refund totals remain unresolved.
- Property-tax eligibility and qualifying payment dates require source review.
  The current form rows hold one residence and one vehicle, or two vehicles for
  joint/surviving-spouse status, with up to two payment dates each.
- Late penalties, interest and estimated-tax underpayment require additional
  calculation. Refund and amount due stay unresolved until absence of those
  charges is explicitly reviewed. Bank details, signatures, paid-preparer fields,
  direct deposit, refund contributions and optional disclosures are not inferred.

## Verification and sources

Focused tests exercise the official annual Table B examples, exemption/credit/
recapture boundaries, property phase-outs, federal-to-state flow, rounding,
unresolved cases and original PDF integrity. Extracted output coordinates confirm
actual amounts on all three annual forms. Synthetic local PDF rendering was
inspected without a browser. A DOM integration test enters CT withholding,
calculates separate state/federal totals, saves/reopens source references,
preserves unavailable-state input and clears private controls on lock. This is
local synthetic verification, not DRS acceptance or an installed live filing.

Annual instructions and templates, with exact downloaded hashes, are recorded in
[`data/ct-sources.json`](data/ct-sources.json):

- [2023 DRS instructions](https://portal.ct.gov/-/media/drs/forms/2023/income/2023-ct-1040-instructions_1223.pdf)
  and [official annual form listing](https://portal.ct.gov/drs/drs-forms/2023-forms/individual-income-tax-forms).
- [2024 DRS instructions](https://portal.ct.gov/-/media/drs/forms/2024/income/2024-ct-1040-instructions_1224.pdf)
  and [official annual form listing](https://portal.ct.gov/drs/drs-forms/2024-forms/individual-income-tax-forms).
- [2025 DRS instructions](https://portal.ct.gov/-/media/drs/forms/2025/income/2025-ct-1040-instructions_1225.pdf)
  and [official annual form listing](https://portal.ct.gov/drs/drs-forms/current-year-forms/individual-income-tax-forms).
