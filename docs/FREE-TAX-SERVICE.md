# Free small-firm service implementation

This workstream covers taxpayer protection, a complete office workflow,
accountant workflows, simpler onboarding and sustainable free hosting.
It is not complete merely because one milestone passes tests.

The [November 8 assessment](SHUUG-READINESS-20261108.md) records current missing
work, reproduced native snapshot compatibility findings and a firm-owned Mac mini
hosting path. AWS is optional for application hosting and offhost recovery design.

Source branch: `feat/shuug-free-tax-service-20261107`, based on the committed
office accounting/billing milestone `ab94297`. A reviewed copy of the pending
`feat/shuug-office-complete` workflow is now integrated here, with strengthened
authorization and client-access controls. The original checkout and its
uncommitted files are preserved. Public release requires the complete pilot
acceptance below.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Enforced MFA | Owner/staff/client enrollment, recovery and session grants: 40 focused checks, 18 client DOM checks, 27 compiled HTTP checks and native compilation pass. [Evidence](verification/mfa-20261107.json). | Install intended builds, enable the required-factor policy, exercise real user interfaces, verify the WordPress PHP deployment and review operator recovery. |
| Usable encrypted office work | Signed per-device, read-only staff grants/capsules and separately distributed staff UI now open protected records and documents. Mandatory MFA, encrypted device-backup recovery, replacement-key revocation and stopped-writer restore pass a 38-check compiled synthetic pilot. [Evidence](verification/encrypted-staff-20261107.json). | Activate independent keys/frontend, verify physical offhost custody and real staff use, add encrypted office edits/reviews and complete controlled legacy migration. Keep the legacy fail-closed gate. |
| Dependable recovery | Clean stopped-writer restore preserves office history, documents, books and MFA sessions. New-device grants/capsules and signed revocation also survive restore. A separate AWS key-account package is prepared with KMS, private versioned S3 and an MFA-only operator. [Setup](SECURE-TAX-AWS-KEY-SERVER.md). | AWS authentication currently fails with InvalidClientTokenId. Account-owner signup/verification, cloud validation/deployment, a real recovery drill, scheduled consistent offsite backups and monitoring remain required. |
| Consistent access boundaries | Tax-office, generic tax tracker/API, driver receipt/journal, coach and reputation staff views enforce client assignment and enrollment policy. Revocation is verified. | Review standalone share/portal links, automation credentials, broader exports and every remaining legacy route against the intended tax-client authorization policy. |
| Office intake through acknowledgment | Integrated client selection, requests/uploads/review/waivers, preparation, package-bound authorization, ZIP handoff, submission-attempt evidence and rejection/correction pass 94 workflow checks within a 141-check compiled pilot. [Evidence](verification/office-workflow-20261107.json). | Complete encrypted staff operation and the real installed office journey; verify actual user interfaces and external-provider evidence with office users. No return is transmitted by Shuug. |
| Accountant tools | Custom cash/AR/AP summaries and reviewed bank-column/date/sign mapping now pass 65 accounting/UI checks and 15 compiled HTTP checks. [Import guide](CLIENT-BOOKS-IMPORT.md). | Complete basis reporting, guided opening conversion, workpapers and broader exports with independently checked amounts. |
| Simpler everyday use | MFA forms, client/accountant selectors and a searchable assigned Tax work queue are connected. | Guided firm setup, reusable request bundles, reminders and office-user acceptance remain unfinished. |
| Sustainable free service | MIT source remains available without Shuug per-seat license fees. | Usage/capacity visibility, storage and support limits, recovery/monitoring, third-party cost transparency and measured pilot costs remain required. Actual funding or vendor authorizations cannot be established by code alone. |

Generated output and local dependency links are excluded from Git.
The current live service still lacks the new accounting and tax-office routes.
The integrated build serves those pages and completes the synthetic HTTP journey,
including clean restore, but has not replaced the live service or used real data.
Record final build IDs, source commits, actual installed evidence and outstanding
gates at each milestone. Claims of tax-return calculation or e-file acceptance
remain outside the earned capability; the planned first service uses a controlled
handoff to the firm's existing filing software.
