# Mobile button dimensions — November 7, 2026

Luke requested a mobile-only fix for compressed buttons and gaps in the About
and Services screenshots, with the approved desktop design and artwork intact.

Only four published CSS files change. Under `max-width: 1023px`, action links
reset desktop percentage insets/sizes to `inset: auto; width: 100%; min-width: 0;
height: auto`. The Services rule also covers How It Works. Drivers and Get The
App have the same inherited-dimension bug, so receive the identical scoped fix.
There are no changes to page templates, content, artwork, navigation or scripts.

Verification in macOS system WebKit (nonvisual; no browser download):
- Reproduced the screenshot at 440px: About hero buttons were 67.3/59.8px wide
  with a 46px gap. They become 396px wide, 50px tall, with the existing 12px gap.
- Services hero buttons were 77.2/71.3px wide with a 62px gap. They become 396px
  wide, 48/53px tall, with the existing 12px gap.
- Five affected pages pass at 320, 375, 390, 440, 640, 768 and 1023px: buttons
  fit, action groups have no excess gap, no horizontal overflow, mobile menu
  opens/closes and restores focus. Final saved CSS passes the same checks.
- All computed element styles and geometry compare exactly before/after at
  1024 and 1440px for all five pages (ten desktop comparisons unchanged).
- All eleven current customer DOM tests pass (including the preserved video workflow). Build output hashes differ only
  for about.css, services.css, drivers.css and get-the-app.css. Every HTML,
  image and script is byte-identical to the current portal/video build4ab8f62.

45 responsive checks pass. Local before/after measurements are retained in
`/private/tmp/gigtax-mobile-buttons-before-after-20261107.json`; final saved CSS
measurements in `/private/tmp/gigtax-mobile-buttons-20261107.json`. These establish
layout/interaction behavior, not Luke's physical-phone visual acceptance.

Existing unrelated untracked How It Works receipt remains untouched.

Concurrent update preserved: during the first publication, another session
published My Portal and the homepage tour video (`4ab8f62`). That exact commit
was carried into the integrated checkout as `b2dad6e`. A full build comparison
against that current source again differs only in the four CSS files above.
The other session's worktree was not changed. The initial mobile-only deployment
was superseded and is not the final verification target.

Final production `dpl_i4o2TFJM7UiHjMzy5jJ83QaSr4nZ` is Ready on gigtax.pro/www.
All 91 published file/route checks pass; www About CSS is byte-identical to the
saved fix. Implementation `41b64ba` is backed up; final evidence commit also
includes the preserved concurrent update. Compact receipt:
`gigtax-mobile-dimensions-verification-20261107.json`. The local preview server
and all owned system WebKit audit processes have exited. User screenshots are
still the physical-phone visual acceptance source.
