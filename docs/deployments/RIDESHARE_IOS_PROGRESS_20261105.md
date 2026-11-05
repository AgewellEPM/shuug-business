# iPhone driver app work — November 5, 2026

Goal: build the Rideshare Tax Pros native iPhone app for live mileage, expenses,
receipt capture and the existing Shuug workspace. Oracle authentication blocks
public cloud hosting; it does not block app development.

Worktree: `/Users/lukekist/Worktrees/ShuugDriverIOS-20261104`, branch
`feat/rideshare-ios-driver`, based on `5d1492b`. The original installed-workspace
checkout and its compiled build/data remain preserved.

Earlier checkpoints `af47db8` (API/core), `ef13d53` (native app) and `3986095`
(recorded local trip dates/time zones) were pushed with their exact GitHub SHAs
verified. This change adds the website's dark theme/logo and expanded expenses.

The app now records 23 expense categories, including meals separately from rider
snacks, repairs, maintenance/oil, tires, charging, insurance, rental/lease,
tolls/parking, phone, platform fees and professional costs. Optional business
purpose, business-use share, meal participants/travel context, vehicle, odometer,
payment method and place persist through CSV and Shuug sync. Spending & review
shows category totals and missing details. Similar payments require confirmation
before an additional expense is saved. These are records for review, not an
automatic tax deduction.

The brand colors match the actual published website CSS, and the native mark is
the website's exact SVG. Receipt suggestions require an explicit tap. The longer
expense form has a keyboard Done control; GPS service availability is checked
off the UI thread after a native test exposed a responsiveness warning.

Evidence obtained this pass:

- Complete Shuug production build and TypeScript pass. Compiled build
  `fM16qYM16GXoIL1LDj4ds` contains the expanded driver API and staff review fields.
- Fifteen focused backend/client tests passed; ten Swift core tests passed,
  including legacy-journal compatibility, CSV safety, category totals and
  duplicate/review rules.
- The actual iPhone app compiled for arm64 against iPhoneOS26 with minimum iOS17,
  with signing disabled. Artifact:
  `/private/tmp/rideshare-ios-build/Build/Products/Debug-iphoneos/RideshareTaxPros.app`.
- Eighteen checks using the app's actual Swift `WorkspaceClient` and a compiled
  disposable Shuug server passed at `2026-11-05T18:59:53.802Z`. They include
  actual native receipt upload/download bytes, account isolation, retries,
  revision conflicts, optional-field JSON, deletion, staff review, authenticated
  staff receipt download, all 23 expense categories/metadata and immediate
  session/account revocation. Helper PID 24014
  exited; the harness also independently checked it was absent and removed its
  private synthetic workspace. No real client data was used.

The signed Simulator build uses the normal local ad hoc signature so the app can
use Keychain. All three real native UI flows passed at `2026-11-05T22:46:16Z`:
Start/End drive, 333.585 m from 7 synthetic GPS fixes, background/foreground,
saving/relaunch, system photo import, on-device recognition with an explicit
amount choice, private receipt display, meal purpose/participants, repair
vehicle/odometer/business-use data, category totals and an unconfirmed duplicate
being kept out of the journal. The actual installed binary matched the compiled
executable SHA256 `0baababd9e563ac32e180037ee6c23e5737fe9c552fb4ca4fdd5343490096ec0`.
The helper audited actual app-container data and verified its diagnostic
Simulator was shut down and deleted. See
`rideshare-ios-simulator-verification-20261105.json` for the evidence and limits.
Xcode also logged a nonfatal SwiftUI "Invalid frame dimension" runtime warning
during these passing flows. Its source is unresolved; visual acceptance and
physical-device validation remain pending rather than claiming a warning-free
release.

Physical phone testing was explicitly deferred in favor of the emulator. A
physical phone install, real GPS/camera, locked-screen behavior and battery use
are not established by Simulator checks. Visual acceptance still belongs to the
user; open the normal-desktop preview after diagnostics and request a screenshot.
No App Store/TestFlight submission or live public workspace is claimed.

Oracle authentication/persistent public workspace hosting remains pending.
The public website has no workspace URL until that deployment is verified.
See [driver architecture and operating guide](../RIDESHARE-DRIVER.md).
