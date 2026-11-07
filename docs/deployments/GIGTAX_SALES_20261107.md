# GigTax office sales and enrollment

Canonical integrated source: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`, implementation `16240c6`.
It starts from the approved free customer-site baseline `7e3244d`.
Final deployment: `dpl_HVSxKeSXWGLDA5ELkAJatwAfYjJG`,
https://rideshare-tax-pros-garv6cur9-lukekist-2968s-projects.vercel.app.
An old-tree build took the aliases seven seconds after this deployment. After
confirming no deployment process remained, this build was explicitly promoted
back. Final live verification at 09:04 UTC checks the real custom-domain pages,
both exact homepage hashes, free redirects, rejected-route 404s and sales API.
Do not deploy the earlier `GigTaxProsSales-20261107` or Connections tree: they
contain the rejected public company/partner content. The initial deployment
used that older snapshot; the integrated tree corrects it. Both local trees
remain intact for recovery.

The approved homepage, hero, global styles, map, navigation, customer copy and
free-access redirects are unchanged. Of the 35 existing built files, only the
privacy notice and route manifest change. `/sales` and `/office-signup` are
added with noindex metadata and excluded from the public sitemap. The rejected
`/join-the-family`, `/gig-companies` and `/app` routes must remain 404.

The portal uses dedicated boards in the existing TinkySDR Cloudflare/D1 backend
through server-only Vercel credentials. It does not expose the Mac or alter the
separate local Shuug service, native app, client accounts or tax documents.
Owner access can create and revoke agent codes and assign offices. Agents see
their assignments within their state territories. Activities persist separately.
Discovery reads the IRS state ZIP directories, filters known chain names and
leaves independent-ownership verification to agents. Connecticut was tested
live; 162 Hartford-area candidates were returned, with 50 shown. This is not
a claim that every listed office is independent or every US office is covered.

User-confirmed terms saved in the real backend: contracting name **Gig Tax Pro**;
12-month commitment; $300/month; $200 enrollment; $500 initially (enrollment plus
month one); 11 remaining $300 payments; $3,800 scheduled total. Refund requests
are reviewed individually. The PDF's earlier $200 advertising example is not
the current membership price. Exact text/hash/version are retained per invite.
The generated agreement text is in `docs/contracts/` for review; no legal-review
or franchise-compliance claim is made.

Live signup requires terms acceptance and a verified Stripe $500 payment,
matching $300 monthly subscription and configured 12-month billing end.
**Stripe is not connected.** The existing Shuug vault has no Stripe secret, and
the suggested Stripe plugin was not installed/connected at last check. Runtime
`GIGTAX_STRIPE_SECRET_KEY` and `GIGTAX_STRIPE_WEBHOOK_SECRET` remain absent. No
real or Stripe sandbox payment was performed. The payment adapter and signature
checks have synthetic tests only. Expired checkouts stop for owner review;
renewal, delinquency and refund automation still require further work before
the paid workflow should be considered ready. No actual office has been signed
up or charged, and no outreach message was sent.

Verification: 19 backend/payment tests, one sales DOM workflow test, six existing
customer-site DOM tests pass. Real isolated diagnostic D1 boards proved agent
authentication, assignment, persisted activity, invitation terms, revoked access,
cross-agent denial and missing-payment rejection; those boards were soft-archived.
Live HTTP evidence is recorded in the adjacent proof JSON files. Source/DOM and
HTTP verification do not establish visual acceptance. Safari was opened on the
normal desktop; no browser runtime, VM or diagnostic server was launched.

Local owner shortcut: `~/bin/gigtax-sales`, installed against this integrated
tree; `--status` prints no secret. It reads a 0600 local owner-code file and opens
Safari with a fragment that the portal immediately clears before HTTPS login.
Credentials are not committed. Installation metadata and code remain under
`~/.config/gigtax-sales/`; use `setup.mjs` idempotently, and configure server
variables through stdin with `configure-vercel.mjs`.

Next: connect the intended Stripe account and runtime secrets, verify actual
checkout/webhook/billing behavior and complete the remaining payment operations.
Review the agreement and obtain Luke's screenshot acceptance. Keep the free
customer website unchanged while iterating on the private sales workflow.
