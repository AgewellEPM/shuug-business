# Connecticut retirement adjustments

The resident editor can link its retirement worksheets to the original federal
retirement records for 2023–2025. Calculations use federal taxable source amounts
and the completed federal Social Security worksheet, with no second income input.

Annual DRS instructions and hashes are in `data/ct-sources.json`. The IRA share is
25% in 2023, 50% in 2024 and 75% in 2025. The 2023 pension income limit and the
2024–2025 graduated phase-out use federal AGI, not Connecticut AGI. Social Security
uses its separate filing-status thresholds and annual lines A–F, including the
married-separate living-arrangement branch.

Employer pensions require a classification linked by the stable federal
distribution ID. Supported classifications are ordinary qualifying pension,
eligible military retirement/survivor pay, and Connecticut teachers retirement.
Each teacher recipient must choose either the 50% teachers subtraction or the
annual pension subtraction. The same income cannot receive both deductions.
Military former-spouse divorce payments do not qualify for the military exclusion.

The original separately reviewed manual workflow remains available. When linked
worksheets are enabled, any retained manual amount on lines 41/43/44/45/48b must
equal its calculated amount in exact cents. It is never added a second time.
Changed federal income recomputes the state worksheet; removed source links,
unreviewed eligibility, unsupported federal treatments and conflicts suppress
state AGI and tax totals. Source records and elections remain in the encrypted
return and the private PDF workpaper.

Railroad benefit allocation, qualifying-surviving-spouse pension treatment,
2026, nonresident/part-year returns and unsupported federal pension methods are
not established by this automatic worksheet. They remain explicit unresolved
requirements. All PDFs remain drafts; no agency approval or filing is implied.

Verification includes annual thresholds, every pension phase-out boundary, DRS's
Anna teacher example, military/source reconciliation, source mutation, and actual
line 41/48b amounts on all three original CT-1040 PDFs.
