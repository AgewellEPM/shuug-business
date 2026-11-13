# Schedule H state contribution credits

The 2023–2025 draft calculation supports Schedule H Section B, late contribution
Worksheet 1, and credit reduction Worksheet 2. This is federal household FUTA
work; it does not calculate or file state payroll returns, issue W-2/W-3, create
agency XML, or establish approval. Existing ordinary calendar-year eligibility
and household employee classification reviews still apply.

`unemployment.sectionB` is optional. Earlier Section A inputs remain compatible.
When present, its state/rate-period records replace the earlier single-state
contribution amount. The original `paidOnTime` and `allFutaWagesStateTaxable`
confirmations still apply. Complete detailed records that meet all three Section A
conditions populate Section A instead, as the form directs.

Each state row records state taxable wages, assigned-rate status, the percentage
rate, its effective dates, and contributions paid by or after the original federal
return due date. A rate may be explicitly unassigned; unknown and assigned zero
are different states. Rates accept at most four decimal percentage places and
use exact integer arithmetic. Dates must be valid within the selected calendar
year; overlapping assigned periods in one state are rejected. Required amount
fields are absent until entered. A blank cannot become a zero contribution.

The preparer confirms that the rows cover all applicable states and rate periods,
and that contributions exclude employee charges, penalties, interest, special
administrative taxes and voluntary rate-buydown payments. Claims using excess
credits as contributions require a state letter and remain outside this reviewed
input path. No-state-liability treatment requires its own explicit confirmation
and no state rows; it yields no state credit.

For a credit reduction state, allocate every eligible worker's exact capped FUTA
wages across state codes and `EX` (wages excluded from every state's unemployment
tax). Each worker must reconcile to the smaller of eligible annual wages or
$7,000 before rounding. A state allocation cannot exceed that state's recorded
taxable wages. The allocation requires a separate review. The application does
not infer state tax eligibility or work-location allocation from federal wages.

| Tax year | CA | NY | VI | Other listed jurisdictions |
| --- | ---: | ---: | ---: | ---: |
| 2023 | 0.006 | 0.006 | 0.039 | 0 |
| 2024 | 0.009 | 0.009 | 0.042 | 0 |
| 2025 | 0.012 | 0 | 0.045 | 0 |

Line 17 computes the additional experience-rate credit and timely contribution
credit. Worksheet 1 applies the 90% late-contribution limit before Worksheet 2
reduces the credit by state-covered FUTA wages times the annual reduction rate.
The final credit has a zero floor and cannot exceed 5.4% of FUTA wages. Whole-dollar
form rounding happens at each printed amount; source cents stay in the protected
input and workpaper. Missing reviews, state amounts, rate dates or allocations
keep final FUTA, total household tax and downstream total tax unavailable.

The editable browser inputs use the existing encrypted return record. PDF export
fills the actual annual fields and state-question/adjustment boxes. A continuation
table preserves columns (a)–(h) for rows beyond the form's two rows. Workpapers
retain source amounts, all state rows, employee allocations and worksheet lines.
Every output retains its draft status.

Sources reviewed: IRS Schedule H instructions for
[2023](https://www.irs.gov/pub/irs-prior/i1040sh--2023.pdf),
[2024](https://www.irs.gov/pub/irs-prior/i1040sh--2024.pdf), and
[2025](https://www.irs.gov/pub/irs-prior/i1040sh--2025.pdf).
Source byte counts, SHA-256 pins and synthetic derived expectations are in
`test/irs-household-futa-examples.json`. These vectors are not published IRS
taxpayer examples, ATS execution or an independent review. The qualification
report labels them separately from published instruction examples.

Verification covers annual reduction changes, late-payment limits, state-only
exclusions, worker-cap reconciliation, missing inputs, zero/unassigned rates,
all three annual official PDFs, continuation rows, editor save/reopen and private
field clearing. The overall product still requires broader tax coverage, official
filing validation/transport and actual agency acceptance; 2026 is not inferred
from these annual rates.
