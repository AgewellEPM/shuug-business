# Mobile hero alignment, full-width photos and platform bar

Luke requested centered mobile hero text, photos extending to both screen
edges, scroll parallax on the hero photos, and authentic platform logos in one
horizontally swipeable bar. The broader real-font reconstruction goal is paused;
this work does not reconstruct or redesign the desktop artwork.

- Home, Services, How It Works, Drivers, About and Get The App share a mobile
  photo frame with intrinsic SVG dimensions. Balanced margins span the viewport
  even when the content sheet has a narrower maximum width. Mobile hero copy is
  centered. Frame edges are square and have no side inset.
- Original photo assets are unchanged. Mobile viewports exclude stray headline
  fragments from the left of the supplied page artwork. Desktop poster images,
  sections, navigation and their geometry stay in place.
- Photo-only parallax is bounded to min(24px, 4.5% of frame height), with 12%
  overscan so motion cannot expose empty edges. Passive scroll, a coalesced
  animation frame, intersection and resize observation limit work. Desktop and
  reduced-motion preferences disable/reset the effect. Static fallback works
  without JavaScript.
- Services, How It Works and Drivers retain their platform rows as one
  full-width horizontal scroll container. Authentic Uber, Lyft, DoorDash,
  Instacart and Amazon Flex marks replace the text chips; the final “All Gig
  Platforms” item is reachable by swiping or keyboard scrolling. Asset sources
  are recorded in public/rideshare-tax-pros/assets/platforms/SOURCES.md.

Validation:
- Build, all11 existing customer DOM tests and four focused parallax behavior
  tests pass. The latter cover bounds, coalescing, reduced motion, desktop reset
  and offscreen work avoidance.
- macOS system WebKit:42 checks across six pages at320,390,440,768,1023,1024
  and1440px pass. Mobile photos touch both edges with no page overflow; logos
  load and stay on one row; scrolling reaches the final item; actual scroll
  events change the photo transform while the frame dimensions remain fixed.
- All12 desktop comparisons match original source8559874. CSS transitions are
  frozen equally for before/after measurements, so an in-progress button glow
  is not mistaken for a design change. The native renderer uses a timer-based
  animation clock because nonvisual WebKit suspends requestAnimationFrame.
- Measurements establish geometry and behavior, not physical-phone visual
  acceptance. Luke’s refreshed phone screenshots remain the visual judge.

Local evidence: /private/tmp/gigtax-hero-desktop-before.json and
/private/tmp/gigtax-hero-mobile-after.json. No downloaded browser runtime or
isolated desktop was used. The unrelated untracked How It Works HTTP receipt
is preserved. No private sales data or service configuration changed.

Published implementation3ae9a6b is GitHub SHA verified. Production deployment
`dpl_5veBW5tJ5bAtg5bhYM4HrAkzV2ML` is Ready on gigtax.pro. All99 public file/route
checks pass. Live Services/Drivers at440px also pass actual security-policy,
edge-to-edge image, loaded-logo, horizontal reachability and scroll-transform
checks in system WebKit (same explicit timer clock). Receipt:
`gigtax-mobile-hero-logos-proof-20261107.json`. Safari is open on the normal
desktop at /services. The local server and all owned audit processes exited.
