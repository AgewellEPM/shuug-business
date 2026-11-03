# Rideshare Tax Pros — November 2, 2026

Live public site: https://rideshare-tax-pros.vercel.app

Source: `AgewellEPM/shuug-business`, branch `feat/rideshare-tax-firm-pack`.
Tax Firm pack implementation: `cc8f5ef`. Footer/content/mobile implementation:
`85c6f94`. Deployment `dpl_CccWyvWM7x49VE7JNsVP4cQeBEa5` is Ready and serves
the second implementation. The default `.vercel.app` domain is used; no custom
domain was bought or configured.

## Delivered

- Original art direction on desktop, with live client controls, truthful service
  commitments covering unverified counts, and a labeled refund illustration.
- Readable mobile HTML, sticky navigation, safe-area-aware quick actions, larger
  touch targets, a responsive footer, native service and FAQ expanders, and
  reduced-motion support.
- Service details, process, contact availability, company/resources footer,
  privacy/terms/accessibility pages, branded HTTP 404, metadata and sitemap.
- A reusable Shuug Tax & accounting firm industry configuration and Rideshare
  Tax Pros business template. Five SDK modules connect to existing navigation,
  role permissions, record storage, API, board/calendar and template mechanisms.

## Evidence

Initial integration checks: 41 tests across industry, SDK, navigation and branding
passed. Shuug's complete Next production build and subsequent TypeScript check
passed. After the footer/mobile changes, all three focused website interaction
checks passed. These are DOM checks, not browser or visual verification.

`rideshare-tax-pros-verification-20261102.json` records 16 real public HTTP checks:
all 12 deployed files match saved source bytes, three clean policy URLs resolve,
and an unknown path returns the branded page with HTTP 404. The home page returns
HTTP 200 with its security policy. Reproduce with:

```sh
node scripts/verify-rideshare-site.mjs
```

Safari was opened on Luke's normal desktop. Final desktop/mobile visual
acceptance still requires Luke's screenshots. No browser runtime, VM, isolated
session or local preview server was started.

## Remaining activation work

`public/rideshare-tax-pros/site-config.json` intentionally contains null contact
and workspace destinations. Luke is obtaining those details. Client controls
show opening-soon availability and never pretend that a return was submitted.

Only the public static site is hosted here. A persistent private Shuug backend,
owner accounts, reviewed staff permissions and real client access remain to be
deployed and verified before accepting taxpayer records. The Tax Firm SDK modules
track work; they do not perform AI document processing, return calculations,
electronic signatures, payments or e-filing. Refer to `docs/TAX-FIRM.md`.

The website is an initial public launch, not certification of a nationally
distributed tax practice or an independently reviewed compliance program. Verify
the actual firm identity, contact details, qualifications, service availability
and policies before enabling live client operations.
