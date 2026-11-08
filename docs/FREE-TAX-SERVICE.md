# Free small-firm service implementation

This workstream covers taxpayer protection, a complete office workflow,
accountant workflows, simpler onboarding and sustainable free hosting.
It is not complete merely because one milestone passes tests.

Source branch: `feat/shuug-free-tax-service-20261107`, based on the committed
office accounting/billing milestone `ab94297`. The active
`feat/shuug-office-complete` checkout has separate uncommitted controlled-tax
workflow work. Preserve it and integrate its reviewed result; do not overwrite
that checkout. Public release requires the complete pilot acceptance below.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Enforced MFA | Owner/staff/client enrollment, recovery and session grants: 40 focused checks, 18 client DOM checks, 27 compiled HTTP checks and native compilation pass. [Evidence](verification/mfa-20261107.json). | Install intended builds, enable the required-factor policy, exercise real user interfaces, verify the WordPress PHP deployment and review operator recovery. |
| Usable encrypted office work | Existing ciphertext API and client foundation retained. | Ordinary staff grants, encrypted books/reviews, key/device recovery and controlled legacy migration must work together. Do not remove the legacy fail-closed gate. |
| Dependable recovery | Existing stopped-writer backup/restore remains available. | Scheduled consistent backups, protected offsite copies, monitored failures and full clean-restore evidence are required. |
| Consistent access boundaries | Account sessions now require the configured factor. | Review standalone share/portal links, automation credentials, exports and every legacy route against the intended tax-client authorization policy. |
| Office intake through acknowledgment | Committed client books/billing exist; the other office branch has pending tax work. | Integrate controlled intake/documents/preparation/review/authorization/handoff/acknowledgment, verify each transition, and install the combined office build. |
| Accountant tools | Custom cash/AR/AP summaries and reviewed bank-column/date/sign mapping now pass 65 accounting/UI checks and 15 compiled HTTP checks. [Import guide](CLIENT-BOOKS-IMPORT.md). | Complete basis reporting, guided opening conversion, workpapers and broader exports with independently checked amounts. |
| Simpler everyday use | MFA sign-in forms now guide the required verification. | Guided firm setup, client selectors, request bundles, reminders and daily work queue need a complete observed office journey. |
| Sustainable free service | MIT source remains available without Shuug per-seat license fees. | Usage/capacity visibility, storage and support limits, recovery/monitoring, third-party cost transparency and measured pilot costs remain required. Actual funding or vendor authorizations cannot be established by code alone. |

Generated output and local dependency links are excluded from Git.
The installed service still lacks the new accounting and tax-office routes.
The mapped-import milestone was reverified against its recorded production build
and source hashes using synthetic data; it has not been installed for real users.
Record final build IDs, source commits, actual installed evidence and outstanding
gates at each milestone. Claims of tax-return calculation or e-file acceptance
remain outside the earned capability; the planned first service uses a controlled
handoff to the firm's existing filing software.
