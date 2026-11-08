# App, About and final navigation

Luke’s final navigation correction is: **remove Resources, keep About, and
change the top Get Started Free button to Get The App**. Services remains a
direct page link with no dropdown. He supplied separate App and About artwork
to mirror and confirmed that public app download links are **not ready yet**.

Canonical source: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`. Work was prepared in the isolated
`GigTaxProsGetApp-20261107` checkout and fast-forwarded into this source.
App/navigation implementation `34e0abe`; About implementation `21ed836`.
Both source commits were pushed and their exact GitHub remote SHAs verified.

## Published result

- `/get-the-app` uses the original 1199×1312 app artwork. Its feature, profit,
  route, process and V2 sections have accessible HTML equivalents and a native
  mobile layout. See All Features scrolls to the feature section; download
  controls open the download-availability section; office links open `/offices`.
- `/about` uses the original 941×1672 About artwork, including the story,
  beliefs, help cards, mission and closing section. Its controls link to the
  app page/features, professional services and offices. Mobile content reflows
  and reuses the supplied illustrations.
- The current shared header replaces the old navigation embedded in both
  images. Drivers now also uses this header so Resources and the old top button
  do not remain visibly baked into its navigation. The underlying source PNGs
  are unchanged. The homepage body, artwork and larger map remain preserved.
- Primary navigation is Home, Services, How It Works, Drivers, Offices, About.
  The main and mobile actions open Get The App. Existing Resources URLs and
  footer library links remain available.
- `iosDownloadUrl` and `androidDownloadUrl` are null in public configuration.
  The availability section says the iPhone and Android links are coming soon.
  When confirmed public HTTPS links are supplied, the page can show device
  downloads. Unsafe URLs are rejected. No store links or release were invented.

Final deployment `dpl_GcJhhQqGatATjap3BiBZVksGwmUA` is Ready at
https://rideshare-tax-pros-nzlw2q6lk-lukekist-2968s-projects.vercel.app,
aliased to https://gigtax.pro and https://www.gigtax.pro. Earlier app deployment
`dpl_CWcKBXL357S5gf5Cfgs2QRD17KPa` was independently verified before the About
reference was supplied; its receipts are retained as historical evidence.

## Evidence and acceptance

The static build, ten customer DOM checks and the sales DOM workflow pass.
Checks cover exact navigation across the public pages, internal links, checklist
and FAQ behavior, office search/retry, keyboard focus and configured app-download
destinations. Original and built PNGs match byte-for-byte:

- App: `3764246c956a7dc159294c288ee8df554421bba245918f4f73f466b78a4405e4`
- About: `34860a030042946926d629e4c2460663752190d7e7e34aaba4d2a398b7c1a018`

All 81 final public HTTP/static/route checks and 20 exact-file cross-domain
checks pass. The final checks confirm Resources is absent from the header,
About remains, the primary action opens `/get-the-app`, Services has no dropdown,
and both original images are served unchanged. Public download availability is
explicitly coming soon. No private backend, office data, payment, booking or
outreach action changed.

Receipts: `gigtax-get-app-source-20261107.json`,
`gigtax-about-source-20261107.json`, `gigtax-get-app-http-20261107.json`,
`gigtax-get-app-design-live-20261107.json`,
`gigtax-about-app-http-20261107.json`, and
`gigtax-about-app-design-live-20261107.json`.

Safari was opened to https://gigtax.pro/about on Luke’s normal desktop and left
open. Visual screenshot acceptance remains Luke’s. No browser runtime,
diagnostic server or isolated session was used. The pre-existing untracked
`gigtax-how-navigation-http-20261107.json` remains untouched and outside this
task’s commits. Next activation step: supply approved iPhone/Android download
links, configure them, rebuild, and verify actual public distribution.
