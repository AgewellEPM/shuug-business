# Gig Tax Pros interaction tour — November 8, 2026

The static three-instruction panels are replaced with the actual app display:
54 recorded tap/typing actions, one synchronized spoken instruction and native
caption at a time. There is no phone bezel, surrounding artwork, sidebar or
burned instruction panel. The opening instruction tells viewers to turn their
phone sideways. Native captions are on by default and remain selectable.

The final master is 1920 × 884, H.264/AAC, 30 fps, 244.133 seconds, with 13
chapters and 54 English caption cues. Its SHA-256 is
`bbf9518e89d11f9e603096d7e0ecc336e16a5010c0d78335dadc2306811cc6dc`.
The four offline iOS resources are also exported in the reusable Desktop package.

## Captured behavior and isolation

A DEBUG-only UUID routes practice recordings into a separate guest journal and
skips the normal account connection. Manual trip, expense, goals, mission and
rating changes use the real app forms. The screenshot practice guide uses the
real profitability engine and its changed-pay result was checked as $8.70.
Every recording compares hashes of the normal journal before/after; the final
run passed with normalJournalPreserved=true. Practice journal checkpoints let
later takes resume without changing the normal user journal. Earlier verified
clips are retained, with provenance in each recording actions.json.

Capture evidence:
`/Volumes/PRO-G40/GigTaxProsVerification-20261107/action-full-11/`.
The XCTest walkthrough passed; no physical-phone or human visual acceptance is
claimed. Each raw source digest, retained time range and dispatched tap count
is in the JSON receipt beside this document. The editor removes test-runner
search lead-ins, preserves the actual action, and restores only time omitted
by the simulator's variable-frame-rate recorder. It does not manufacture an
animated app from screenshots or add editorial freeze frames.

The recording exposed an hourly-rate display bug. Home and Earnings now use
only rides eligible for the core's hourly calculation (at least one recorded
minute). A near-zero-duration manual trip no longer produces an enormous rate;
normal net and mileage totals remain available. The installed capture checked
that this incomplete-time example shows an em dash for hourly rate.

## Reproduction and website integration

Build the existing iOS Simulator scheme for testing, then use
`scripts/tour/record-actions.py OUTPUT` on the existing preview. Use
`scripts/tour/produce-actions.py OUTPUT --install` to produce the complete
bundle. `--reuse`, `--seed-practice` and `--skip-before` resume verified takes
from a matching isolated journal; resume at a screen reachable from Home.

`scripts/tour/update-site.mjs EXISTING_PUBLIC_TOUR_DIRECTORY` replaces only
media, chapter/transcript content and player caption/framing behavior. It keeps
newer site navigation, mobile controls and metadata. Video, poster and caption
URLs receive a content revision to avoid replaying cached media.

Current website integration worktree is
`/Users/lukekist/Worktrees/GigTaxProsTourPolish-20261107`, branch
`feat/gigtax-tour-polish`, including the latest SalesIntegrated b57ef6c.
The previous GetApp worktree was restored after its bounded changes were moved
into the newer integration. Native playback and live website receipts are
recorded separately after installation/deployment.
