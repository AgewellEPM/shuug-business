# Earned Income Credit

Every individual return runs `earnedIncomeCredit`, including a return without dependent or Schedule 8812 input. Independent source proofs can establish zero. An optional reviewed award record adds ordinary 2023–2025 eligibility, Worksheets A/B and exact annual EIC tables. Unknown EIC propagates to refundable-credit totals, payments, refund and balance due. No result establishes filing approval.

`newEarnedIncomeCredit()` creates an unreviewed encrypted source record with `qualifyingChildren: 'unknown'`, zero entered combat pay, an empty source reference and false `reviewed` / `earnedSourcesReviewed` flags. Zero entered combat pay becomes a reviewed fact only after the source review. Existing records may omit the section; omission never establishes childlessness or zero earnings.

The optional `individual.earnedIncomeCredit` record supports `qualifyingChildren: 'unknown' | 'none' | 'present'`, `nontaxableCombatPayCents`, `source`, `reviewed`, `earnedSourcesReviewed` and an optional `award`. EIC qualifying-child tests differ from dependency tests, and include children not claimed as dependents or children who provide their own support. A reviewed `none` permits the childless cutoff only when it does not contradict a retained possible U.S.-resident qualifying child or unresolved recorded dependents. The check uses original relationship, age/student/disability, residence and joint-return evidence, regardless of the dependency claim; unresolved relevant facts preserve a possible child. Otherwise the conservative maximum for any family applies. A contradiction retains a blocking diagnostic even when an independent maximum-income proof establishes zero.

## Ordinary annual awards

`newEicAward()` creates explicit, unreviewed eligibility and source decisions.
`eic-eligibility.mjs` reconciles citizenship/residency, main home, birth/death,
marital/separation status, timely employment-valid identifiers, other-person
claims and linked children. EIC children are derived independently of dependency
claim and support tests. All qualifying children and children with valid SSNs
remain separate sets: a qualifying child without a valid SSN can require
Schedule EIC while the amount uses the zero-child table column. Unsupported
residence exceptions, competing claims, prior disallowance and special income
treatments remain unresolved.
The child's actual marital status is explicit. A married child uses the existing
known dependency eligibility result; unclaimed or unresolved married-child and
noncustodial-parent exceptions require further source work. Missing marital
status is never treated as unmarried.

`eic-award.mjs` uses ordinary W-2 income and reconciled Schedule C/SE results.
Worksheet B retains losses and businesses below the SE filing threshold; its
earned income uses profit less deductible SE tax, not 92.35% of profit. The
annual AGI comparison sequence determines whether a second table lookup is
required. It does not always use the larger income or smaller pair of credits.
The exact tables contain 3,979 published rows and 24 partial terminal ranges;
no percentage interpolation replaces published amounts.

Each spouse's linked W-2 code Q sources and combat-pay election are separate.
All lawful include/exclude combinations produce visible worksheets; the user
must save a choice for each filer with positive combat pay. The selected amount
prints on Form 1040 line 1i and does not increase taxable wages. ACTC retains its
own mandatory combat-pay treatment and uses the calculated EIC in its payroll
alternative.

Positive awards with qualifying children print the original annual Schedule
EIC. Reviewed calendar-month counts are retained separately from residency days;
no days-divided-by-30 conversion is used. Annual home/separated-spouse and
instructed no-credit indicators use their actual form fields. Form 8867 paid
preparer due diligence and any required Form 8862 remain filing-completion work.
Connecticut and New York EIC schedules remain incomplete, so a positive federal
credit does not silently produce a known state settlement.

The 2026–2027 paths retain source facts and independent zero proofs but do not
reuse earlier award tables or Schedule EIC blanks. Final annual award materials
and any new supporting requirements must be reviewed before those awards run.

| Year | No qualifying children, other / joint | Maximum for any family, other / joint |
| --- | --- | --- |
| 2023 | $17,640 / $24,210 | $56,838 / $63,398 |
| 2024 | $18,591 / $25,511 | $59,899 / $66,819 |
| 2025 | $19,104 / $26,214 | $61,555 / $68,675 |
| 2026 | $19,540 / $26,820 | $62,974 / $70,244 |
| 2027 | $20,164 / $27,684 | $65,002 / $72,512 |

AGI at or above the applicable limit can prove zero when federal income treatment is resolved. Complete earned-source review permits wages plus Schedule C net profit minus the deductible half of self-employment tax to be tested against that limit. Losses are preserved. The review excludes unrepresented farm/partnership income, optional SE methods, community-property allocations, Medicaid-waiver elections and EIC-excluded wage amounts; those treatments remain unresolved.

Combat pay is elective for EIC. High-income proof excludes it; no-positive-earned-income proof checks the maximum including all combat pay. These bounds cover separate joint-filer elections without making an election. Combat amounts must reconcile with existing Schedule 8812, NY W-2 code Q and supplied calculation-context evidence. Source conflicts prevent earned-income proof. A sourced false required employment-valid, timely filer SSN also establishes zero; missing or conflicting identifier facts do not. Repeated joint-filer identifiers disable that SSN proof while preserving any independent income proof.

`earnedIncomeCreditWorkpaper(input, result, line)` retains the private source review, combat amount, applied cutoff, reason and unresolved diagnostics in the draft packet, even without dependent forms. The browser editor keeps these facts in the encrypted return workflow.

Rules and annual limits are pinned to [2023 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2023.pdf), [2024 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2024.pdf), [2025 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2025.pdf), and [Rev. Proc. 2025-32, section 4.06](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf). `data/earned-income-credit-sources.json` records exact bytes/hashes; the qualification report verifies those supplied source bytes. [Revenue Procedure 2026-35, section 3.06](https://www.irs.gov/pub/irs-drop/rp-26-35.pdf) supplies the 2027 cutoffs, with the released-source date-placeholder anomaly retained in the metadata. The 2026–2027 revenue procedures support income exclusions only; final annual award tables and new supporting requirements are not claimed implemented.

Tests separate published Grey-family worksheet arithmetic from synthetic eligibility and boundary facts. All annual table cells and terminal ranges are checked against pinned Publication 596 and Form 1040 instruction originals. Other checks exercise age, source conflicts, child classification, losses, owner elections, actual annual PDF fields, save/reopen and private field clearing. The three published award examples also run through the full return and packaged client. These are engineering checks, not agency submissions or approval.
