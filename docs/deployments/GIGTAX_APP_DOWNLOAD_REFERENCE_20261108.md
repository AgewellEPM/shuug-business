# Get The App download reference

## Current page names and navigation

Luke clarified that Get The App and About The App must be separate pages and
About The App must be visible in navigation. Implemented in `8104e41` and
`cf23940`; GitHub backup independently verified.

- https://gigtax.pro/get-the-app — download design and availability.
- https://gigtax.pro/about-the-app — detailed app explanation/features.
- https://gigtax.pro/about — the existing company story, preserved.

About The App is a distinct desktop/mobile navigation item after Offices.
The Get The App header/bottom actions still open the download page. Feature
links and the company About page's feature actions open About The App; its
download actions open Get The App. Previous `/app-features` and
`/app-features.html` links permanently redirect to `/about-the-app`.

Current Ready deployment: `dpl_3KGkvTFvRWEej5WJmXVbepP3Ghbf`. All107live
file/alias checks and57SEO/redirect checks pass, with12customer tests and14SEO
tests passing. Seven desktop links fit the existing CSS/font metrics with35px
minimum spare width at1024px; no stylesheet/artwork changes were needed.
Selected live evidence: `gigtax-two-app-pages-20261108.json`.

## Initial download design implementation

Luke supplied the 1199×1312 download design and explicitly chose to retain both
pages. Implementation `2bc9ee2599e6872d4553ed96f7529a6d83e028d0` is on
`feat/gig-tax-pros-sales-integrated`; GitHub SHA independently verified.

Ready production deployment: `dpl_9b5LXZ4kvHPsAVoVjVmCpeqByLFd`.

- https://gigtax.pro/get-the-app — new supplied download design.
- The previous detailed app design was retained, now at `/about-the-app`.

## Design and behavior

The new source PNG is copied unchanged to `assets/app-download-reference.png`.
Its SHA-256 matches the supplied file exactly:
`547e445e19841d58d6ba43718e51410f53ae01913af145b6f799e0b600c636a6`.
The desktop layout uses that approved image with accessible links and the current
shared header. Navigation remains Home, About, Services, How It Works, Drivers,
Offices, plus My Portal/Get The App controls. Other page styling is unchanged.

Mobile uses readable left-aligned content, edge-to-edge hero/skyline images,
bounded hero parallax with reduced-motion support, six feature links, the shared
swipeable five-logo row and green bottom app action. Feature links open the
preserved detailed page. The new module and stylesheet are scoped separately.

All four store controls use validated public HTTPS URLs only. Since Luke already
confirmed download links are not ready, public iOS/Android configuration remains
null. The controls currently focus the availability message and say coming soon.
Configuring valid links updates their destinations and available labels; update
SEO descriptions when public distribution actually starts.

The mock reference QR could not be decoded. A real branded SVG QR now points to
the download page's availability section. It uses high error correction and a
four-module quiet zone. Independent zbar decoding succeeded at132px and616px.
The source-image mock ratings and unverified OS-version lines are covered by
small matching labels, rather than presented as verified app reviews or device
requirements. No ratings or app-store URLs were invented.

## Verification and limits

- 12 customer DOM/workflow tests pass, including configured/unavailable/unsafe
  download destinations, focus on unavailable taps, both page routes, internal
  links and current navigation.
- 13 SEO unit, route and built-output checks pass, including exact renderer-body
  preservation and the new canonical/sitemap route.
- Eight nonvisual system-WebKit cases pass at320,390,440,768,1023,1024,1199 and
  1440px: no overflow, image proportions, full-width hero, left text, loaded logos
  and QR, scroll reach, touch targets and green bottom action.
- Two published WebKit cases at440px/1199px pass. The mobile case also observes
  changing bounded parallax with no exposed blank edge/layout shift, and tapping
  the unavailable iOS control focuses coming-soon status without leaving.
- All107 live file/alias/recovery comparisons pass against the saved build.
- All55 live SEO/redirect checks pass. That successful tool response was
  truncated, so its full per-check receipt was not retained for this run.

Evidence: `gigtax-app-download-design-20261108.json` and
`gigtax-app-download-http-20261108.json`. WebKit uses an unshown native window
with a timer-backed frame clock; it is not physical-phone visual/touch approval.
Luke's screenshots remain the visual acceptance source. Safari was opened at the
new page on the normal desktop. Owned local server/helper processes were stopped.

Remaining: actual public app download URLs, confirmed device requirements and
real store reviews when available; Search Console verification/indexing/ranking
measurement remains unconfirmed. Existing unrelated
`gigtax-how-navigation-http-20261107.json` is preserved uncommitted.
