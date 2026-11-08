# Gig Tax Pros getting-started tour

Source: `feat/gig-tax-pros-telemetry`, `Worktrees/GigTaxProsTelemetry-20261107`.

The native iPhone app presents a skippable getting-started page on first launch.
It bundles a recorded app walkthrough with local narration, burned captions,
an English subtitle track, a readable transcript and 13 chapter shortcuts.
Users can replay it from Get help, Account or the Home menu without a network
connection. Watching or practising must not create financial records.

Luke's November 7 correction is included: **Turn your iPhone sideways** appears
before playback, in the portrait player, and in the opening narration and
captions. The player reminder disappears when the phone rotates to landscape.
The page explains Portrait Orientation Lock for a phone that stays upright.

The recording includes the existing interactive screenshot guide and office-help
screen. DoorDash's published example retains its original bytes and provenance;
the lesson explicitly distinguishes its displayed values from practice time and
cost assumptions. Office contact availability depends on published directory
data. No actual office call, appointment, provider connection or client data was
used to record this tour.

## Media evidence

- Recorded 13 native Simulator sections in a fresh guest profile, then deleted
  the owned recording device. Raw recording and production receipts:
  `/Volumes/PRO-G40/GigTaxProsVerification-20261107/tour-20261107-01/`.
- Updated video: 258.489714 seconds, 10,533,442 bytes, 1920 × 1080 H.264/AAC,
  English subtitles and 13 embedded chapter markers.
- Video SHA256:
  `63bbfd08b70efd81d9c0980ef9d026bcc3bb72e580c04d107a1bf5697095fcb7`.
- Reproducible inputs and local editing tools: `scripts/tour/`,
  `scripts/record-rideshare-tour.py`, `UITests/TourRecordingFlows.swift`.

## Verification in progress

The app and UI runner built successfully before the landscape correction.
The first playback test did not find the native controls after they hid during
playback. That failed run is retained at
`/private/var/folders/d_/4nl8dfbs6nx4rl91nfj_7lxm0000gn/T/rtp-ios-ui-uguwl4bf/`;
its owned Simulator was shut down and deleted. The focused check now reveals
native controls and verifies the landscape reminder, actual play/pause, chapter
playback, skip/relaunch persistence and replay from Get help.

Run `scripts/verify-rideshare-ios-ui.py --tour-only --visible` against the freshly
built app to produce the final installed-bundle receipt. Physical iPhone
playback, heard narration and Luke's visual acceptance remain unverified.

The independent connected-work worker and its installed verification receipt
remain outside this tour checkpoint.
