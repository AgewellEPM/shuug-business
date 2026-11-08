"""Record the real iPhone app in one fresh guest Simulator; preserve footage and clean up the device."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from ios_app_fingerprint import app_fingerprint, verify_installed_app

ROOT = Path(__file__).resolve().parent.parent
DERIVED = Path(os.environ.get('RIDESHARE_IOS_TEST_DERIVED', '/private/tmp/gigtax-telemetry-ios-build'))
OUT = Path(os.environ['RIDESHARE_TOUR_DIR'])
OUT.mkdir(parents=True, exist_ok=False)
BUNDLE = 'com.ridesharetaxpros.driver'
app = DERIVED/'Build/Products/Debug-iphonesimulator/RideshareTaxPros.app'
simulator = None
test = recorder = None
report = {'ok': False, 'scope': 'Actual native iPhone Simulator guest app recording', 'financialRecordsCreated': False, 'physicalIPhone': False}

def call(*args, timeout=60, check=True):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def devices():
    return [d for group in json.loads(call('xcrun', 'simctl', 'list', 'devices', '--json').stdout)['devices'].values() for d in group]

def wait_owned(process, seconds, label):
    deadline, next_update = time.monotonic()+seconds, 0
    while process.poll() is None:
        if time.monotonic() > deadline: raise RuntimeError(label+' timed out')
        if time.monotonic() > next_update:
            print(label+'…', flush=True); next_update = time.monotonic()+20
        time.sleep(1)
    if process.returncode: raise RuntimeError(label+' failed; inspect the retained log')

def stop(process, sig=signal.SIGTERM):
    if process and process.poll() is None:
        process.send_signal(sig)
        try: process.wait(timeout=30)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=15)

def interrupted(signum, frame): raise KeyboardInterrupt('Tour recording interrupted')
signal.signal(signal.SIGTERM, interrupted)
try:
    assert app.exists()
    assert not any(d['state'] in ('Booted', 'Booting', 'Shutting Down') for d in devices()), 'Another Simulator is active.'
    assert call('pgrep', '-fl', 'qemu-system|VirtualBoxVM|vmware-vmx|prl_vm_app|IsolatedTester.app/Contents/MacOS/IsolatedTester', check=False).returncode == 1, 'Another guest is active.'
    simulator = call('xcrun', 'simctl', 'create', 'Gig Tax Pros Tour Recording', 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro', 'com.apple.CoreSimulator.SimRuntime.iOS-26-0').stdout.strip()
    (OUT/'owned-session.json').write_text(json.dumps({'simulator': simulator, 'createdBy': 'record-rideshare-tour.py'}))
    call('xcrun', 'simctl', 'boot', simulator)
    with (OUT/'boot.log').open('w') as log:
        boot = subprocess.Popen(['xcrun', 'simctl', 'bootstatus', simulator, '-b'], stdout=log, stderr=subprocess.STDOUT)
        try: wait_owned(boot, 240, 'Preparing recording device')
        finally: stop(boot)
    call('xcrun', 'simctl', 'install', simulator, str(app))
    call('xcrun', 'simctl', 'privacy', simulator, 'grant', 'location-always', BUNDLE)
    call('xcrun', 'simctl', 'status_bar', simulator, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
    fixture = OUT/'practice-offer.png'
    call('swift', str(ROOT/'scripts/generate-gig-offer-fixture.swift'), str(fixture))
    call('xcrun', 'simctl', 'launch', simulator, 'com.apple.mobileslideshow', timeout=180)
    call('xcrun', 'simctl', 'addmedia', simulator, str(fixture), timeout=240)
    call('xcrun', 'simctl', 'terminate', simulator, 'com.apple.mobileslideshow')
    call('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', simulator)
    with (OUT/'record.log').open('w') as video_log, (OUT/'tour-ui.log').open('w') as test_log:
        report['recordStartedAt'] = time.time()
        recorder = subprocess.Popen(['xcrun', 'simctl', 'io', simulator, 'recordVideo', '--codec=h264', str(OUT/'app-tour-raw.mp4')], stdout=video_log, stderr=subprocess.STDOUT)
        time.sleep(2); assert recorder.poll() is None, 'Recorder could not start.'
        test = subprocess.Popen(['xcodebuild', '-project', str(ROOT/'native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj'), '-scheme', 'RideshareTaxPros', '-destination', 'id='+simulator, '-derivedDataPath', str(DERIVED), '-resultBundlePath', str(OUT/'Tour.xcresult'), '-parallel-testing-enabled', 'NO', '-only-testing:RideshareTaxProsUITests/TourRecordingFlows/testRecordGettingStarted', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test-without-building'], stdout=test_log, stderr=subprocess.STDOUT)
        wait_owned(test, 750, 'Recording the app tour')
        stop(recorder, signal.SIGINT); assert recorder.returncode == 0, 'Movie recording did not finish cleanly.'
    installed = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'app').stdout.strip())
    report['appBundleSHA256'] = verify_installed_app(app, installed)
    container = Path(call('xcrun', 'simctl', 'get_app_container', simulator, BUNDLE, 'data').stdout.strip())
    for file in container.rglob('journal.json'):
        journal = json.loads(file.read_text()); assert not journal.get('entries') and not journal.get('gigOffers'), 'Tour must not save sample financial data.'
    report['ok'] = True
finally:
    stop(test); stop(recorder, signal.SIGINT)
    if simulator:
        call('xcrun', 'simctl', 'shutdown', simulator, check=False)
        assert next(d['state'] for d in devices() if d['udid'] == simulator) == 'Shutdown'
        call('xcrun', 'simctl', 'delete', simulator)
        report['ownedSimulatorDeleted'] = all(d['udid'] != simulator for d in devices())
    report['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (OUT/'recording.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2), flush=True)
