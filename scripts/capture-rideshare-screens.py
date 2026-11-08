"""Capture a labeled screen catalogue from the existing visible iPhone preview."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
from ios_app_fingerprint import verify_installed_app
from screen_catalog import write_gallery

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = 'com.ridesharetaxpros.driver'
RUNNER = BUNDLE + '.uitests.xctrunner'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--device', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--artifacts', type=Path, required=True)
parser.add_argument('--only', action='append', help='Capture only this XCTest class/method on a follow-up pass.')
args = parser.parse_args()
DERIVED = Path(os.environ.get('RIDESHARE_IOS_TEST_DERIVED', '/private/tmp/gigtax-telemetry-ios-build'))
APP = DERIVED/'Build/Products/Debug-iphonesimulator/RideshareTaxPros.app'
args.output.mkdir(parents=True, exist_ok=True)
args.artifacts.mkdir(parents=True, exist_ok=False)
os.chmod(args.output, 0o700)

def call(*command, check=True, timeout=60):
    result = subprocess.run([str(c) for c in command], capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result

def container(bundle, kind='data'):
    result = call('xcrun', 'simctl', 'get_app_container', args.device, bundle, kind, check=False, timeout=15)
    return Path(result.stdout.strip()) if result.returncode == 0 else None

def journals():
    data = container(BUNDLE)
    return {str(p.relative_to(data)): p.read_bytes() for p in data.rglob('journal.json')} if data else {}

before = journals()
assert all(not json.loads(value).get('activeTripId') for value in before.values()), 'Finish an active drive before taking catalogue screenshots.'
for index, value in enumerate(before.values()):
    backup = args.artifacts/f'preserved-journal-{index}.json'
    backup.write_bytes(value); os.chmod(backup, 0o600)
devices = json.loads(call('xcrun', 'simctl', 'list', 'devices', '--json').stdout)['devices']
active = [d for group in devices.values() for d in group if d['state'] in ('Booted', 'Booting', 'Shutting Down')]
assert len(active) == 1 and active[0]['udid'] == args.device and active[0]['state'] == 'Booted', 'Use exactly the existing visible preview.'
assert call('pgrep', '-fl', 'qemu-system|VirtualBoxVM|vmware-vmx|prl_vm_app|IsolatedTester.app/Contents/MacOS/IsolatedTester', check=False).returncode == 1, 'Another guest is active.'
call('xcrun', 'simctl', 'status_bar', args.device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
call('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', args.device)

catalogue = {}
saved = args.output/'screen-index.json'
if saved.exists(): catalogue = {item['id']: item for item in json.loads(saved.read_text())}
runner_data = None

def collect():
    global runner_data
    if runner_data is None or not runner_data.exists(): runner_data = container(RUNNER)
    if runner_data is None: return
    directory = runner_data/'Documents/ScreenCatalog'
    for metadata in directory.glob('*.json'):
        try: item = json.loads(metadata.read_text())
        except (OSError, json.JSONDecodeError): continue
        source = directory/item['file']
        if not source.is_file(): continue
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if catalogue.get(item['id'], {}).get('sha256') == digest: continue
        shutil.copyfile(source, args.output/item['file'])
        item['sha256'] = digest; catalogue[item['id']] = item
        print(f"Saved {item['id']}: {item['title']}", flush=True)
    saved.write_text(json.dumps(sorted(catalogue.values(), key=lambda x: x['id']), indent=2)+'\n')

def index():
    write_gallery(catalogue.values(), args.output)

def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try: process.wait(timeout=20)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=15)

def interrupted(signum, frame): raise KeyboardInterrupt('Screen capture interrupted; collected images are preserved.')
signal.signal(signal.SIGTERM, interrupted)
test = None
report = {'ok': False, 'device': args.device, 'output': str(args.output), 'physicalIPhone': False}
try:
    selections = args.only or ['ScreenCatalogMainFlows', 'ScreenCatalogMoneyFlows', 'ScreenCatalogOffersFlows', 'ScreenCatalogAccountFlows']
    command = ['xcodebuild', '-project', ROOT/'native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj', '-scheme', 'RideshareTaxPros', '-destination', 'id='+args.device,
               '-derivedDataPath', DERIVED, '-resultBundlePath', args.artifacts/'Screens.xcresult', '-parallel-testing-enabled', 'NO', '-disableAutomaticPackageResolution']
    command += ['-only-testing:RideshareTaxProsUITests/'+name for name in selections]
    command += ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test-without-building']
    with (args.artifacts/'capture.log').open('w') as log:
        test = subprocess.Popen([str(c) for c in command], stdout=log, stderr=subprocess.STDOUT)
        deadline, next_collect = time.monotonic()+2400, 0
        while test.poll() is None:
            if time.monotonic() > deadline: raise RuntimeError('Capture exceeded 40 minutes; inspect capture.log.')
            if time.monotonic() >= next_collect:
                collect(); index(); next_collect = time.monotonic()+15
            time.sleep(1)
    collect(); report['testExitCode'] = test.returncode
    installed = container(BUNDLE, 'app')
    report['appBundleSHA256'] = verify_installed_app(APP, installed)
    after = journals()
    assert all(after.get(path) == value for path, value in before.items()), 'Existing journal changed; originals are preserved in the private artifact directory.'
    assert all(not json.loads(value).get('entries') and not json.loads(value).get('gigOffers') for path, value in after.items() if path not in before), 'Capture created records unexpectedly.'
    report['existingJournalsPreserved'] = True
    report['ok'] = test.returncode == 0
finally:
    stop(test)
    collect(); index()
    call('xcrun', 'simctl', 'terminate', args.device, RUNNER, check=False)
    call('xcrun', 'simctl', 'status_bar', args.device, 'clear', check=False)
    call('xcrun', 'simctl', 'launch', args.device, BUNDLE, check=False)
    call('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', args.device, check=False)
    report.update(screenshots=len(catalogue), completedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), userPreviewLeftOpen=True)
    (args.artifacts/'capture-receipt.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2), flush=True)
if not report['ok']: raise SystemExit(1)
