# Gig Tax Pros store text and submission audit

Build 2026111603 (1.0.0), App Store version 1.0, app 6835595554.
The owner requested a listing audit, submission and release after approval,
with the initial storefront limited to the United States.

## Saved and checked in Apple

- Reworded the English description around local mileage/records, receipt OCR,
  screenshot comparisons, explicit screen sharing, user cost assumptions and
  clearly labeled samples. Firm and bank connections explicitly require an
  available configured service and authorization.
- Replaced the marketing link with the accurate app-support page. The previous
  about-the-app page promises automatic earnings imports and job acceptance
  that are not established for this release. The website itself is unchanged.
- Preserved AFTER_APPROVAL; the listing helper now respects the source setting
  instead of silently reverting every update to MANUAL.
- Completed all current age-rating questions, including messaging/chat for
  client/firm messages. Private records are not broadly distributed user content.
  No ads, gambling, unrestricted browser, social feed or mature material. Apple
  calculated FOUR_PLUS. See age-rating.json for the exact answers.
- Set the free USD price point. Configured all 175 territory decisions with only
  USA available and automatic new-territory availability disabled. Independent
  GETs verified the price and exactly one available territory.
- Set USES_THIRD_PARTY_CONTENT following the owner's decision to proceed after
  the artwork provenance was explained. Asset source URLs are not independent
  proof of a permission grant; no clearance opinion is asserted by this audit.
- Updated reviewer notes with precise local entry points and honest disclosure
  that the hosted workspace and signed-in provider review are unavailable.
  Actual contact details were preserved privately. No fake login was supplied.

Text and metadata mutations were verified through Apple's authenticated API.
All 12 existing current screenshot assets remain COMPLETE and attached build
2026111603 remains VALID. No app runtime code or screenshots changed in this audit.

## Submission boundary

Created one empty iOS review draft. Apple's add-version validation returned
APP_DATA_USAGES_REQUIRED, requiring published privacy answers. No app was sent
to review by that failed request. The public API does not expose the questionnaire;
the owner is completing it in the signed-in web UI with screenshot guidance.
Re-use the existing draft after publication; do not create duplicate submissions.

The hosted driver health route still returns 404 and public workspace discovery
is null. Physical-device GPS/ReplayKit acceptance and actual hosted account
sync/recovery remain unverified. These are disclosed limitations; Apple's
metadata validation is not evidence that those features work. Approval and
public availability must be observed independently after submission.

Private API before/after receipts are outside Git in the existing app release
support folder. No key, issuer, private contact or session cookie belongs here.

## Claim-to-source check

| Listing claim | Shipping source |
| --- | --- |
| Local records, start/end drive, export | RootView.swift, DriverModel.swift, DriverCore/JournalExport.swift |
| Selected/scanned receipt, on-device OCR | ReceiptCapture.swift, expense editor |
| Screenshot offer review | OfferScreenshotImportView.swift, OfferReaderView.swift |
| Explicit screen sharing | BroadcastUpload/SampleHandler.swift, OfferReaderView.swift |
| User costs and sample figures | UniversalGigSettingsView.swift, SampleShiftView.swift |
| Account/provider prerequisites | ConnectionView.swift, WorkspaceClient.swift, GigConnectionsView.swift, BankConnectionView.swift |
| Permissions and sharing disclosure | DriverPrivacyView.swift, app-privacy public page |

Checks: JavaScript syntax; Apple text field readback; age-answer readback;
price-point readback; complete territory enumeration; actual add-for-review
validation. Existing signed runtime verification remains separate.
