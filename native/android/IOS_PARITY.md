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
| TripDetail / RideProfitDetails | InsightsScreen TripDetail / Driving | Actual ride profit, route samples and edit implemented. iOS RouteOptionsView suggested third-party ride route options still needs a dedicated feature audit. |
| TripEditor | RecordEditor / DateFields | Dates, times, distance, classification, notes, ride earnings/platform/area implemented. Native OS picker styling differs. |
| MoneyView / MoneyDetail / IncomeEditor | RecordScreens / RecordEditor | Expense/income lists and real entry forms implemented. |
| ExpenseEditor / ReceiptCamera / ReceiptPreview / PDFReceiptView | RecordEditor | Receipt selection/camera/on-device OCR, bounded attachment, share/resend, business details implemented. PDF uses OS handoff instead of inline preview. |
| ExpenseReviewView | SpendingReviewScreen | Recorded totals/category review implemented; compare all iOS per-record review options during device pass. |
| BankConnectionView / BankReviewView / BankTransactionView | BankScreen | Native Plaid, reconnect/disconnect, refresh, record creation/matching/ignore implemented. Exact visual form separation differs; real provider readiness and account API validation pending. |
| BankImportView | BankImport | CSV/OFX/QFX mapping, preview, issues, dedup and inbox implemented. |
| OfferInboxView / UnifiedOfferCard / GigOfferDetailView | OffersParityScreens / ParityOffers | Inbox, reviewed fields, conservative pay bands/net/hour, report-only work status and confirmation guards implemented. |
| GigOfferEditor | ManualOfferScreen | Manual fields and screenshot-correction flow implemented. |
| OfferScreenshotImportView | ScreenshotImportScreen | Explicit chosen image/on-device OCR/current-account capture integration implemented. |
| OfferScreenshotGuide / ScreenshotGuideArtwork | OfferScreenshotGuide | All six practice steps, bounded scroll plus fixed Back/Next, real reference image/provenance implemented; practice never writes a job. |
| SampleShiftView | SampleOffersScreen | Same five sample jobs and estimates; sample actions do not write financial journal entries. |
| OfferReaderView / OfferBroadcastPicker | OfferReaderScreen / OfferScreenService | Explicit Android MediaProjection consent/foreground service with local OCR retained. OS sharing sheet differs from ReplayKit. |
| OfferCaptureDiagnosticsView / CapturePlatformDiagnostics | OfferDiagnosticsScreen | Per-platform capture state and real failure reasons implemented. |
| MissionView / MissionRouteSection | MissionScreen / MissionParity | Mission goal/deadline/progress, current work, entered-offer comparison, wait history, dead miles and reserves implemented. Route/waiting-area action opens Position. |
| GigOfferRouteView / RoutePlaceSearch / MissionRouteMap | OfferRouteScreen / PositionPlanner | Selected current/pickup/drop-off/final endpoints, actual four road legs, deadlines/risk/limits and incremental costs implemented. Release routing configuration is missing; route diagram lacks iOS street basemap. |
| PositioningView / DestinationPositioningSection / WaitingAreaPlanner | PositionScreen / PositionPlanner | Saved historical job clusters, minimum-evidence gates, actual Geocoder selection, real road comparisons and maps handoff implemented. Release routing configuration is missing; route diagram lacks street basemap. |
| ReserveAndHistoryView | ReserveHistoryScreen | Planning percentage and completed drive/offer history implemented. |
| UniversalGigSettingsView / GigAppCatalog / GigAppLauncher | UniversalWorkScreen / HomeDashboard | Real installed app launchers, custom work label/HTTPS URL, shopping/delivery record entry implemented. No simulated connection. |
| GigConnectionsView / ConnectedWorkView | ConnectedWorkScreen | Actual provider summary, scoped handoff, refresh and jobs/pay implemented. Requires signed-in configured workspace/provider. |
| InsightsView / EarningsCharts / GoalsEditor | InsightsScreen | Driving-first order; 7/30/90-day net/miles/hours interactive chart, mileage mix, efficiency, goals, cashflow/fuel/profit implemented. Screenshot/chart gestures unverified. |
| DriverAlertsView / DriverAlertRow / ForegroundNotice | AlertsScreen / notifications | Real scoped, expiring start/stop/classification/earnings actions and dismissal implemented. Device notification behavior unverified. |
| AssistanceView / StopPromptsView | AssistanceScreen / HomeDashboard | Explicit tracking/reminder controls, near-stop prompts and Android permissions/settings implemented. Physical background behavior unverified. |
| ConnectionView / ConflictActions | AccountHubScreen | Discovery, client sign-in, sync/conflicts, separate guest-copy consent, sign-out, account/settings links implemented. Display-name editing and same-account re-auth remain implementation gaps. |
| ReferralView | ReferralScreen | Actual referral status/code/share/claim/reward redemption/history implemented; live workspace validation pending. |
| DriverPrivacyView | PrivacyScreen | Native data-sharing/tracking/bank/reward disclosure implemented. |
| ReputationView / ReputationEntryEditor | ReputationScreens / ProfileParity | Rating/review forms, history/trends/guidance, immutable FIFO mutations/exact ACK, explicit guest copy implemented. Live sync and visual review pending. |
| TaxCoachView / CoachMessageBubble / CoachIntakeEditor | TaxCoachScreen / ProfileParity | Actual/local sourced analysis, preserved retry outbox, chat sync/intake/milestones and explicit guest copy implemented. Composer still scrolls with transcript; iOS pinned composer remains an implementation gap. |
| OfficeHelpView / OfficeHelpCard / OfficeExteriorView | OfficeHelpScreen / HomeDashboard | Actual office API, native OSM tiles/markers, ZIP/current location, photos/contact/maps/Street View handoff implemented. Apple Maps visual style differs; no street imagery availability inferred. |
| TaxWorkspaceView / TaxDocumentPreview | TaxDocumentsScreen | Tax years/engagements/requests/submissions/quarterly reviews, explicit bounded typed upload and validated download implemented. Documents open via OS handoff. Live signed-in validation pending. |
| SecureTaxConnectionView / SecureTaxManifest / SecureTaxDeviceKeys | ProtectedDataScreen / ProtectedEnrollment | Independent signed-app pins, account/device-bound P256 signed enrollment, explicit key creation/public request/import/staging implemented; no protection activation implied. Trusted pin bundle absent in both current apps. Android key custody is Keystore-wrapped private storage plus unlock guard; OS-enforced unlocked-only custody needs strengthening before protected objects. |
| SecureTaxSnapshotView / SecureTaxEnvelope / SecureTaxObjectClient / SecureTaxJournalSnapshot / SecureTaxSnapshotCheckpoint | Pending protected journal module | Implementation gap: encrypted snapshot capture/upload/list/verified preview/import review/delete. Raw cross-platform JSON must be preserved, not assumed typed-restorable across differing native journal schemas. |
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
Build evidence is `/private/tmp/gigtax-android-parity-build.log`; unit results are
`/Volumes/PRO-G40/AndroidParityBuild-20261107/app/test-results/testDebugUnitTest`.

Next: checkpoint build; finish listed independent source gaps; coordinate one
Android guest with the iOS recorder owner; install this exact APK; execute every
feature path and compare screenshots to all references. Signed-in APIs, real
provider linking, trusted firm enrollment, route service and physical location
behavior need their own observed evidence. Luke remains the visual acceptance
judge. This document records an unfinished parity implementation, not “100%”.
