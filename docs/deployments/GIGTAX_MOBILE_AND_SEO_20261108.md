# Mobile consistency and Google search preparation

Implementation: `b57ef6c13a191a3145fec6c6b1cdcef1e560517c`, following platform
strip `d9d6b58`, homepage bottom action `d66392c`, and mobile refinement `95bffd1`.
Branch: `feat/gig-tax-pros-sales-integrated`.

Production deployment `dpl_6BjkcBNmX5hiANUJWDSd69VvUb17` is Ready at
https://gigtax.pro. GitHub backup of the implementation was independently verified.

## User-facing result

- Home's swipeable platform strip sits directly beneath its large My Portal
  button, before the benefits and Maximize Your Ride Income sections.
- All 22 main customer pages and the standalone app tour have one mobile strip
  with genuine Uber, Lyft, DoorDash, Instacart and Amazon Flex marks, plus the
  final All Gig Platforms tile. Private sales/enrollment and recovery pages are
  excluded from this marketing control.
- The first tile starts 24px in from the left. A partially visible next tile
  indicates horizontal scrolling. The final tile is reachable.
- Mobile bottom actions are green Get The App and outlined My Portal, including
  Home and the standalone tour. The app-store links remain unconfigured and the
  app page still states coming soon.
- Approved desktop artwork is retained. Recent mobile hero refinements remain:
  left-aligned copy, edge-to-edge photos outside bordered panels, and subtle
  bounded parallax that respects reduced motion. Border-contained artwork stays
  in its approved composition.
- Primary navigation remains Home, About, Services, How It Works, Drivers.
  Services opens directly; Offices is in the footer. Concurrent My Portal rename
  and homepage tour-video work are preserved.

The generic native-font reconstruction was rejected and reverted earlier.
Reconstructing all artwork as real text remains deferred; do not reapply that
rejected change or redesign the approved pages.

## Search implementation

The builder updates the head only, preserving each existing renderer's body
bytes. Pages have distinct titles/descriptions, canonical URLs, social sharing
metadata, and truthful WebPage/BreadcrumbList structured data. Home also identifies
the actual Gig Tax Pros Organization and WebSite with its existing brand mark.
No office addresses, ratings, credentials, contact details or store links were
invented. Exact JSON-LD hashes are allowed by the existing strict CSP.

The generated sitemap includes indexable pages and `/tour/`. Unconnected portal,
private enrollment/sales, bank-return and error routes use noindex. Known public
`.html` aliases and index URLs permanently redirect to their preferred URLs;
`www.gigtax.pro` redirects to the apex while preserving paths and query strings.
Private workflow aliases and bank-return routes retain their existing behavior.

Search intent is mapped to existing useful destinations without assumed volumes:

| Search intent | Destination |
| --- | --- |
| Gig Tax Pros / Gig Tax Pro / gig tax experts | Home, About, tax preparation |
| Gig economy tax preparation; Uber/Lyft/delivery driver tax help | Tax preparation, Drivers |
| Gig-driver mileage, vehicle costs and expense records | Mileage & Expenses |
| Quarterly estimated tax questions for gig workers | Quarterly Tax Support |
| Bookkeeping and organizing gig income | Bookkeeping |
| Uber/Lyft 1099 forms and annual summaries | Uber & Lyft Tax Forms guide |
| Gig-worker tax documents and preparation | Resources, Document Checklist |

## Verification and limits

- 11 customer DOM/workflow tests pass.
- 13 SEO unit, routing and built-output tests pass. They verify metadata,
  canonical consistency, exact body preservation, sitemap scope and CSP hashes.
- Four bounded-parallax behavior tests passed in the preceding mobile work.
- All 101 live file/alias/recovery checks pass, including byte comparison with
  the saved build: `gigtax-pages-live-20261108.json`.
- All 53 live SEO checks pass, including 308 destinations, query preservation,
  www redirects, sitemap destinations, explicit noindex utilities and metadata/CSP
  under a Googlebot user-agent: `gigtax-seo-live-20261108.json`.
- All 23 live mobile checks at 440px pass in the installed macOS WebKit engine:
  logo loading, one-line rows, inset/peek, scrolling to the end, green bottom
  actions, no page overflow and Home placement. Evidence:
  `gigtax-platforms-live-20261108.json`. This nonvisual renderer substitutes a
  timer for requestAnimationFrame; it is not physical-phone visual acceptance.
- Earlier hero work compared 12 desktop layouts with the approved baseline and
  checked 42 responsive cases. The current SEO tests preserve page body bytes.

Search Console ownership/access is not established. No property, indexing
request, sitemap submission or actual Google rank gain is claimed. An ordinary
request with a Googlebot user-agent does not prove a real Google crawl. A search
operator returning no results does not establish deindexing.

Next: verify the `gigtax.pro` Search Console Domain property using owner DNS,
submit `/sitemap.xml`, inspect Home and priority service URLs, request indexing,
then measure queries/pages by country and device. Public store links and verified
office contacts remain separate activation work. Actual Google #1 ranking cannot
be guaranteed. Luke's screenshots remain the visual acceptance source.

Primary guidance: [Google SEO](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[ranking guarantees](https://developers.google.com/search/docs/fundamentals/do-i-need-seo),
[canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls),
[site names](https://developers.google.com/search/docs/appearance/site-names),
[organization data](https://developers.google.com/search/docs/appearance/structured-data/organization),
[Search Console ownership](https://support.google.com/webmasters/answer/9008080),
[sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
