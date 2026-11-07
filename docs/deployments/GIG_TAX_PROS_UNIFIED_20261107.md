# Gig Tax Pros shared client, app and tax workspace — November 7, 2026

Objective: finish the complete customer flow across the website, invited client
profile, iPhone records, private document submissions and tax-team review using
one persistent backend. Public deployment, provider access and actual phone
acceptance remain required; this is not a completed public launch.

Source: `feat/gig-tax-pros-unified` in `AgewellEPM/shuug-business`, checkout
`/Users/lukekist/Worktrees/GigTaxProsUnified-20261107`. It combines the existing
committed native work with the verified `gigtax.pro` website branch. Separate
ongoing native changes and the original external source checkout were preserved.
Implementation: `cfc4561ad5ea6a4a019f35534bc2312aac6b1f14`; updater correction:
`b03769b`. The branch is backed up through the finish-project verification flow.

## Implemented and observed

- Invitation activation signs the client into the browser immediately. Native
  login and browser login use the same account and client binding.
- The portal reads the native sync journal directly, with year selection,
  paginated trips/income/expenses, private receipts and grounded review prompts.
  Earnings categories remain separate to avoid counting a payout and its rides
  twice. Each client sees only their own account's journal.
- The existing explicitly shared tax engagement, document-request and quarterly
  status controls remain in effect. Client-side identifiers cannot change scope.
- Shared document requests accept private PDF/JPEG/PNG submissions. Storage uses
  UUID file paths, AES-GCM with the existing private workspace key, quotas and
  integrity checks. Downloads recheck the live account, client, request and
  parent engagement. Staff use `/tax-documents` to download and record review;
  receipt/review do not mean that a return was filed.
- The iPhone account view now discovers `https://gigtax.pro/site-config.json`,
  explains invitation/sign-in/sync in three steps, links the personal portal and
  shows pending records and last successful sync. Guest transfer and account
  switching retain account-specific storage and Keychain protection.
- New deployments use the Gig Tax Pros brand. The existing generic health probe
  remains intact; Tax Firm readiness is at
  `/api/website/customer/driver/health`. Compose uses this readiness gate.
- Full restart/restore testing found and fixed an existing SQLite backup defect:
  checking a WAL-mode database created unmanifested WAL/SHM files inside the
  backup. Integrity checks now operate on disposable copies; the sealed backup
  remains unchanged and restores successfully.

## Verification and local installation

Next production build and TypeScript passed. Focused portal/account/journal,
document/permission, server-initialization and backup regression checks passed.
The full compiled HTTP proof exercised two client identities, app mutations,
private receipts, portal rows, staff review, requested-document upload/download,
cross-client denial, server restart, complete backup/restore and revocation.
The actual compiled Swift WorkspaceClient passed 30 transport checks against
the compiled server. Owned temporary servers and test data were cleaned up.

The existing macOS tax workspace was backed up and updated through
`scripts/update-gig-tax-workspace.ts`, retaining its data and owner Keychain
credential. It verifies the previous source/build/plist receipt, confirms TCP
listener and owned-process shutdown, backs up the stopped volume, and supports
rollback of service configuration, branding and verification receipts.

Installed workspace: `http://127.0.0.1:3126`, build `gqBbMwA6212AvJiaYaQhd`,
source is the unified checkout above. Actual owner sign-in, seven staff routes
and the new readiness endpoint passed. The prior private backup is recorded
in `gig-tax-pros-installed-backend-verification-20261107.json`.
The persistent local workspace is intentionally running for use.

Receipts in this directory:

- `gig-tax-pros-unified-http-verification-20261107.json`
- `gig-tax-pros-unified-native-http-verification-20261107.json`
- `gig-tax-pros-unified-client-http-verification-20261107.json`
- `gig-tax-pros-installed-backend-verification-20261107.json`

The iPhone changes compiled without launching another Simulator. They have not
been installed over the other session's ongoing app preview or accepted on a
physical phone. Screenshots remain Luke's visual acceptance gate.

## Required remaining work

1. Authenticate the persistent cloud host. The new Oracle CLI sign-in attempt
   timed out without a session; its config is absent. No running login helper
   or cloud resource was created. Existing Fly and Railway CLIs were also
   unauthenticated. The local Mac service must not be exposed as the cloud host.
2. Provision only the approved free hosting resources after verifying the actual
   tenancy, home region, eligibility and capacity. Deploy the existing Node
   backend on persistent storage behind HTTPS and establish private backups.
3. Verify the actual hosted owner/client/app paths, isolation, persistence and
   recovery. Then use `node scripts/connect-gig-tax-workspace.mjs https://<host>`
   to check readiness, private portal responses and origin/auth gates before
   updating the public discovery configuration. Build/deploy the public website
   and verify it against that real host. `workspaceUrl` is still null today.
4. Integrate the account changes with the latest native-session work, install
   the current combined app without losing preview data, and verify a real
   device using the hosted client account. Align any provider universal-link
   domain with the eventual actual bank configuration.
5. Activate real bank access only with the firm's approved provider credentials
   and customer consent. Existing Plaid code and statement imports are retained;
   no live bank authorization was claimed. Direct Uber/Lyft/other platform
   account authorization remains unimplemented/unverified; the offer reader
   and manual platform records do not establish such connections.
6. Complete actual preparer/engagement/contact setup and any selected external
   return-filing workflow. This workspace organizes records and tax work; it
   does not itself calculate, submit or prove acceptance of a tax return.

Current provider references: [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
and [Vercel's SQLite deployment constraint](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
Retain the persistent backend architecture; do not place the private database
or file store on a Vercel Function filesystem.
