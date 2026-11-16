# Gig Tax Pros — reviewer and TestFlight notes

Draft for the actual 1.0.0 device build. Confirm the production backend, account
and contact details before entering them into App Store Connect. No credential
belongs in this repository.

The local journal is usable without sign-in. Open Home, start a drive or add a
manual trip, classify it, add an expense and export the journal. The practice
guide contains explicitly labeled examples; they are not provider records.

For offer imports, while stationary choose Platforms → Choose screenshot, select
the platform and pick an image. On-device recognition extracts fields for review;
incomplete inputs are left unknown. Save only after checking them. This does not
accept or decline the offer in the provider app.

Optional ReplayKit broadcasting requires a physical device. In Account → Read
gig offers, enable a shift, then use Apple's screen-sharing button. The user
starts and stops the broadcast; the system shows the recording indicator.
Full screenshots, video and unrelated transcripts are not retained by our app.
Parsed offer observations are held locally. Reader permission expires after four
hours or when disabled or the account changes. We do not read another app's
private notification inbox. No accessibility-based remote-control integration
is used for job acceptance.

Location background mode supports user-started mileage and optional automatic
driving/stop assistance. Location and motion permissions are explained at use.
Assistance can be disabled in Account; end an active drive to stop its recording.
Route coordinates stay on-device; requested Apple Maps lookups send endpoints
and search terms to Apple. Routes and mileage depend on actual GPS availability.

The optional client account uses an invitation from the participating firm.
There is no native self-registration form. If invitation activation or account
creation is part of the submitted experience, verify Apple's account-deletion
requirement against that full flow; do not label sign-out as account deletion.
Provide a functioning review account privately in App Store Connect to review
signed-in features. Keep its records synthetic and isolated from real clients.

Bank and gig account connectors require the firm's authorized provider setup.
Do not describe an unavailable connector as live. The app does not file returns,
guarantee tax outcomes or automatically accept jobs. There are no native paid
digital subscriptions or in-app purchases in this build.

Before external beta, add actual beta contact information and explain any
unavailable hosted features. Before public review, complete the physical-device
checklist and the public-release verification in README.md.
