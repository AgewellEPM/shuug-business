# Gig Tax Pros personal ratings and reviews

The new native Ratings & Reviews area stores manual scores and feedback per app,
with dated history, same-scale comparisons, user-selected feedback labels and
grounded improvement steps. Tax & Goals recognizes personal rating questions
and uses the same history. This is not a provider data feed or scoring model.

Native account journals persist an immutable FIFO outbox before dispatch.
Stable mutation acknowledgments, complete server state and deletion tombstones
preserve changes across retries. Separate opt-in controls copying guest personal
history into a connected account. Unknown scales, nonfinite amounts, excessive
text/counts, changed operation reuse, conflicting IDs and capacity overflow fail
visibly. Snapshot corrections use another snapshot; additions do not silently
rewrite history. The limit is 500 of each record type, including deletion markers,
and 50 pending operations; existing history is never silently pruned.

The private reputation API uses the existing client bearer/browser identity,
origin checks, no-store headers, live revocation and client binding. The browser
can see shared history and confirm deletions. Authorized staff review is at
`/rideshare/reputation`. Rating queries skip the optional financial Peel adapter
and preserve the user's saved cost/goal assumptions.

Unified Sync now and app foreground/network callbacks retry all three channels.
Financial, conversation and personal-history statuses are separate. No aggregate
success label can imply that a failed personal-data upload succeeded.

Verified so far:

- 91 Swift core checks pass, including reputation validation, same-app/scale
  comparisons, evidence-only guidance, outbox acknowledgment/deletion and guest
  transfer behavior. The Simulator app/extensions/test runner compile.
- 21 focused backend reputation/coach/portal tests and TypeScript pass.
- 29 actual compiled WorkspaceClient/HTTP/browser checks pass using two synthetic
  invited accounts. This covers exact acknowledgments, immutable/digest retries,
  cookie/native sharing, cookie deletion observed natively, current revocation,
  foreign selection denial and preserved 1,200-cent financial baseline.
- An owned unavailable financial-adapter counter proves rating advice does not
  call or claim Peel. It is not a symbolic-runtime execution receipt. Existing
  separate real-Peel financial verification remains recorded in earlier receipts.
- Every disposable HTTP server/counter/data fixture stopped or was removed.

The backend is installed on `127.0.0.1:3126`, PID87094, build
`nFX7CBy6C2pS_HrLHWEbg`, source
`/Users/lukekist/Worktrees/GigTaxProsReputationServer-20261107`, backend commit
`b1846ced231ae76d44749ab66ff9148137aef819`. Readiness, actual source/plist,
owner access to the new staff route, anonymous denial, sealed backup and retained
prior-build rollback metadata were verified. The local Peel worker remains up.
Do not rebuild `.next` in that installed server checkout; further builds belong
in a separate source checkout. The original app worktree's `.next` was preserved.

Receipts: `gig-tax-pros-reputation-native-http-verification-20261107.json` and
`gig-tax-pros-reputation-installed-verification-20261107.json`.

Native test15 is compiled but awaits execution while the authorized isolated
Oracle support session has priority under the one-session policy. Luke's visual
acceptance and physical iPhone behavior remain separate. Public gigtax.pro
sync is not verified until an authenticated persistent HTTPS host exists and
the site discovery configuration is checked against it. Oracle recovery is an
actual external dependency; local checks cannot establish that outcome.
