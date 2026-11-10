# Restored app navigation and reconciled production source

The November 9 audit found `/about-the-app` returning 404 while the older
`/app-features` page remained published. The sales console and new interaction
tour had been published from a baseline that omitted the later app-page rename.

## Result

- `/get-the-app` remains the download/availability page.
- `/about-the-app` contains the existing detailed app design. Both older
  `/app-features` URLs redirect there permanently, preserving query strings.
- About The App appears after Offices in desktop and mobile navigation.
- Feature links open About The App; its download actions open Get The App.
- Homepage content/artwork, the current interaction tour, all private sales
  assets and all 45 backend artifacts retain their production bytes.

Canonical source is `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`, implementation `228916a`.
The current tour's eleven source assets were recovered from the clean,
GitHub-backed `feat/gigtax-tour-polish` tree. The canonical build now contains
both the current tour and the app/navigation correction; an old source build
must no longer be used as the production baseline.

Ready production deployment: `dpl_CfeDYTeMqZZTpH7hK3xYGqp1EsF7`,
https://gigtax.pro/about-the-app, deployment URL
https://rideshare-tax-pros-ig7tusbki-lukekist-2968s-projects.vercel.app.
The prior `dpl_43PBWWJDBAKJSemHGpZ25zUEvi2G` is the rollback reference.

## Verification

The recovered baseline matched all 133 uploaded production artifact hashes.
The rebuilt release changes only shared app navigation/links, the renamed page,
its redirects and the corresponding sitemap/manifest/JSON-LD hash. The new
preservation verifier rejects changes to other content, media, backend files,
headers or routing. All 45 backend files and 107 total artifacts are unchanged.
The tour MP4 remains SHA-256
`bbf9518e89d11f9e603096d7e0ecc336e16a5010c0d78335dadc2306811cc6dc`.

- 18 SEO/redirect/built-output/parallax checks and 12 customer interaction tests pass.
- 112 live public-file/alias checks and 57 live SEO/redirect checks pass.
- Authenticated owner bootstrap, all four IRS pages/161 unique Hartford
  candidates, private assets, origin/webhook guards and public directory pass.
  The probe logged out; the live workspace remains zero offices/agents/listings.
- All 133 actual uploaded artifact hashes match the tested release. Final apex
  alias resolves to the Ready deployment above.

Evidence: `gigtax-navigation-{baseline,preservation,http,seo,sales,live}-20261109.json`.
The prepared output is `/private/tmp/gigtax-navigation-repair-20261109-v1twa3/release`;
temporary artifacts can disappear, so source/Git and the receipts are authoritative.
No diagnostic server, guest or browser automation was started. Safari visual and
physical-phone acceptance remain Luke's; HTTP/DOM checks do not establish them.

## Remaining work and latest instruction

Luke explicitly chose **Keep payments pending for now** on November 9. Do not
resume Stripe connection/activation without new direction. The previously
suggested Stripe plugin remains disconnected. No outreach, payment or provider
setup was performed.

Public `workspaceUrl`, iOS/Android download URLs and contact fields remain null.
The separate local office service responded on port 3126; the earlier sample
preview at 49621 no longer responded. Neither was restarted or replaced.
The encrypted-client/firm synchronization work remains in
`ShuugFreeTaxService-20261107`, `feat/shuug-free-tax-service-20261107`, previously
`e03fe6a`. Real client hosting, signed enrollment and recovery/signing authority,
staff write sharing, shared financial projections and filing software remain
unfinished. Preserve the separate dirty office/native/telemetry worktrees.
The unrelated untracked `gigtax-how-navigation-http-20261107.json` is preserved.
