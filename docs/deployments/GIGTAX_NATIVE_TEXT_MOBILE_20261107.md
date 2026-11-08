# Native text and mobile layout — November 7, 2026

Luke requested real fonts across every page instead of complete screenshot
backgrounds, then supplied a mobile Services screenshot showing excessive blank
space and narrow broken-up buttons. This request supersedes the older exact
bitmap approach.

Home, Services, How It Works, Drivers, About and Get The App now render one
visible HTML layout at every width. Their headings, descriptions, actions,
platform labels, phone previews and numeric examples are real browser text.
Photography uses bounded SVG viewports of the supplied art; icons and the route
illustration are vector paths. The office illustration uses CSS and real text.
Offices and Resources also use these native illustration components. Existing
native tools, guides and policies retain their content and gain the shared
readable header/footer styling. The large homepage map remains unchanged.

Services has category filters with accessible result counts and section links.
Cards and actions flow normally instead of occupying percentage-positioned
screenshot hotspots. Small screens stack controls with at least 44px tap targets.
Subtle section-entry animations respect reduced motion; content is always
visible even without animation, JavaScript or IntersectionObserver. Mobile
menus retain focus restoration and the existing Get The App/Client Portal bar.
App download links remain explicitly coming soon; no store links were invented.

Validation:
- Build succeeds; 12 customer DOM tests and the sales DOM workflow pass.
- `scripts/rideshare-site/layout-audit.swift` uses macOS system WebKit, with no
  downloaded browser runtime and no screenshots. 154 checks cover 22 public
  pages at 320, 375, 390, 430, 768, 1024 and 1440px. Actual viewport widths match.
- No horizontal overflow, hidden main headings, undersized tested controls or
  excessive mobile hero gaps. At phone widths menus open/close and restore focus.
  At 390px Services filtering, actual section-link scrolling below the header
  and animation entry are verified. Receipt: `gigtax-native-text-layout-20261107.json`.
- The async native dialog-close event is awaited before focus/scroll checks.
- Physical phone appearance is not established by these measurements. Luke's
  fresh screenshot of the published page is the visual acceptance gate.

The existing unrelated untracked How It Works HTTP receipt was preserved.
Private sales/backend records and payment configuration were not modified.

Published source: `009a56aacd7f02ab2f4bea79f9e82b581769c534`, verified on GitHub
branch `feat/gig-tax-pros-sales-integrated`.
Production deployment `dpl_B65t5RhipmQguPEZhKCc9sMVHdPo` is Ready, aliased to
https://gigtax.pro. All 84 public HTTP file/route checks pass and the www Services
HTML is byte-identical to the saved build. Receipt:
`gigtax-native-text-http-20261107.json`. Safari was opened on the normal desktop
at https://gigtax.pro/services and left open for Luke. The local test HTTP server
and owned WebKit audit processes exited; no VM or isolated desktop was used.
