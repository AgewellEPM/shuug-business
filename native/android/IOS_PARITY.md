# iOS mirror implementation and remaining evidence

Updated 2026-11-08. Reference is the current `native/ios/RideshareTaxPros/App`
source and the 139 reference PNGs in `~/Desktop/Gig Tax Pros Screens - 2026-11-07`.
The target is the same navigation, card ordering, actions, recorded state and
meaning as iOS. Android uses native Compose and Android permission/media/picker
surfaces. A compiled APK does not establish screenshot or device acceptance.

## Screen inventory

The installed pass saved85 complete native screenshots at440dp in
`~/Desktop/Gig Tax Pros Android Screens - 2026-11-08`, including the actual
main tabs, menu, account, forms, offers, six-step guide, sample shift, reputation,
chat/intake and office screens. The gallery defaults to16 preferred F2/F review captures; earlier R/original captures are preserved under version filters.
“Implemented” below describes connected source; the remaining-evidence section
distinguishes installed checks from subsequent source changes and external setup.

| iOS screen/source | Android implementation | Implementation / remaining gap |
| --- | --- | --- |
| RootView / TodayView / HomeDashboardPanels / DashboardStyle | DriverApp / HomeDashboard / Brand | Home, Offers, Go Home, Position, Earnings; matching card sequence and copied publisher assets implemented. Installed Home/menu compared with iOS: fixed inherited Android text leading, metrics/card heights, provider icon corners and rounded menu. Final visual acceptance remains with Luke. |
| GettingStartedView | GettingStartedScreen / TourPlayer | Native full-screen video, default English selectable soft captions, precise chapter seeking/transcript, manifest runtime, landscape instruction and guide entry implemented. All four final assets bundled with matching source hashes;4:04/54 actions/13 chapters. Actual landscape playback and visible default English captions passed; native CC off verified. No old movie bundled. |
| TripsView / StartDriveView | RecordScreens | Drive classification/purpose, tracking start/stop, trip list/detail/edit implemented. Normal recording now requests scoped sync every15s and at End, matching iOS; active snapshots preserve newer mutation IDs and stale sessions are rejected. Physical tracking and signed-in sync remain unverified. |
| TripDetail / RideProfitDetails / RouteOptionsView | InsightsScreen TripDetail / TripRouteOptionsScreen / Driving | Actual ride profit, source/timezone details, scoped encrypted route read, damage/gap warnings, street basemap with separated segments, current alternate road routes/cost comparison, conflict actions and confirmed deletion implemented. |
| TripEditor | RecordEditor / DateFields / TripEditing | Dates, times, distance, classification, notes, ride earnings/platform/area implemented. Unchanged saves retain original seconds/nanoseconds and DST offset; edits preserve the prior valid offset and reject nonexistent spring-forward times. Native OS picker styling differs. |
| MoneyView / MoneyDetail / IncomeEditor | RecordScreens / MoneyDetailScreen / RecordEditor | Expense/income lists, real entry forms, read-only detail/review, source/conflict actions and deletion implemented. A disposable guest expense was saved, edited to Business, deleted, and the empty list observed. Final F2 verifies shared capsule Cancel/disabled Save, date pills and receipt icons. |
| ExpenseEditor / ReceiptCamera / ReceiptPreview / PDFReceiptView | RecordEditor / ReceiptScanner / DocumentPreview | Real multi-page camera capture/review/retake/remove/native PDF creation, bounded image decoding/aggregate pixel budget, first-page PDF/local OCR, stale-suggestion cancellation, attachment removal, correct MIME preview/share/resend and business details implemented. Failed processing preserves session originals; save≤5MiB. Duplicate detection uses merchant/date/currency/amount; GPS distance corrections retain source evidence. Camera/OCR device execution pending. |
| ExpenseReviewView | SpendingReviewScreen / ExpenseReview | Calendar month/year/all dates, spending/categories, actionable individual review prompts and recordkeeping guidance implemented. |
| BankConnectionView / BankReviewView / BankTransactionView | BankScreen | Native Plaid/canceled-session cleanup, reconnect/disconnect/refresh, filter-before100-row pagination, all older rows, linked-record navigation, guarded creation/matching/ignore and bank-specific editor defaults implemented. Real provider/account validation pending. |
| BankImportView | BankImport | CSV/OFX/QFX mapping, preview, issues, dedup and inbox implemented. |
| OfferInboxView / UnifiedOfferCard / GigOfferDetailView | OffersParityScreens / ParityOffers / OfferNormalization | Inbox guards/ranking, exact conservative pay bands/net/hour, labeled payout/guarantee/currency/locations/legs/reposition/wait/fees/tips/time coverage, stable platform/provider identity and preserved expiry/withdrawal implemented. Contradictory/partial OCR values stay unknown. Changed terms invalidate prior field/route review while preserving active-work reports. |
| GigOfferEditor | ManualOfferScreen | Manual fields and screenshot-correction flow implemented. |
| OfferScreenshotImportView | ScreenshotImportScreen | Explicit chosen image/on-device OCR/current-account capture integration implemented. |
| OfferScreenshotGuide / ScreenshotGuideArtwork | OfferScreenshotGuide | All six practice steps, bounded scroll plus fixed Back/Next, real reference image/provenance implemented; practice never writes a job. |
| SampleShiftView | SampleOffersScreen / SampleShift / EarningsContent | Same five sample jobs plus isolated 203-record, 30-day Earnings fixture; real chart interaction and Earnings/Offers tabs. Sample actions do not write financial journal entries. |
| OfferReaderView / OfferBroadcastPicker | OfferReaderScreen / OfferScreenService | Explicit Android MediaProjection consent/foreground service with local OCR retained. OS sharing sheet differs from ReplayKit. |
| OfferCaptureDiagnosticsView / CapturePlatformDiagnostics | OfferDiagnosticsScreen / OfferCaptureEvidence | Per-platform capture state/failure reasons, scoped ephemeral route evidence matching current reviewed fields/costs/work and freshness implemented. |
| MissionView / MissionRouteSection | MissionScreen / MissionParity / MissionRoadSection | Mission goal/deadline/progress, current work, entered-offer comparison, wait history, dead miles, inline real full-route comparison and waiting-area search against the selected destination implemented. |
| GigOfferRouteView / RoutePlaceSearch / MissionRouteMap | OfferRouteScreen / PositionPlanner / SharedRoadMap | Selected current/pickup/drop-off/final endpoints, actual four road legs, deadlines/risk/limits and incremental costs, native street basemap with pan/pinch/zoom/fit implemented. Release routing configuration is missing. |
| PositioningView / DestinationPositioningSection / WaitingAreaPlanner | PositionScreen / WaitingAreaSection / PositionPlanner | Saved historical job clusters, minimum-evidence gates, selected Geocoder results, real road comparisons, native street map and maps handoff implemented. Release routing configuration is missing. |
| ReserveAndHistoryView | ReserveHistoryScreen | Time-weighted active-hour/two-hour illustration, neighborhood history, explicit tax/vehicle percentages with combined100% cap and actual90-day gross allocations implemented. |
| UniversalGigSettingsView / GigAppCatalog / GigAppLauncher | UniversalWorkScreen / HomeDashboard / GigAppCatalog | Nineteen verified official Android package/store identities, custom work label/HTTPS URL and business-classified shopping/delivery records using that profile implemented. No simulated connection. |
| GigConnectionsView / ConnectedWorkView | ConnectedWorkScreen | Actual provider summary, scoped handoff, refresh and jobs/pay implemented. Requires signed-in configured workspace/provider. |
| InsightsView / EarningsCharts / GoalsEditor | InsightsScreen | Driving-first order; 7/30/90-day net/miles/hours interactive chart, mileage mix, efficiency, goals, cashflow/fuel/profit implemented. Screenshot/chart gestures unverified. |
| DriverAlertsView / DriverAlertRow / ForegroundNotice | AlertsScreen / notifications | Real scoped, expiring start/stop/classification/earnings actions and dismissal implemented. Device notification behavior unverified. |
| AssistanceView / StopPromptsView | AssistanceScreen / HomeDashboard | Explicit tracking/reminder controls, near-stop prompts and Android permissions/settings implemented. Physical background behavior unverified. |
| ConnectionView / ConflictActions | AccountHubScreen / AccountProfile | Discovery, client sign-in, immutable profile identity/name update, guarded same-client re-auth, sync/conflicts, independent financial/chat/reputation guest-copy consent, offline local sign-out, My Portal/settings links implemented. Live account validation pending. |
| ReferralView | ReferralScreen | Actual referral status/code/share/claim/reward redemption/history implemented; live workspace validation pending. |
| DriverPrivacyView | PrivacyScreen | Full Android data-sharing/tracking/office maps/Geocoder/offer reader/account/bank/export/reward/protected journal disclosure implemented. |
| ReputationView / ReputationEntryEditor | ReputationScreens / ProfileParity | Same19-app catalog, inherited platform filter, rating/review forms, history/trends/guidance, immutable FIFO mutations/exact ACK and explicit guest copy implemented. Live sync/visual review pending. |
| TaxCoachView / CoachMessageBubble / CoachIntakeEditor | TaxCoachScreen / ProfileParity | Actual/local sourced analysis, preserved retry outbox, chat sync/intake/milestones, explicit guest copy and keyboard-aware pinned composer implemented. |
| OfficeHelpView / OfficeHelpCard / OfficeExteriorView | OfficeHelpScreen / HomeDashboard | Actual office API, foreground/explicit refresh, native OSM tiles/markers, ZIP/current location and search point/nearest3 camera fit, photos/contact/maps/Street View handoff implemented. Apple Maps visual style differs; imagery availability is not inferred. |
| TaxWorkspaceView / TaxDocumentPreview | TaxDocumentsScreen / DocumentPreview | Tax years/engagements/requests/submissions/review dates/quarterly reviews, scoped bounded upload, validated download, native paged PDF/image preview and explicit unchanged-byte export implemented. Live signed-in validation pending. |
| SecureTaxConnectionView / SecureTaxManifest / SecureTaxDeviceKeys / SecureTaxTransportPolicy | ProtectedDataScreen / ProtectedEnrollment / ProtectedDeviceKeyStore / ProtectedTransportPolicy | Independent signed-app pins, account/device-bound P256 signed enrollment, explicit creation/public request/import/staging, OS-enforced unlocked-only key wrapping (Android9+ secure lock) and fail-closed plaintext write blocking implemented. Legacy key rewrap requires consent and retains the original under its prior protections. Trusted pin bundle is absent in both current apps; no activation implied. |
| SecureTaxSnapshotView / SecureTaxEnvelope / SecureTaxObjectClient / SecureTaxJournalSnapshot / SecureTaxSnapshotCheckpoint | ProtectedJournalScreen / ProtectedJournal / ProtectedEnvelope / ProtectedJournalService | Real HPKE Auth P256/SHA256/AES256GCM, native journal capture/upload/list/verified preview/import review/delete, immutable encrypted retries and monotonic revisions implemented. Six real CryptoKit↔Kotlin decryptions passed. Raw cross-platform JSON is preserved; typed restore is not claimed or provided by either app. |
| BrandedDialog / DriverScreen / Brand | Brand / native dialogs | Shared colors, gradients, card/form patterns and native confirmation dialogs implemented. Main-tab/form comparisons exposed and corrected real geometry differences; full139-surface comparison remains unfinished. |
| JournalExport / Home export | core JournalExport / ui JournalExport | Same29 flat CSV columns including review notes and banking metadata, formula/quote/newline-safe US formatting; explicit native save-location flow with immutable bounded account-scoped snapshot and cancellable chunked output wired to Home. |

## Google routing and verification boundary

Google Maps is now the requested default. The source includes a native Maps SDK
renderer, package-pinned Directions/Street View handoffs, and the dedicated
Bearer-driver-authenticated GET/POST `/api/website/customer/driver/routes` client.
The parent implements that backend with a dedicated driver key and explicit
owner enable flag; staff Visits authorization/keys are separate. SDK setup,
Google Play services, signed-in client and server readiness are checked before
posting endpoints. Missing setup never silently falls back to OSRM. See
[the provider contract](../../docs/ROUTING_SETUP.md).

Actual Google provisioning is absent: the Android-restricted Maps SDK key,
dedicated server key, billing/API enablement and owner enable flag are still
required. No live Google traffic or successful configured rendering is claimed.
Google roads never enter the OSM renderer. Historical GPS files stay local;
selected comparison endpoints are transiently relayed through the firm to Google.

## Verification and continuation

Integrated SDK/APK/JVM checks passed100 tests with zero failures/errors/skips,
including six actual CryptoKit/Kotlin authenticated decryptions. The final
purely visual form updates were then packaged successfully with an APK-only
build. Final artifact:99,354,018 bytes, SHA256
`6d0cd6e78fb7bd16f622b071d3c8ad333ef0959b8a58ca22c7662ddf3b0c0a0e`.
The installed Android `base.apk` SHA256 matched that artifact exactly.

The native adb/accessibility/screencap pass saved85 complete PNGs. F2/F images
are preferred by default in the local searchable gallery. Final F2 captures
show the corrected modal surfaces/capsule controls/date pills/receipt icons,
planning groups, single-screen DoorDash viewport and compact practice buttons.
The full guide previously completed its practice estimate without saving a job.
A guest expense was saved, edited and deleted in F, before the final visual
capsule update;20-01F/02F/03F record the three states and final empty-list feedback.
The validated financial save body remained unchanged. Final F2 observed Cancel
and disabled Save accessibility. Returning from sample offer details preserved
the Offers tab and scroll position in20-04F2.

Native portrait/landscape playback and visible default English soft captions
were observed in the final installed APK. CC-off feedback was observed; the
re-enable tap succeeded but no post-toggle frame was retained. Audio output was
disabled for this diagnostic guest, so narration audibility and native chapter
seeking remain target-device checks. No external gig/browser intent was tested.
The owned emulator exited0; QEMU absence and empty adb device list were confirmed.
Display/density/rotation restore commands succeeded before shutdown; no settings
readback was captured. The iPhone owner has the sole guest slot again.

[Installed proof receipt](verification/20261108-installed-review.json) records
artifact identity, counts, observed outcomes and limits. The zero-byte failed
Alerts capture remains with an `.incomplete` suffix. Source presence, successful
compilation and local observations are distinct from physical/live acceptance.

Use `./native/android/build-parity.sh` for APK/JVM checks with build outputs and
project cache on PRO-G40. Gradle8.13 and downloaded module caches have preserved
external targets under `AndroidParityBuild-20261107` with their normal paths
symlinked. The shared wrapper distribution was restored internally and all632
files verified before/after. Only the generated dependency-transform cache was
catalogued and reclaimed when the emulator disk guard blocked startup; it is
reproducible from retained downloads. Receipts are in
`/private/tmp/gigtax-android-cache-relocation.json` and
`/private/tmp/gigtax-generated-transform-reclaim.json`.
Build evidence: `/private/tmp/gigtax-android-google-final-build.log`,
`/private/tmp/gigtax-android-final-style-build.log`, and
`/private/tmp/gigtax-android-installed-final-build.log`. JVM results are under
`/Volumes/PRO-G40/AndroidParityBuild-20261107/app/test-results/testDebugUnitTest`.
No source UI changes were made after the final F2 review freeze.

Reproduce the real cross-runtime proof with current sources:

```
xcrun swiftc -parse-as-library native/ios/RideshareTaxPros/App/SecureTaxEnvelope.swift scripts/native-secure-tax-envelope-proof.swift -o /private/tmp/gigtax-protected-envelope-swift-proof
native/android/build-parity.sh :app:testDebugUnitTest --tests com.ridesharetaxpros.driver.core.ProtectedEnvelopeInteropTest
```

The interoperability test skips without that native helper; the observed run
had zero skips and six authenticated cross-runtime decryptions using synthetic
keys/data. This is protocol interoperability, not real firm enrollment/recovery.

Next: Luke/art-director review of the preferred F2/F gallery, remaining reference
surfaces and physical receipt/location/notification flows. Signed-in APIs, real
provider linking, trusted firm enrollment, route service and physical location
behavior need their own observed evidence. Luke remains the visual acceptance
judge. This document records an unfinished parity implementation, not “100%”.
