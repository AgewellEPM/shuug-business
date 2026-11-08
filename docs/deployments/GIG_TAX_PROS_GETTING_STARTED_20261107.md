# Gig Tax Pros getting-started tour and screen collection

Source: `feat/gig-tax-pros-telemetry`, `Worktrees/GigTaxProsTelemetry-20261107`.

The iPhone app has a skippable first-launch tour, offline playback, 13 chapter
shortcuts, written transcripts and replay from Home, Account and Get help.
“Turn your iPhone sideways” appears before playback and in the opening narration
and captions. The portrait-player reminder disappears in landscape. The page
also explains Portrait Orientation Lock.

The video uses the website's dark purple/pink palette and italic typography,
original vector branding, animated steps, a rounded phone frame, chapter
progress, narration and captions. A selectable English track remains available;
the player initially suppresses it because captions are already in the picture.
Async media loading and seeking stop when the player is dismissed.

## Reproducible media

- 258.62322 seconds; 1920 × 1080 H.264/AAC; 13 embedded chapters.
- 13,972,166 bytes; SHA256
  `b0082eece2487b7e8efa1f042d9b34a347ae4916d1bd8c2d28bb61a926213d21`.
- Original guest recording and production receipt:
  `/Volumes/PRO-G40/GigTaxProsVerification-20261107/tour-20261107-01/`.
  Final production is in `edit-branded/`.
- `scripts/tour/verified-cuts.json` binds reviewed decoded-frame boundaries to
  the original recording's digest. Simulator recordings omit unchanged frames;
  `produce-video.py` normalizes frame rate **before** trimming. Wall-clock test
  markers do not establish video timestamps. This excludes launch, notification
  and termination frames from the final chapters.
- First and last app frames from all 13 finished chapters were checked with
  native text recognition. The Home, drive, expense, screenshot lessons, field
  review, earnings/goals, mission, positioning, chat, ratings, account, help and
  closing scenes match their intended chapters.
- Narration uses the installed Samantha voice, synthesized locally. The
  original practice image retains its provenance. No real client records,
  financial entries, calls, bookings or external account connections were made.

## Website reuse

`node scripts/tour/export-web.mjs OUTPUT_DIRECTORY` creates a self-contained
player with the exact app MP4, poster, WebVTT captions, chapters, full transcript
and integration notes. The existing website builder includes it at `/tour/`.
The public homepage is unchanged. This work does not deploy the website.

The player has native controls, no autoplay, responsive layout, keyboard-accessible
chapter buttons, current-chapter indication and transcript fallback. The shipped
interaction code passes checks for delayed metadata, chapter seeking, playback
rejection and media errors. Export checks verify chapter timing, referenced
assets and identical app/web video bytes. Browser visual acceptance is separate.

The local reusable package is on the Desktop in
`Gig Tax Pros Tour - Website Ready`.

## Labeled iPhone screenshots

The Desktop folder `Gig Tax Pros Screens - 2026-11-07` contains the full-resolution
PNG collection, a searchable `Open Screen Gallery.html`, navigation paths and
`CAPTURE NOTES.txt`. Exact duplicate captures are archived in the private
verification directory. Images are not committed or published.

The walkthrough uses the existing visible iPhone 17 Pro Max preview, checks that
no second guest is running, preserves journal bytes, opens/cancels forms and
labels the app's built-in examples. It covers the available guest screens,
settings, forms, five platform diagnostics, both screenshot-import lessons,
manual entries, offer examples and account/help views. Signed-in tax documents,
protected-data enrollment, live bank/work connections, existing-record details
and physical-iPhone capture paths require the corresponding environment; these
limits are listed in the collection.

Capture and installed-app receipts are in
`/Volumes/PRO-G40/GigTaxProsVerification-20261107/screens-20261107-01/` through
`screens-20261107-04/`. Earlier passes retained their failed navigation checks;
follow-up passes replace the affected captures. The user preview remains open.

Final collection: 139 distinct screenshots from 155 captures. The final pass
passed playback, pause/resume, portrait-to-landscape guidance, chapter seeking,
welcome/chapters and all manual-driving forms. Playback advanced to 8 seconds;
the screenshot chapter opened at 1 minute 14 seconds. The installed bundle hash
is `3f9654ba6e3844e55e31815fa231b6b115036d625f327df38794fc4477435995`.
All capture groups passed across the completed passes; existing journal bytes
were preserved. All 7,758 final video frames decoded with increasing timestamps.
Physical-iPhone playback, heard narration and Luke's visual acceptance remain
unverified. Independent telemetry worker changes remain outside this scope.
