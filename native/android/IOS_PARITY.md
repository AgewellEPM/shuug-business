# iOS mirror implementation and remaining evidence

Updated 2026-11-07. Reference is the current `native/ios/RideshareTaxPros/App`
source and the 139 reference PNGs in `~/Desktop/Gig Tax Pros Screens - 2026-11-07`.
The target is the same navigation, card ordering, actions, recorded state and
meaning as iOS. Android uses native Compose and Android permission/media/picker
surfaces. A compiled APK does not establish screenshot or device acceptance.

## Screen inventory

All rows still require installed Android execution and comparison against the
reference images. “Implemented” means native source is connected to navigation
and actual state/API behavior; it is not a claim that live external APIs passed.

| iOS screen/source | Android implementation | Implementation / remaining gap |
| --- | --- | --- |
| RootView / TodayView / HomeDashboardPanels / DashboardStyle | DriverApp / HomeDashboard / Brand | Home, Offers, Go Home, Position, Earnings; matching card sequence and copied publisher assets implemented. Screenshot spacing/typography comparison pending. |
| GettingStartedView | GettingStartedScreen | Native full-screen video, chapters/transcript and guide entry implemented. Replacement video belongs to concurrent tour work; no obsolete video copied into Android. |
| TripsView / StartDriveView | RecordScreens | Drive classification/purpose, tracking start/stop, trip list/detail/edit implemented. Background physical-device tracking remains unverified. |
| TripDetail / RideProfitDetails / RouteOptionsView | InsightsScreen TripDetail / TripRouteOptionsScreen / Driving | Actual ride profit, source/timezone details, scoped encrypted route read, damage/gap warnings, street basemap with separated segments, current alternate road routes/cost comparison, conflict actions and confirmed deletion implemented. |
| TripEditor | RecordEditor / DateFields | Dates, times, distance, classification, notes, ride earnings/platform/area implemented. Native OS picker styling differs. |
| MoneyView / MoneyDetail / IncomeEditor | RecordScreens / MoneyDetailScreen / RecordEditor | Expense/income lists, real entry forms, read-only detail/review, source/conflict actions and deletion implemented. |
| ExpenseEditor / ReceiptCamera / ReceiptPreview / PDFReceiptView | RecordEditor / DocumentPreview | Receipt selection/camera/on-device OCR, bounded attachment, native PDF/image preview, unchanged-byte explicit export/resend and business details implemented. Duplicate detection uses exact merchant/date/currency/amount; GPS distance corrections retain source evidence. |
| ExpenseReviewView | SpendingReviewScreen / ExpenseReview | Calendar month/year/all dates, spending/categories, actionable individual review prompts and recordkeeping guidance implemented. |
| BankConnectionView / BankReviewView / BankTransactionView | BankScreen | Native Plaid, reconnect/disconnect, refresh, record creation/matching/ignore implemented. Exact visual form separation differs; real provider readiness and account API validation pending. |
| BankImportView | BankImport | CSV/OFX/QFX mapping, preview, issues, dedup and inbox implemented. |
| OfferInboxView / UnifiedOfferCard / GigOfferDetailView | OffersParityScreens / ParityOffers | Inbox dispatch guards/ranking, reviewed fields, conservative pay bands/net/hour, explicit expiration/withdrawal, report-only work status and confirmation guards implemented. Automatic extraction of all labeled financial/route fields remains in progress; unknown fields require explicit review. |
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
| BrandedDialog / DriverScreen / Brand | Brand / native dialogs | Shared colors, gradients, card/form patterns and native confirmation dialogs implemented. Full screenshot comparison pending. |

## Road routing boundary

Existing first-party routing is `src/lib/visits/google.ts` (`optimizeRoute`) called
by staff workspace Visits server actions in `src/app/visits/actions.ts`. It uses
`GOOGLE_MAPS_SERVER_KEY`, prospect IDs and staff workspace authorization. No native
driver/customer road-route contract exists under
`src/app/api/website/customer/driver`. Android must not call staff actions or
reuse their authorization/payloads.

The native implementation accepts an HTTPS OSRM-compatible base from
`https://gigtax.pro/site-config.json` field `androidRoadRouterUrl`. Release builds
fail with an explicit unavailable state when this is absent. DEBUG builds alone
can disclose/use the OSRM demo service. Geocoder supplies explicit address
choices, not distance/time estimates. Road results are bounded, cached,
freshness-checked and bound to current account/offer/location. No straight-line
estimate or fabricated route is presented as road routing. A driver-scoped
first-party endpoint or approved routing service is a configuration/backend gap;
it has not been deployed as part of this change.

## Verification and continuation

Use `./native/android/build-parity.sh` to build the APK and run JVM tests, keeping
all build/project-cache outputs on PRO-G40. No new emulator has been launched;
the existing iPhone recording session has exclusive guest use until coordinated.
Build evidence is `/private/tmp/gigtax-android-parity-complete-build.log`; unit results are
`/Volumes/PRO-G40/AndroidParityBuild-20261107/app/test-results/testDebugUnitTest`.

The latest integrated APK/JVM pass completed75checks with zero failures/skips,
including the route/expiry/catalog/Home controls. Reproduce
the real cross-runtime proof by compiling current native sources:

```
xcrun swiftc -parse-as-library native/ios/RideshareTaxPros/App/SecureTaxEnvelope.swift scripts/native-secure-tax-envelope-proof.swift -o /private/tmp/gigtax-protected-envelope-swift-proof
native/android/build-parity.sh :app:testDebugUnitTest --tests com.ridesharetaxpros.driver.core.ProtectedEnvelopeInteropTest
```

The interoperability test skips without that native helper; the observed run
had zero skips and six authenticated cross-runtime decryptions using synthetic
keys/data. This is protocol interoperability, not real firm enrollment/recovery.

Next: complete automatic offer-field normalization; coordinate one
Android guest with the iOS recorder owner; install this exact APK; execute every
feature path and compare screenshots to all references. Signed-in APIs, real
provider linking, trusted firm enrollment, route service and physical location
behavior need their own observed evidence. Luke remains the visual acceptance
judge. This document records an unfinished parity implementation, not “100%”.
