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
parser.add_argument('--visible', action='store_true', help='Show the owned iPhone Simulator window during the check.')
options = parser.parse_args()
driving = not (options.receipts_only or options.expenses_only or options.insights_only or options.mission_only or options.alerts_only or options.dashboard_only)
receipts = not (options.driving_only or options.expenses_only or options.insights_only or options.mission_only or options.alerts_only or options.dashboard_only)
expense_details = not (options.driving_only or options.receipts_only or options.insights_only or options.mission_only or options.alerts_only or options.dashboard_only)
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
    if receipts or options.dashboard_only:
        receipt = ARTIFACTS/('offer-fixture.png' if options.dashboard_only else 'receipt-fixture.png')
        generator = 'generate-gig-offer-fixture.swift' if options.dashboard_only else 'generate-rideshare-receipt-fixture.swift'
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
        if not insights and not (options.driving_only or options.receipts_only or options.expenses_only or options.mission_only or options.alerts_only or options.dashboard_only):
            selection = 'RideshareTaxProsUITests/DriverFlows'
        test_selection = ['-only-testing:'+selection]
        if options.alerts_only: test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/test07ModernDashboardAndExistingTools']
        elif not options.dashboard_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test07ModernDashboardAndExistingTools']
        if options.dashboard_only:
            test_selection += ['-only-testing:RideshareTaxProsUITests/DriverFlows/'+name for name in ['test08SampleChartsAndRankedOffers', 'test09ReportedJobSurvivesRelaunchAndCompletes', 'test10CaptureDiagnosticsKeepsPlatformsSeparate', 'test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics']]
        else:
            test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/'+name for name in ['test08SampleChartsAndRankedOffers', 'test09ReportedJobSurvivesRelaunchAndCompletes', 'test10CaptureDiagnosticsKeepsPlatformsSeparate', 'test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics']]
        if not insights: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test04InsightsAndBankImport']
        if not options.mission_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test05MissionAndOffer']
        if not options.alerts_only: test_selection += ['-skip-testing:RideshareTaxProsUITests/DriverFlows/test06ColdStartTripNotificationActions']
        test = subprocess.Popen(['xcodebuild', '-quiet', '-project', str(ROOT/'native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj'), '-scheme', 'RideshareTaxPros', '-destination', 'id='+simulator, '-derivedDataPath', str(DERIVED), '-resultBundlePath', str(result_bundle), '-parallel-testing-enabled', 'NO'] + test_selection + ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test-without-building'], stdout=output, stderr=subprocess.STDOUT)
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
    assert hashlib.sha256((installed/'RideshareTaxPros').read_bytes()).hexdigest() == app_hash, 'The exercised app differs from the compiled app.'
    report['appExecutableSHA256'] = app_hash
    container = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data').stdout.strip())
    journal_path = next(container.rglob('journal.json'), None)
    if not options.dashboard_only:
        assert journal_path and journal_path.exists(), 'The actual app did not save a journal.'
    journal = json.loads(journal_path.read_text()) if journal_path and journal_path.exists() else {'entries': []}
    records = [entry['record'] for entry in journal['entries'] if not entry['record']['deleted']]
    trips = [r for r in records if r['kind']=='trip']
    expenses = [r for r in records if r['kind']=='expense']
    verified_tests = []
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
        verified_tests += ['actual system Start trip action after app termination', 'actual system End trip action after app termination', 'actions preserve background UI state', 'completed trip and handled-action IDs persisted in app journal', 'modern Home/Offers/Go Home/Position/Earnings navigation', 'existing Trips/Money/Account open through the home menu']
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
