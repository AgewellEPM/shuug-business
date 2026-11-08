# Office recruitment assessment and implementation — November 8, 2026

Luke asked to assess the existing private office-recruitment workspace and build
the missing functions. Preserve the approved public website and artwork.

## Implemented

- Discovery now retains ZIP codes, normalizes duplicate office identities and
  pages through all matching IRS candidates instead of stopping at 50. Directory
  contacts and office ownership start unverified.
- An agent can find candidate official websites, choose the matching office site,
  and research public contact/about/team pages. Proposed emails, phones and named
  contacts retain their source, check time and excerpt. Applying selected fields
  requires explicit review and a short-lived, office/user-bound sealed report.
  It never invents an email or automatically confirms independent ownership.
- Separate reviewed ownership and contact-role records retain source evidence.
  Contact edits invalidate the corresponding prior confirmations. Assignment and
  territory checks apply to the new actions. Do-not-contact suppresses research,
  drafts and invitations, including expired-invitation renewal.
- The private UI supports manual call/email links, copyable scripts, persistent
  reviewed drafts, draft restoration, dated follow-ups and a prioritized queue.
  Saved drafts are not sent-message records. Search retries and stale responses
  preserve the selected office and correct paging controls.
- Reviewed expired, never-paid invitations can be replaced; open checkout and
  previously paid membership cannot be silently renewed. The returned private
  link is immediately available to copy.
- Signed billing events resolve canonical subscription/invoice/payment/charge
  state. Eligibility requires the live receipt, current paid period and agreed
  fixed term. Failure, cancellation, expiry, refunds and disputes remove
  eligibility. Provider reads never issue charges, cancellations or refunds.
  Public directory listings require explicit ownership/listing approval and a
  currently eligible enrollment; an edited prospect stage cannot activate one.
- Record updates use tenant/board/row-scoped atomic comparisons in D1, with a
  new revision for metadata writes. Conflicting edits return a refresh/retry
  response. The adapter requires an explicit conditional-write success marker.

## Verification and limits

Source checkpoint `dc3fdb54f836c82c52b9ada1ac604a3d872c0e21` is backed up on
`feat/gig-tax-pros-sales-integrated` in the configured GitHub repository.
Final guard checkpoint `84aabc33b8c3cd504bb8e740308dc3f728631cf4` preserves a
concurrent do-not-contact or missing-ownership decision during initial payment
confirmation and receipt retries while retaining the payment record.
113 sales, research, billing and integrated DOM tests pass. The DOM flow uses
the actual handler/service with synthetic IRS/research/provider fixtures; it
does not establish live email delivery, billing or physical-phone acceptance.

Real first-party research passed against https://murraystax.com/ through the
actual DNS-pinned Node transport. The published email, office phone and named
contact matched the page; fax was excluded and ownership remained unconfirmed.
The researcher obeys robots rules, reads only bounded public HTML, skips account
and challenge pages, pins checked public DNS addresses into the connection and
never executes page JavaScript. CSS/JavaScript-rendered or inaccessible contact
details can be absent; an agent must review the official-site match and evidence.

The shared Worker patch is limited to optional `expected_notes` on row PATCH,
with tenant/board/row isolation and no schema change. Its 47 focused checks and
required packaging dry-run pass. Full Worker tests pass 1,307/1,307 when the
existing test configuration explicitly omits the live Gemini key; the unchanged
default suite had one external Gemini 502 failure (1,306 passed). The sibling
authentication suite passes 80/80. No browser runtime or VM was used.
Worker source is backed up separately as `73869ea7903be9d889cd944e45b9753d18a3378b`
on `feat/gigtax-conditional-office-updates` in `AgewellEPM/TinkySpeak-Web`.
Its isolated worktree is `/Users/lukekist/Worktrees/TinkySpeakGigTaxCAS-20261108`;
the existing main checkout and its unrelated local commit were preserved.

All 77 saved public files, including approved pages and artwork, compare byte
for byte with the pre-task baseline after the new build. Only private sales
assets/templates, directory-admin prefill and backend implementation changed.

Luke confirmed that no `@gigtax.pro` mailbox/provider is set up. Direct sending
remains disconnected; no office was contacted. Stripe runtime credentials and
signed-webhook setup are also absent. Real checkout, recurring payment,
webhook delivery and account activation remain unverified and unavailable.
No automatic campaign, live payment or business outcome is claimed.

## Live activation and preservation

The exact active Worker bundle was downloaded and only its
`handlePatchBoardRow` function replaced after AST comparison and 47 tests against
that actual candidate. All bytes outside the function are identical. A
content-only update preserved all 13 bindings, compatibility date and migration
`v2`; Cloudflare changed only its automatic deployment-origin annotation.
Current Worker version is `2a2efa04-4987-4456-98ce-fde58b03426b`, deployment
`010e0b3e-e410-4c97-8aff-ce70bdb29f6c`, at 100% traffic. The previous version
`94bc5a75-8f80-4dd8-b9a0-762c1acb56a6` remains the rollback reference.

`node scripts/sales/verify-research-backend.mjs` passed seven live checks with
actual authenticated Worker/D1 persistence and isolated synthetic boards:
one successful conditional write/one conflict, fresh-reader contact evidence,
drafts/follow-ups, invitation/payment gates, assignment/revocation and DNC.
Real IRS paging reached all 161 unique Hartford candidates. All four diagnostic
boards were soft-archived and verified; no real office or outreach was changed.

The current Vercel production alias was independently observed as
`dpl_5H37bhiFyQ3x4ch7Q1ApW2PmE4sC`. Its public output differs from this checkout
in 34 of the 77 compared files. Therefore the local full-site build must not be
deployed for this backend task. Its 117 uploaded artifact hashes matched the
existing output in `GigTaxProsTourPolish-20261107`. The constrained packager
`scripts/sales/prepare-private-overlay.mjs` copied that exact baseline and
overlaid only seven private assets/pages and three backend function directories.
All routes/CSP remained byte-identical. Five packaging guard tests pass.
This task does not resolve public design history.

The resulting Vercel production deployment is
`dpl_33EqKAuAutyS6v4ReoGu8jQu9Uzu`, Ready at https://gigtax.pro, with prepared
artifact cwd `/private/tmp/gigtax-private-preserve-live-20261108`. Live checks
verified all 78 protected public files by HTTP SHA-256 and uploaded SHA-1,
original headers and exact route configuration. New private assets match the
prepared build. Owner sign-in, all four IRS search pages, origin/session gates,
unsigned-webhook denial and public-directory reads pass on the deployed API.
The real workspace remains zero offices/agents and zero public listings; only
diagnostic boards were written. The probe logged out. Safari was opened on the
updated private sales workspace using the existing owner shortcut; Luke's visual
acceptance remains separate.

Evidence: `gigtax-sales-{worker-cas-live,backend-proof,research-live,research-deployed,live-baseline,private-overlay,private-overlay-live}-20261108.json`.
Reproduction uses the frozen baseline proof and explicit baseline/updated/output
arguments to the overlay packager. Never publish the full local public output
over a newer live public site. Recheck the production alias before deployment.

Remaining source state: the unrelated
`docs/deployments/gigtax-how-navigation-http-20261107.json` remains untracked.
The original `TinkySpeak-Web` main checkout retains its unrelated local commit
and the two CAS source/test working copies; their exact bytes are committed and
GitHub-verified on the isolated CAS branch above. No existing changes were reset.

Luke's next instruction is to bring the existing visually rich online TinkySDR
workspace and libraries into this private sales area. That UI work follows this
verified backend checkpoint; preserve the same public output and backend gates.
