# Private TinkySDR map and pipeline console — November 8, 2026

Luke requested the visually rich existing online TinkySDR workspace. He
explicitly selected **Map and pipeline workspace only**, excluding Files/Media.
The reference is https://tinkytown.com/outreach.html, also embedded by
`TinkySDRMac/Sources/TinkySDR/Views/WebDashboardView.swift`. Its HTML and eight
key CSS/JS assets matched `/Users/lukekist/TinkySpeak-Web` byte for byte.

## Result

The private `/sales` page now has TinkySDR's system fonts, light/dark glass
panels, ambient background, sidebar/navigation, dashboard cards, stage chips,
board/list pipeline, territorial office counts and an office detail drawer.
It retains GigTax branding and the existing session, assignment, review,
do-not-contact, draft, follow-up and enrollment controls. No tenant API key or
TinkySDR's broad auth/send handlers were copied into the client.

The map embeds all 51 genuine state/DC paths from the existing Census-derived
`us-national-vision.svg`, including Alaska/Hawaii insets. Selecting a state
prefills discovery; saved city cards open real office research. Counts derive
only from the authenticated user's saved pipeline, and paid membership counts
require current eligibility. No sample offices, locations or revenue appear in
the live workspace. Native state buttons provide accessible alternatives to
small SVG regions. The office drawer traps focus, restores it on close and
ignores late reads after closing. Mobile navigation stays in one swipeable row;
WebKit dropdowns use 44px targets with a visible CSS caret.

Implementation commits: `9328c0859628b230a7a2c0d0ff218a866fb8e648` and
`a2a3c14` on `feat/gig-tax-pros-sales-integrated`, canonical checkout
`/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`.

## Deployed verification

Production is Ready at https://gigtax.pro/sales:
`dpl_43PBWWJDBAKJSemHGpZ25zUEvi2G`, URL
`https://rideshare-tax-pros-4in57fz8h-lukekist-2968s-projects.vercel.app`.

- 126 focused sales/billing/research/console/packaging tests pass, including the
  complete guarded handler flow and real map/board-to-drawer integration.
- Native macOS WebKit measured 320, 390, 440, 768, 1280 and 1440px with synthetic,
  read-only records: all pass overflow, controls, navigation, map, board scroll,
  drawer bounds/scroll/close and runtime-error checks. Finite CSS animations were
  explicitly finished for final geometry in the unshown renderer. This does not
  establish physical touch/animation feel or Luke's visual approval.
- All nine private files match the deployed build. Owner login, protected
  cookie, all four IRS pages/161 unique candidates, origin gates, unsigned
  webhook denial and public directory reads pass on the actual deployed API.
  The probe logged out; the real workspace remains zero offices/agents/listings.
- All 78 public files match their previous HTTP SHA-256 and uploaded SHA-1;
  original headers and route/CSP configuration remain exact. The 45 backend
  function artifacts also match the prior prepared production build byte for
  byte. This UI update did not modify backend implementation or Worker settings.
- Temporary native helpers/server exited; Safari was visibly opened on the
  updated owner workspace using the existing private shortcut.

Prepared output: `/private/tmp/gigtax-tinkysdr-console-final-20261108`.
The constrained overlay packager validates the original 117-artifact live
baseline, overlays nine private static assets and the existing three function
directories, and preserves all other bytes. The full local public build still
differs from live; **do not deploy it directly**. Recheck the current alias and
public baseline for any future publication.

Evidence: `gigtax-tinkysdr-console-{layout,overlay,deployed,public-live}-20261108.json`.
Backend implementation and configuration proof remains in
`GIGTAX_SALES_RESEARCH_20261108.md` and its linked receipts. Mailbox/provider and
Stripe credentials remain unconfigured; no outreach or payment was performed.
Existing unrelated untracked How It Works receipt and original Worker working
copies were preserved as documented in that handoff.
