# Independent EIC source check

Every individual return runs `earnedIncomeCredit`, including a return without dependent or Schedule 8812 input. The result is either a supported zero or an unknown credit. Unknown EIC must propagate to refundable-credit totals, payments, refund and balance due. This module does not calculate an EIC award or establish filing approval.

`newEarnedIncomeCredit()` creates an unreviewed encrypted source record with `qualifyingChildren: 'unknown'`, zero entered combat pay, an empty source reference and false `reviewed` / `earnedSourcesReviewed` flags. Zero entered combat pay becomes a reviewed fact only after the source review. Existing records may omit the section; omission never establishes childlessness or zero earnings.

The optional `individual.earnedIncomeCredit` record supports `qualifyingChildren: 'unknown' | 'none' | 'present'`, `nontaxableCombatPayCents`, `source`, `reviewed` and `earnedSourcesReviewed`. EIC qualifying-child tests differ from dependency tests, and include children not claimed as dependents or children who provide their own support. A reviewed `none` permits the childless cutoff only when it does not contradict a retained possible U.S.-resident qualifying child or unresolved recorded dependents. The check uses original relationship, age/student/disability, residence and joint-return evidence, regardless of the dependency claim; unresolved relevant facts preserve a possible child. Otherwise the conservative maximum for any family applies. A contradiction retains a blocking diagnostic even when an independent maximum-income proof establishes zero.

| Year | No qualifying children, other / joint | Maximum for any family, other / joint |
| --- | --- | --- |
| 2023 | $17,640 / $24,210 | $56,838 / $63,398 |
| 2024 | $18,591 / $25,511 | $59,899 / $66,819 |
| 2025 | $19,104 / $26,214 | $61,555 / $68,675 |
| 2026 | $19,540 / $26,820 | $62,974 / $70,244 |

AGI at or above the applicable limit can prove zero when federal income treatment is resolved. Complete earned-source review permits wages plus Schedule C net profit minus the deductible half of self-employment tax to be tested against that limit. Losses are preserved. The review excludes unrepresented farm/partnership income, optional SE methods, community-property allocations, Medicaid-waiver elections and EIC-excluded wage amounts; those treatments remain unresolved.

Combat pay is elective for EIC. High-income proof excludes it; no-positive-earned-income proof checks the maximum including all combat pay. These bounds cover separate joint-filer elections without making an election. Combat amounts must reconcile with existing Schedule 8812, NY W-2 code Q and supplied calculation-context evidence. Source conflicts prevent earned-income proof. A sourced false required employment-valid, timely filer SSN also establishes zero; missing or conflicting identifier facts do not. Repeated joint-filer identifiers disable that SSN proof while preserving any independent income proof.

`earnedIncomeCreditWorkpaper(input, result, line)` retains the private source review, combat amount, applied cutoff, reason and unresolved diagnostics in the draft packet, even without dependent forms. The browser editor keeps these facts in the encrypted return workflow.

Rules and annual limits are pinned to [2023 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2023.pdf), [2024 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2024.pdf), [2025 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2025.pdf), and [Rev. Proc. 2025-32, section 4.06](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf). `data/earned-income-credit-sources.json` records exact bytes/hashes; the qualification report verifies those supplied source bytes. The 2026 revenue procedure supports income exclusions only; final annual award tables and new supporting requirements are not claimed implemented.

Tests exercise published cutoff parameters at below/equal/above endpoints for every filing-status class, missing-section behavior, child conflicts, earned-source completeness, business losses, combat elections/reconciliation, identifiers and unknown propagation. These are synthetic boundary vectors derived from official rules, not IRS-published taxpayer examples. The editor test saves/reopens source facts and clears private content. No agency submission or approval is implied.
