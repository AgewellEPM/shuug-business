"""Exercise the real native UI in one owned Apple Simulator; always clean it up."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from ios_app_fingerprint import app_fingerprint, verify_installed_app

ROOT = Path(__file__).resolve().parent.parent
DERIVED = Path(os.environ.get('RIDESHARE_IOS_TEST_DERIVED', '/private/tmp/rideshare-ios-simulator-build'))
BUNDLE = 'com.ridesharetaxpros.driver'
ARTIFACTS = Path(tempfile.mkdtemp(prefix='rtp-ios-ui-'))
REPORT = ROOT / 'docs/deployments/rideshare-ios-simulator-verification-20261105.json'
parser = argparse.ArgumentParser(description=__doc__)
flows = parser.add_mutually_exclusive_group()
flows.add_argument('--driving-only', action='store_true', help='Check the driving/expense flow without claiming receipt verification.')
flows.add_argument('--receipts-only', action='store_true', help='Check receipt import and reading without repeating the driving flow.')
flows.add_argument('--expenses-only', action='store_true', help='Check meal/repair details, review totals and duplicate warnings.')
flows.add_argument('--insights-only', action='store_true', help='Check goals, fare profitability and real bank statement import.')
flows.add_argument('--mission-only', action='store_true', help='Check the native mission and offer calculation.')
flows.add_argument('--alerts-only', action='store_true', help='Check real system Start/End actions after terminating the app.')
flows.add_argument('--dashboard-only', action='store_true', help='Check dashboard navigation, sample charts and ranked sample offers without saving sample records.')
flows.add_argument('--capture-only', action='store_true', help='Check per-platform diagnostics and a chosen screenshot through the real photo picker and Vision.')
flows.add_argument('--coach-only', action='store_true', help='Check saved-job chat, confirmed intake persistence and branded confirmation cancellation.')
flows.add_argument('--foreground-only', action='store_true', help='Check the actual branded foreground alert without repeating saved-job entry.')
flows.add_argument('--gig-apps-only', action='store_true', help='Check the swipeable gig-app row, configurable shopping work and branded foreground alert.')
flows.add_argument('--reputation-only', action='store_true', help='Check manual rating/review history, guidance, shared chat routing, relaunch and explicit deletion.')
flows.add_argument('--screenshot-guide-only', action='store_true', help='Check both practice routes and real photo import, cancellation, correction and persistence without enabling screen reading.')
parser.add_argument('--visible', action='store_true', help='Show the owned iPhone Simulator window during the check.')
options = parser.parse_args()
selected_flow = next((name for name in ['driving', 'receipts', 'expenses', 'insights', 'mission', 'alerts', 'dashboard', 'capture', 'coach', 'foreground', 'gig_apps', 'reputation', 'screenshot_guide'] if getattr(options, name + '_only')), None)
driving = selected_flow in (None, 'driving')
receipts = selected_flow in (None, 'receipts')
expense_details = selected_flow in (None, 'expenses')
insights = options.insights_only
if options.driving_only:
    REPORT = REPORT.with_name('rideshare-ios-simulator-driving-verification-20261105.json')
elif options.receipts_only:
    REPORT = REPORT.with_name('rideshare-ios-simulator-receipts-verification-20261105.json')
elif options.expenses_only:
    REPORT = REPORT.with_name('rideshare-ios-simulator-expenses-verification-20261105.json')
elif options.insights_only:
    REPORT = REPORT.with_name('rideshare-ios-simulator-insights-verification-20261105.json')
elif options.mission_only:
    REPORT = REPORT.with_name('rideshare-ios-simulator-mission-verification-20261106.json')
elif options.alerts_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-notification-verification-20261106.json')
elif options.dashboard_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-dashboard-verification-20261107.json')
elif options.capture_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-capture-diagnostics-verification-20261107.json')
elif options.coach_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-coach-popups-verification-20261107.json')
elif options.foreground_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-foreground-verification-20261107.json')
elif options.gig_apps_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-gig-apps-verification-20261107.json')
elif options.reputation_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-reputation-verification-20261107.json')
elif options.screenshot_guide_only:
    REPORT = REPORT.with_name('gig-tax-pros-ios-screenshot-guide-verification-20261107.json')

def call(*args, timeout=60, check=True):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f'{args[0]} failed')
    return result

def devices():
    return json.loads(call('xcrun', 'simctl', 'list', 'devices', '--json').stdout)['devices']

def owned_state(identifier):
    return next((d['state'] for rows in devices().values() for d in rows if d['udid'] == identifier), None)

def stopped(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)

def owned_step(args, name, timeout=240):
    """Wait for one owned SDK operation, retaining its log and process handle."""
    with (ARTIFACTS/(name+'.log')).open('w') as output:
        process = subprocess.Popen(args, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + timeout
            next_update = time.monotonic() + 20
            while process.poll() is None:
                now = time.monotonic()
                if now > deadline:
                    raise RuntimeError(name+' exceeded its diagnostic window; inspect its log.')
                if now >= next_update:
                    print('Waiting for owned Simulator '+name+'.', flush=True)
                    next_update = now + 20
                time.sleep(1)
            assert process.returncode == 0, name+' failed; inspect its log.'
        finally:
            stopped(process)

def interrupted(signum, frame):
    raise KeyboardInterrupt('Native UI check interrupted.')

signal.signal(signal.SIGTERM, interrupted)
print(f'Native UI proof artifacts: {ARTIFACTS}', flush=True)
simulator = None
test = boot = None
success = False
report = {'ok': False, 'scope': 'Apple iPhone Simulator with ' + ' and '.join(name for enabled, name in [(driving, 'synthetic GPS'), (receipts, 'receipt fixture'), (expense_details, 'meal/repair records')] if enabled), 'physicalIPhoneVerified': False, 'cameraVerified': False, 'receiptPhotoImportVerified': False, 'cloudSyncVerified': False}
stage = 'preflight'
try:
    app = DERIVED / 'Build/Products/Debug-iphonesimulator/RideshareTaxPros.app'
    assert app.exists(), 'Build the Simulator app and UI test runner first.'
    signature = call('codesign', '-dv', str(app)).stderr
    assert 'Identifier='+BUNDLE in signature and 'linker-signed' not in signature, 'Use the normal locally signed Simulator build; an unsigned app cannot exercise Keychain correctly.'
    app_hash = hashlib.sha256((app/'RideshareTaxPros').read_bytes()).hexdigest()
    _, bundle_hash = app_fingerprint(app)
    running = call('pgrep', '-fl', 'qemu-system|VirtualBoxVM|vmware-vmx|prl_vm_app|IsolatedTester.app/Contents/MacOS/IsolatedTester', check=False)
    assert running.returncode == 1, 'Existing VM/isolated process found; refusing another guest: ' + running.stdout
    assert not any(d['state'] in ('Booted', 'Booting', 'Shutting Down') for rows in devices().values() for d in rows), 'An existing Simulator session is active; refusing a duplicate.'
    simulator = call('xcrun', 'simctl', 'create', 'RTP Driver Functional Check', 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro', 'com.apple.CoreSimulator.SimRuntime.iOS-26-0').stdout.strip()
    (ARTIFACTS/'owned-session.json').write_text(json.dumps({'simulator': simulator, 'bundle': BUNDLE, 'createdBy': 'verify-rideshare-ios-ui.py'}))
    stage = 'boot'
    call('xcrun', 'simctl', 'boot', simulator)
    with (ARTIFACTS/'boot.log').open('w') as output:
        boot = subprocess.Popen(['xcrun', 'simctl', 'bootstatus', simulator, '-b'], stdout=output, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 240
        while boot.poll() is None:
            if time.monotonic() > deadline:
                raise RuntimeError('The owned Simulator did not finish booting within the diagnostic window.')
            time.sleep(1)
        assert boot.returncode == 0, 'Owned Simulator boot failed; inspect boot.log.'
    if options.visible:
        call('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', simulator)
    print('Owned Simulator booted; installing the app.', flush=True)
    stage = 'installation'
    call('xcrun', 'simctl', 'install', simulator, str(app))
    def seed_statement(container):
        documents = container/'Documents'
        documents.mkdir(parents=True, exist_ok=True)
        day = time.strftime('%Y%m%d')
        (documents/'RTPBankFixture.ofx').write_text('<OFX><CURDEF>USD<BANKTRANLIST>'
            '<STMTTRN><DTPOSTED>'+day+'<TRNAMT>-17.35<FITID>fixture-fuel<NAME>Fixture Shell</STMTTRN>'
            '<STMTTRN><DTPOSTED>'+day+'<TRNAMT>-24.50<FITID>fixture-meal<NAME>Fixture Cafe</STMTTRN></BANKTRANLIST></OFX>')
    if insights:
        seed_statement(Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data').stdout.strip()))
    call('xcrun', 'simctl', 'privacy', simulator, 'grant', 'location-always', BUNDLE)
    if receipts or options.dashboard_only or options.capture_only or options.screenshot_guide_only:
        offer_fixture = options.dashboard_only or options.capture_only or options.screenshot_guide_only
        receipt = ARTIFACTS/('offer-fixture.png' if offer_fixture else 'receipt-fixture.png')
        generator = 'generate-gig-offer-fixture.swift' if offer_fixture else 'generate-rideshare-receipt-fixture.swift'
        call('swift', str(ROOT/'scripts'/generator), str(receipt))
        # The first photo-library creation can outlast a normal simctl operation.
        # Launch its system app first and observe one bounded import, without retries.
        stage = 'photo-library'
        owned_step(['xcrun', 'simctl', 'launch', simulator, 'com.apple.mobileslideshow'], 'photos-startup')
        owned_step(['xcrun', 'simctl', 'addmedia', simulator, str(receipt)], 'photo-import')
        call('xcrun', 'simctl', 'terminate', simulator, 'com.apple.mobileslideshow', check=False)
        print('Image fixture imported; starting native app flows.', flush=True)
    stage = 'native-ui-tests'
    call('xcrun', 'simctl', 'location', simulator, 'set', '40.0000,-73.9000')
    result_bundle = ARTIFACTS/'DriverFlows.xcresult'
    with (ARTIFACTS/'ui-test.log').open('w') as output:
        selection = 'RideshareTaxProsUITests'
        if options.driving_only: selection += '/DriverFlows/test01DriveExpenseAndRelaunch'
        if options.receipts_only: selection += '/DriverFlows/test02PhotoReceiptAndOnDeviceRecognition'
        if options.expenses_only: selection += '/DriverFlows/test03MealRepairDetailsAndDuplicateReview'
        if options.insights_only: selection += '/DriverFlows/test04InsightsAndBankImport'
        if options.mission_only: selection += '/DriverFlows/test05MissionAndOffer'
        if options.alerts_only: selection += '/DriverFlows/test06ColdStartTripNotificationActions'
        if options.dashboard_only: selection += '/DriverFlows/test07ModernDashboardAndExistingTools'
        if options.capture_only: selection += '/DriverFlows/test10CaptureDiagnosticsKeepsPlatformsSeparate'
        if options.coach_only: selection += '/DriverFlows/test12CoachUsesSavedJobsAndKeepsConfirmedIntake'
        if options.foreground_only: selection += '/DriverFlows/test13ForegroundAlertUsesBrandedCard'
        if options.gig_apps_only: selection += '/DriverFlows/test14GigAppsSwipeAndShoppingProfilePersists'
        if options.reputation_only: selection += '/DriverFlows/test15RatingsReviewsGuideAndDeletionPersist'
        if options.screenshot_guide_only: selection += '/ScreenshotGuideFlows'
        if selected_flow is None:
            selection = 'RideshareTaxProsUITests/DriverFlows'
        test_selection = ['-only-testing:'+selection]
        if options.alerts_only: test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/test07ModernDashboardAndExistingTools']
        elif not options.dashboard_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test07ModernDashboardAndExistingTools']
        if options.dashboard_only:
            test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/'+name for name in ['test08SampleChartsAndRankedOffers', 'test09ReportedJobSurvivesRelaunchAndCompletes', 'test10CaptureDiagnosticsKeepsPlatformsSeparate', 'test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics']]
        elif options.capture_only:
            test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics']
        else:
            test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/'+name for name in ['test08SampleChartsAndRankedOffers', 'test09ReportedJobSurvivesRelaunchAndCompletes', 'test10CaptureDiagnosticsKeepsPlatformsSeparate', 'test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics']]
        if not insights: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test04InsightsAndBankImport']
        if not options.mission_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test05MissionAndOffer']
        if not options.alerts_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test06ColdStartTripNotificationActions']
        if not options.coach_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test12CoachUsesSavedJobsAndKeepsConfirmedIntake']
        if options.coach_only or options.gig_apps_only: test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/test13ForegroundAlertUsesBrandedCard']
        elif options.foreground_only: pass
        else: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test13ForegroundAlertUsesBrandedCard']
        if not options.gig_apps_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test14GigAppsSwipeAndShoppingProfilePersists']
        if not options.reputation_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test15RatingsReviewsGuideAndDeletionPersist']
        test = subprocess.Popen(['xcodebuild', '-project', str(ROOT/'native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj'), '-scheme', 'RideshareTaxPros', '-destination', 'id='+simulator, '-derivedDataPath', str(DERIVED), '-resultBundlePath', str(result_bundle), '-parallel-testing-enabled', 'NO'] + test_selection + ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test-without-building'], stdout=output, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 600
        last_fix = last_update = last_container_check = 0.0
        fixes = 0
        journal_path = None
        while test.poll() is None:
            now = time.monotonic()
            if now > deadline:
                raise RuntimeError('The owned UI test exceeded its diagnostic window; inspect ui-test.log.')
            if (driving or insights) and (journal_path is None or not journal_path.exists()) and now-last_container_check >= 3:
                # XCTest may reinstall the app and replace its data container.
                # Resolve the currently installed app, never a cached pre-test path.
                try:
                    current = call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data', check=False, timeout=15)
                except subprocess.TimeoutExpired:
                    # XCTest's initial app installation temporarily holds the
                    # container service. Keep the bounded test running and
                    # resolve its new container on the next observation.
                    current = None
                if current and current.returncode == 0:
                    container = Path(current.stdout.strip())
                    if insights: seed_statement(container)
                    journal_path = next(container.rglob('journal.json'), None)
                last_container_check = now
            if journal_path and journal_path.exists():
                try:
                    journal = json.loads(journal_path.read_text())
                    if driving and journal.get('activeTripId') and now-last_fix >= 2 and fixes < 60:
                        latitude = 40 + fixes*0.0005
                        call('xcrun', 'simctl', 'location', simulator, 'set', f'{latitude:.6f},-73.900000', timeout=15)
                        last_fix = now
                        fixes += 1
                except (FileNotFoundError, json.JSONDecodeError):
                    pass
            if now-last_update > 20:
                print(f'Native UI test running; {fixes} synthetic GPS fixes delivered.' if driving else 'Native UI test running through the selected flow.', flush=True)
                last_update = now
            time.sleep(1)
        assert test.returncode == 0, 'Native UI tests failed; inspect ' + str(ARTIFACTS/'ui-test.log')
    installed = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'app').stdout.strip())
    assert verify_installed_app(app, installed) == bundle_hash, 'The exercised bundle changed during verification.'
    report['appExecutableSHA256'] = app_hash
    report['appBundleSHA256'] = bundle_hash
    container = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data').stdout.strip())
    journal_path = next(container.rglob('journal.json'), None)
    if not options.dashboard_only:
        assert journal_path and journal_path.exists(), 'The actual app did not save a journal.'
    journal = json.loads(journal_path.read_text()) if journal_path and journal_path.exists() else {'entries': []}
    records = [entry['record'] for entry in journal['entries'] if not entry['record']['deleted']]
    trips = [r for r in records if r['kind']=='trip']
    expenses = [r for r in records if r['kind']=='expense']
    verified_tests = []
    if options.screenshot_guide_only:
        offers = journal.get('gigOffers', [])
        assert not records and len(offers) == 1, 'Practice and cancelled imports must not save offers or financial records.'
        offer = offers[0]
        assert offer['source'] == 'sharedScreenshot' and offer['platform'] == 'DoorDash'
        assert offer['payoutCents'] == 2050 and offer['guaranteedPayoutCents'] == 2050 and offer['additionalCostsCents'] == 0
        assert offer['uncertainty']['totalMiles'] == {'lower': 10, 'upper': 10} and offer['estimatedMinutes'] == 30
        assert journal['goals']['vehicleCostCentsPerMile'] == 50 and journal['goals']['targetHourlyCents'] == 2000
        group = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'group.com.ridesharetaxpros.driver').stdout.strip())
        assert not (group/'OfferReader/session.json').exists(), 'Direct import must not enable the screen reader.'
        captures = [json.loads(p.read_text()) for p in (group/'OfferReader').glob('*.json') if p.stem not in ('status', 'session')]
        assert len(captures) == 1 and captures[0]['reviewedInApp'] is True
        assert captures[0]['normalized']['payoutCents'] == 1950 and captures[0]['normalized']['offerId'] == offer['offerId'], 'Original OCR and driver correction must remain separate and linked.'
        assert captures[0]['scope'] == 'guest' and captures[0]['normalized']['pickupMiles'] == 2 and captures[0]['normalized']['deliveryMiles'] == 4
        assert not list((group/'OfferReader').glob('*.png')) and not journal.get('receipts')
        verified_tests += ['interactive Face ID and Home button practice', 'save-picture and both import route lessons', 'editable practice pay recalculates $15 profit to $1 loss', 'guide opens the actual screenshot picker route', 'practice and cancellation create no offers', 'real Photos picker and on-device Vision extract synthetic $19.50 offer', 'reviewed $20.50 correction and $15.50 profit survive relaunch', 'original extracted fields stay separate from corrections', 'direct import creates no broadcast session or financial entry']
        report.update(scope='Native iPhone Simulator screenshot tutorial and real chosen-image import with synthetic offer; Photos sharing lesson is simulated', offerScreenshotImportVerified=True, sampleJournalIsolationVerified=True, physicalShareExtensionVerified=False)
    if options.reputation_only:
        reputation = journal.get('reputationState', {})
        assert not records and sorted(row['score'] for row in reputation['ratings']) == [4.6, 4.8]
        assert sorted((row['score'], row['reviewCount']) for row in reputation['ratings']) == [(4.6, 100), (4.8, 105)], 'Each saved score must retain its entered review count.'
        assert all(row['platformID'] == 'lyft-driver' and row['scale'] == 5 and not row['deleted'] for row in reputation['ratings'])
        assert len(reputation['reviews']) == 1 and reputation['reviews'][0]['deleted'] is True
        review = reputation['reviews'][0]
        assert review['text'] == 'Customer requested clearer arrival updates.', 'The exact entered review text must survive deletion and relaunch.'
        assert review['sentiment'] == 'negative' and review['topics'] == ['communication']
        outbox = journal['reputationOutbox']
        assert [change['action'] for change in outbox] == ['addRating', 'addRating', 'addReview', 'deleteReview'], 'Offline changes must retain add-before-delete order and operation types.'
        assert len({change['mutationId'] for change in outbox}) == 4, 'Each persisted operation needs its own retry identity.'
        assert len({row['id'] for row in reputation['ratings']}) == 2
        assert [change['rating'] for change in outbox[:2]] == reputation['ratings'], 'Queued rating IDs and payloads must match both saved snapshots.'
        assert all(change.get('review') is None and change.get('id') is None for change in outbox[:2])
        assert outbox[2]['review'] == dict(review, deleted=False), 'The queued review add must preserve the original body and the tombstone ID.'
        assert outbox[2].get('rating') is None and outbox[2].get('id') is None
        assert outbox[3]['id'] == review['id'] and outbox[3].get('rating') is None and outbox[3].get('review') is None, 'The queued delete must target only the saved review.'
        assert len(journal.get('coachMessages', [])) == 2 and 'Lyft Driver' in journal['coachMessages'][-1]['text']
        verified_tests += ['actual native rating forms persist two same-platform star snapshots and review counts', 'review text plus user-selected negative tone and communication tag persist', 'guidance cites the saved app and tagged review topic', 'unified conversation answers rating questions using saved reputation history', 'ratings and conversations survive app relaunch', 'explicit branded deletion persists review tombstone while retaining ratings and offline sync operations']
        report['scope'] = 'Native iPhone Simulator manual ratings/reviews, guidance and offline retry queue; no live provider import or public cloud sync'
    if options.gig_apps_only:
        assert len(trips) == 1 and not expenses, 'Only the explicitly entered shopping job should be recorded.'
        job = trips[0]['body']
        assert job['rideRole'] == 'shopping' and job['distanceMeters'] == 0 and job['earningsCents'] == 1800 and job['platformFeesCents'] == 200
        assert job['platform'] == 'Local shopper' and job['source'] == 'manual' and not journal.get('activeTripId')
        assert journal['universalGigSettings']['shopping'] == {'workLabel': 'Local shopper', 'appURL': 'https://www.instacart.com/shopper'}
        verified_tests += ['horizontal gig-app row reaches universal delivery and in-store shopping configuration', 'custom shopping profile and public app link persist across app relaunch', 'explicit shopping job records zero driving miles and actual entered earnings/fees without starting GPS', 'branded foreground trip notification displays after permission grant and dismisses on the same page']
        report['scope'] = 'Native iPhone Simulator gig-app row and configurable in-store work; third-party app launching requires a physical iPhone'
        report['thirdPartyAppLaunchVerified'] = False
    if options.foreground_only:
        assert not records, 'Displaying and dismissing a foreground notice must not create financial records.'
        assert len(journal.get('driverAlerts', [])) == 1, 'The actual trip prompt was not persisted.'
        verified_tests += ['actual foreground trip notification displays the branded in-app card', 'notice dismisses without navigating or creating financial records']
        report['scope'] = 'Native iPhone Simulator foreground notification after first permission grant'
    if options.coach_only:
        assert len(trips) == 2 and not expenses, 'Coach or canceled deletion changed the saved financial records.'
        messages = journal.get('coachMessages', [])
        assert len(messages) == 4 and len(journal.get('coachOutbox', [])) == 2, 'Offline chat did not preserve both questions and local replies.'
        assert any(row['role'] == 'assistant' and 'Coach loss job' in row['text'] and '3.00' in row['text'] for row in messages)
        assert any(row['role'] == 'assistant' and 'Coach best job' in row['text'] and '12.00' in row['text'] for row in messages)
        assert journal['coachIntake'] == {'taxYear': 2026, 'jurisdiction': 'New York', 'businessType': 'unsure'}
        assert journal.get('coachIntakeMutationId'), 'Explicit tax details should remain queued until a workspace acknowledges them.'
        verified_tests += ['actual native manual jobs and vehicle-cost form feed chat', 'loss and highest-net answers reference saved jobs', 'questions and local answers survive app relaunch', 'confirmed tax context survives app relaunch and remains queued offline', 'branded deletion dialog displays and cancellation preserves the trip', 'actual foreground notification displays branded in-app card and dismisses without navigating']
        report['scope'] = 'Native iPhone Simulator saved-job chat and branded app dialogs; synthetic records, offline account'
    if driving:
        assert len(trips)==1 and trips[0]['body'].get('endedAt') and trips[0]['body']['distanceMeters']>50 and not journal.get('activeTripId'), 'The app did not persist the completed simulated drive.'
        assert any(r['body']['merchant']=='Native UI fuel' and r['body']['amountCents']==1735 for r in expenses), 'The actual expense entry/relaunch path failed.'
        verified_tests += ['native Start/End drive with Core Location simulation', 'background/foreground UI lifecycle', 'expense entry through the actual form', 'saved records after app termination/relaunch', 'actual app-container journal persistence']
        report.update(injectedGPSFixes=fixes, recordedDistanceMeters=trips[0]['body']['distanceMeters'])
    if receipts:
        captured = next((r for r in expenses if r['body']['merchant']=='Native UI receipt'), None)
        assert captured and captured['body']['amountCents']==1735 and captured['body'].get('receiptId'), 'Photo capture and reviewed native OCR did not persist the expected expense.'
        assert len(journal['receipts'])==1, 'The actual app did not retain its private receipt.'
        verified_tests += ['system photo picker receipt import', 'on-device Vision recognition with explicit amount review', 'private receipt view and persistence']
        report['receiptPhotoImportVerified'] = True
    if expense_details:
        meal = next((r['body'] for r in expenses if r['body']['merchant']=='Native UI meal'), None)
        repairs = [r['body'] for r in expenses if r['body']['merchant']=='Native UI garage']
        assert meal and meal['amountCents']==2450 and meal['category']=='meals' and meal['classification']=='business' and meal['businessPurpose']=='Driver business meeting' and meal['mealContext']=='Driver and bookkeeper', 'Meal business details did not survive the actual UI save/relaunch.'
        assert len(repairs)==1, 'The duplicate warning allowed an unconfirmed extra payment.'
        repair = repairs[0]
        assert repair['amountCents']==24567 and repair['category']=='repairs' and repair['businessUsePercent']==75 and repair['vehicle']=='Driver car' and repair['odometerMiles']==12345.6 and repair['businessPurpose']=='Brake repair', 'Vehicle repair details did not survive the actual UI save/relaunch.'
        verified_tests += ['business meal purpose and participants saved through the actual form', 'repair vehicle, odometer and business-use details persist after relaunch', 'spending review displays meal and repair categories', 'similar-payment warning prevents an unconfirmed duplicate']
    if insights:
        ride = next(r['body'] for r in trips if r['body']['purpose']=='Profit UI ride')
        assert ride['earningsCents']==2000 and ride['platformFeesCents']==300 and ride['rideRole']=='ride' and ride['classification']=='business'
        assert abs(ride['distanceMeters']-16093.44)<1 and ride['workArea']=='Fixture downtown'
        assert journal['goals']=={'dailyNetCents':10000, 'weeklyNetCents':50000, 'targetHourlyCents':2500, 'vehicleCostCentsPerMile':50}
        assert len(journal['bankTransactions'])==2
        imported = next(r['body'] for r in expenses if r['body']['merchant']=='Fixture Shell')
        assert imported['amountCents']==1735 and imported['category']=='fuel' and imported['bankReference']['provider']=='statement'
        assert sum(1 for r in journal['bankTransactions'] if r.get('reviewedRecordId'))==1
        verified_tests += ['goal forms persist exact cents', 'trip fare/fee/area input produces $12 estimated net from 10 miles at $0.50/mile', 'goal progress displays the recorded estimate', 'system document picker imports OFX into review inbox', 'bank review prefills and saves an expense with original source reference', 'journal and inbox preserve links after relaunch']
        report['scope'] = 'Native iPhone Simulator goals/profit and OFX import; synthetic financial records'
    if options.mission_only:
        assert journal['mission']['targetCents'] == 10000 and journal['mission']['destination'] == 'Home', 'Mission did not survive app relaunch.'
        assert journal['goals']['targetHourlyCents'] == 2500 and journal['goals']['vehicleCostCentsPerMile'] == 50
        verified_tests += ['mission saved and restored after app relaunch', 'manual offer shows $12 estimated net from $20 payout, $3 fees, 10 miles at $0.50/mile', 'hourly target and vehicle cost persist']
        report['scope'] = 'Native iPhone Simulator mission and manually entered offer; synthetic data'
    if options.alerts_only:
        assert len(trips)==1 and trips[0]['body'].get('endedAt') and not journal.get('activeTripId'), 'System alert buttons did not persist one completed trip.'
        handled = [row for row in journal.get('driverAlerts', []) if row.get('handledAt')]
        assert any(row['kind']=='startTrip' for row in handled) and any(row['kind']=='endTrip' for row in handled)
        verified_tests += ['expanded system notification loads the Gig Tax Pros brand card', 'actual system Start trip action after app termination', 'actual system End trip action after app termination', 'actions preserve background UI state', 'completed trip and handled-action IDs persisted in app journal']
        verified_tests += ['Home top shortcuts open Trips, expense entry, income entry and Alerts', 'bottom navigation and existing home tools remain accessible after the inner-page spacing change']
        report['scope'] = 'Actual iPhone Simulator system notification actions and cold background launches; physical location and cross-app screen sharing unverified'
    if options.dashboard_only:
        assert not journal['entries'] and not journal.get('missionOffers'), 'Exploring offers created financial records in the real journal.'
        offers = journal.get('gigOffers', [])
        manual = [o for o in offers if o['source'] == 'manual']
        captured = [o for o in offers if o['source'] == 'sharedScreenshot']
        assert len(offers) == 2 and len(manual) == 1 and manual[0]['payoutCents'] == 3000, 'Only the manually entered test job and chosen-image capture should be saved; sample offers must remain separate.'
        assert len(captured) == 1 and captured[0]['platform'] == 'DoorDash' and captured[0]['payoutCents'] == 1950 and captured[0]['pickupMiles'] == 2 and captured[0]['deliveryMiles'] == 4, 'The actual photo-picker → Vision → per-platform diagnostics path did not preserve the fixture values.'
        work = journal.get('gigCommitments', [])
        assert len(work) == 1 and work[0]['offerId'] == manual[0]['offerId'] and work[0]['state'] == 'completed', 'Reported work did not survive relaunch and completion.'
        assert {d['choice'] for d in journal.get('gigDecisions', [])} == {'acceptedInProvider', 'completed'}
        verified_tests += ['modern Home/Offers/Go Home/Position/Earnings navigation', 'existing Trips/Money/Account open through the home menu', 'sample earnings chart renders in the installed app', 'sample Uber and DoorDash offers appear in calculated rank order', 'sample offer detail explains destination compatibility', 'sample records and offers stay out of the actual journal', 'sample mode closes and stays closed after app relaunch']
        report.update(scope='Native iPhone Simulator dashboard and explicitly simulated shift; no live marketplace data', sampleJournalIsolationVerified=True)
        verified_tests += ['manually entered offer persists', 'driver-reported accepted job survives app relaunch', 'completion clears active work and survives relaunch without booking estimated earnings']
        report['offerScreenshotImportVerified'] = True
        verified_tests += ['all five platforms expose independent connection/detection/recommendation diagnostics', 'manual and sample offers do not count as captures', 'real system photo picker and Apple Vision extract a synthetic DoorDash offer', 'captured payout and miles appear in platform diagnostics and survive relaunch', 'DoorDash capture does not establish Uber capture or trustworthy advice']
    if options.capture_only:
        offers = journal.get('gigOffers', [])
        assert not journal['entries'] and len(offers) == 1 and offers[0]['source'] == 'sharedScreenshot', 'The diagnostics check must save only the chosen screenshot observation.'
        captured = offers[0]
        assert captured['platform'] == 'DoorDash' and captured['payoutCents'] == 1950 and captured['pickupMiles'] == 2 and captured['deliveryMiles'] == 4, 'The actual photo-picker → Vision → diagnostic-fields path did not preserve the fixture values.'
        report.update(scope='Native iPhone Simulator per-platform offer diagnostics with one synthetic chosen screenshot', offerScreenshotImportVerified=True)
        verified_tests += ['all five platforms expose separate connection, detection and recommendation status', 'manual and sample data cannot establish detection', 'system photo picker and on-device Vision recover the synthetic DoorDash payout and miles', 'extracted values appear in diagnostics and persist after relaunch', 'DoorDash detection does not establish Uber detection or complete recommendation evidence']
    report.update(ok=True, tests=verified_tests, artifactDirectory=str(ARTIFACTS), resultBundle=str(result_bundle))
    success = True
except BaseException as error:
    report.update(failedStage=stage, failure=str(error))
    if simulator:
        try:
            current = call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data', check=False, timeout=15)
        except subprocess.TimeoutExpired:
            current = None
        if current and current.returncode == 0:
            journals = list(Path(current.stdout.strip()).rglob('journal.json'))
            report['savedJournalCount'] = len(journals)
            for index, path in enumerate(journals):
                (ARTIFACTS/f'failed-app-journal-{index}.json').write_bytes(path.read_bytes())
    raise
finally:
    stopped(test)
    stopped(boot)
    if simulator:
        call('xcrun', 'simctl', 'shutdown', simulator, timeout=45, check=False)
        state = owned_state(simulator)
        assert state == 'Shutdown', 'Owned Simulator shutdown could not be verified; session retained for recovery: ' + simulator
        report['ownedSimulatorShutdownVerified'] = True
        call('xcrun', 'simctl', 'delete', simulator)
        assert owned_state(simulator) is None, 'Owned Simulator deletion could not be verified.'
        report['ownedSimulatorDeleted'] = True
    report['verifiedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (ARTIFACTS/'verification.json').write_text(json.dumps(report, indent=2)+'\n')
    if success:
        REPORT.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2), flush=True)
