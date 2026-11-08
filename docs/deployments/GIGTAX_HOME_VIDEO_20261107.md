# Homepage video and My Portal labels

Requested by Luke after approving the narrated app tour. The hero action that
previously said File My Taxes now says See How It Works and opens a native
accessible video dialog on the homepage. Desktop and mobile actions share this
behavior. The dialog includes landscape guidance, captions, native controls,
close/Escape behavior, pause on dismissal and focus return. Without JavaScript,
the action opens the standalone tour with chapters and transcript.

All customer-facing Client Portal labels, including navigation, footer, mobile
actions, portal page title and bank-return link, now say My Portal. Existing
/client-portal destinations remain functional.

Source is GigTaxProsGetApp-20261107, feat/gigtax-get-the-app, whose built
homepage matched the actual live homepage before editing (deployment
 dpl_GcJhhQqGatATjap3BiBZVksGwmUA). The earlier CustomerSite branch is older;
do not republish it over this update. The approved artwork, current navigation,
app download page and office/sales functions are retained.

The video is the approved exact app MP4, SHA256
b0082eece2487b7e8efa1f042d9b34a347ae4916d1bd8c2d28bb61a926213d21.
It is served from /tour/getting-started.mp4 with a standalone /tour/ page.

Validation: static build succeeds; all 11 website checks pass, including modal
open/play/close/pause/focus, playback rejection and site-wide label checks.
Every built HTML page is free of the old Client Portal phrase. Browser visual
acceptance remains Luke's; live HTTP evidence is saved after publication.

Published deployment `dpl_8SXS3TxS4nksq5u6LJeekCmhgG9R` is Ready. Both apex
and www match the saved homepage. All 91 public HTTP checks pass, with exact
asset bytes. Video range requests return HTTP206, captions use text/vtt, and
the /tour/ fallback is live. Evidence: gigtax-home-video-live-20261107.json.
