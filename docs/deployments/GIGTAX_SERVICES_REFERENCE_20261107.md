# Services reference and public branding update

Luke requested that the Services page match his supplied 1024 × 1536 design,
then requested removal of the “Powered by Shuug” label. The selected homepage
remains the larger-map “An office nearby. An expert to talk to.” version.

Source: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`, implementation `a7b5b3b`.
Production: `dpl_GSQsGHCjgFdApDm5kCBN78HkurS2`, Ready, at
https://rideshare-tax-pros-g85xukepl-lukekist-2968s-projects.vercel.app,
aliased to https://gigtax.pro and https://www.gigtax.pro.

## Implemented behavior

- `/services` and `/services.html` use the exact supplied artwork on desktop.
  The original PNG is retained as `assets/services-reference.png`, SHA-256
  `99a98e22cc530a3c5da112dd202689a9371a3b3b6610aa1fe8c260872c628c94`.
- Accessible links cover the navigation, eight service cards and calls to action.
  The Services dropdown uses native details/summary. Watch How It Works scrolls
  to the process section.
- At 800px and below, native HTML reflows the same content and reuses the supplied
  illustrations through SVG viewports. Navigation, focus handling and mobile
  quick actions use the existing public-site behavior.
- Calls to action use the existing service detail, preparation, client-portal
  and contact/office-availability destinations. This change adds a Services
  presentation; existing account and office-availability limits still apply.
- The Shuug badges are removed from the homepage portal buttons and shared
  footer. The associated platform popup and About heading were updated.
  The selected homepage artwork, larger map and other sections are preserved.
- The live sales verifier now compares the homepage with the current saved
  build instead of a historical hard-coded hash.

## Verification

Six existing customer interaction checks and the sales DOM workflow pass.
All 62 public static/alias checks pass against the deployed files. Eight
additional checks verify Services, its HTML alias, its exact artwork and CSS on
both domain names. Eleven live sales checks pass, including real owner sign-in,
protected sessions, unchanged terms, real IRS discovery and rejected foreign
origins/unsigned webhooks. No office was enrolled, charged or contacted.

Receipts in this directory:
`gigtax-services-reference-http-20261107.json`,
`gigtax-services-reference-design-20261107.json`, and
`gigtax-services-reference-live-api-20261107.json`.

Current homepage SHA-256 is
`edbcdc91280feeeffef933932dc621935a2c458cd5f307c547d4c71250833070`;
the authorized badge removal changes its bytes from the earlier selection.
Safari was opened to https://gigtax.pro/services on Luke's normal desktop.
Live screenshot comparison and visual acceptance remain Luke's. No browser
runtime, preview server or isolated session was launched.
