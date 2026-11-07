# Gig Tax Pros website and custom domain — November 7, 2026

The public website is live at https://gigtax.pro and https://www.gigtax.pro,
branded **Gig Tax Pros**, powered by Shuug.

## Cause and repair

The purchased GoDaddy domain is `gigtax.pro`; its registry nameservers already
pointed to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. The existing Vercel
project had the misspelling `gittax.pro` and `www.gittax.pro` attached instead.
Before repair, the correct domain had no working DNS service and browsers
displayed a DNS failure. Adding the correct apex and www domains to the
existing `rideshare-tax-pros` project restored DNS and HTTPS immediately in
the observed checks. The old typo entries remain; no registrar or billing
changes were needed.

## Published source

Branch: `fix/gig-tax-pros-website` in `AgewellEPM/shuug-business`.
Implementation commit: `3182dbb1d17d0394a795d26dccf2e8d38b6883e6`, pushed and
independently verified at GitHub before deployment.

Website source remains in `public/rideshare-tax-pros` and
`scripts/rideshare-site`, with `scripts/build-rideshare-site.mjs` as the build
entrypoint. The existing Vercel project name and internal directory identifiers
remain compatible. The default Vercel build now uses `https://gigtax.pro` as
the canonical origin. The explicit Cloudflare build retains its own origin.

Branding changes cover desktop and mobile headers, shared navigation/footer,
all generated pages, policies, recovery page, dialogs, preparation checklist
download, titles, descriptions, sitemap and canonical/social URLs. Desktop
branding uses live HTML over the supplied artwork's original wordmark. The
original artwork is preserved and is no longer used as the social-preview
image, where its embedded old wordmark would otherwise appear.

Deployment: `dpl_QgDDYSEk2SuSrSs8jGSf9GqXAT6k`, production, Ready.
Deployment URL:
https://rideshare-tax-pros-m4h3qr0w1-lukekist-2968s-projects.vercel.app.

## Evidence and remaining acceptance

- Static build generated all 19 pages.
- All six existing website interaction checks passed, including navigation,
  preparation/checklist export, FAQ filtering and client-link validation.
- All 50 real public HTTP checks passed through `https://gigtax.pro`, checking
  exact deployed bytes for files, every clean page route, security headers and
  branded HTTP 404 recovery.
- Apex, www and the original `rideshare-tax-pros.vercel.app` address each
  returned HTTP 200 and exactly matched the new saved homepage, including the
  Gig Tax Pros title and custom canonical URL.
- Detailed receipt: `gig-tax-pros-domain-verification-20261107.json`.

These checks establish live DNS, HTTPS and deployed website behavior. Luke's
desktop/mobile screenshot acceptance is still outstanding; no browser rendering
claim follows from the HTTP or DOM checks. Contact details and private client
workspace availability retain their existing configuration.

Future public-site deployments should use this branch or incorporate this
commit first so older website source does not restore the old branding.
The separate ongoing native-app work was preserved.
