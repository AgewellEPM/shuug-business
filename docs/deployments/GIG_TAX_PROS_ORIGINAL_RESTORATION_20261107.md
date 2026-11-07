# Original website restoration — November 7, 2026

Luke requested restoration of the entire original public website and removal of
the company-guide, partner-network and app-showcase additions from production.

The public website source, site generator, page templates and existing interaction
checks are restored byte for byte from `2083c37`, the revision immediately before
those additions. The build contains the original artwork homepage and 19 pages.
No backend application, native app, account, customer record or workspace data
is included in this restoration.

The newer site remains recoverable at `649636bfa95c7489818a390112edd8681a5400dd`
on `feat/gig-tax-pros-connections`. Its GitHub branch SHA was independently checked
before restoration. Do not deploy that branch over the restored public website.

Restoration checkout: `/Users/lukekist/Worktrees/GigTaxProsCustomerSite-20261107`.
Branch: `fix/gig-tax-pros-restore-original`.

Validation: exact source comparison with `2083c37`, static build, six existing
website interaction checks and generated 19-page manifest. Publication evidence
is recorded separately after public HTTP verification. No new visual design is
introduced by this change; browser appearance still belongs to Luke's acceptance.
