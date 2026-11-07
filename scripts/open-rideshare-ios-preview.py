"""Open the built driver app on the normal desktop for user review; retain its data."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from ios_app_fingerprint import verify_installed_app

APP = Path(os.environ.get('RIDESHARE_IOS_TEST_DERIVED', '/private/tmp/rideshare-ios-simulator-build')) / 'Build/Products/Debug-iphonesimulator/RideshareTaxPros.app'
BUNDLE = 'com.ridesharetaxpros.driver'
NAME = 'Gig Tax Pros Preview'
PREVIOUS_NAME = 'Rideshare Tax Pros Preview'
RECEIPT = Path('/private/tmp/rideshare-ios-preview.json')


def call(*args, check=True, timeout=60):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def devices():
    groups = json.loads(call('xcrun', 'simctl', 'list', 'devices', '--json').stdout)['devices']
    return [device for group in groups.values() for device in group]


def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def interrupted(signum, frame):
    raise KeyboardInterrupt('Preview startup interrupted.')


signal.signal(signal.SIGTERM, interrupted)
assert APP.exists(), 'Build the Simulator app before opening its preview.'
signature = call('codesign', '-dv', str(APP)).stderr
assert 'Identifier='+BUNDLE in signature and 'linker-signed' not in signature, 'The preview needs normal local Simulator signing for Keychain.'
assert call('pgrep', '-fl', 'qemu-system|VirtualBoxVM|vmware-vmx|prl_vm_app|IsolatedTester.app/Contents/MacOS/IsolatedTester', check=False).returncode == 1, 'An existing guest is active; close it before opening the preview.'
existing = devices()
requested_device = os.environ.get('RIDESHARE_IOS_PREVIEW_DEVICE')
matches = [d for d in existing if d['udid'] == requested_device] if requested_device else [d for d in existing if d['name'] in (NAME, PREVIOUS_NAME)]
assert not requested_device or len(matches) == 1, 'The requested existing Simulator was not found; no substitute will be created.'
assert len(matches) <= 1, 'More than one preview device exists; inspect before proceeding.'
identifier = matches[0]['udid'] if matches else None
preview_name = matches[0]['name'] if requested_device else NAME
assert not any(d['udid'] != identifier and d['state'] in ('Booted', 'Booting', 'Shutting Down') for d in existing), 'Another Simulator is active; refusing a second session.'
created = booted_here = ready = False
boot = None
try:
    if identifier is None:
        identifier = call('xcrun', 'simctl', 'create', NAME, 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro', 'com.apple.CoreSimulator.SimRuntime.iOS-26-0').stdout.strip()
        created = True
    state = next(d['state'] for d in devices() if d['udid'] == identifier)
    assert state in ('Shutdown', 'Booted'), 'Preview is changing state; wait for it to settle.'
    if matches and not requested_device and matches[0]['name'] != NAME:
        call('xcrun', 'simctl', 'rename', identifier, NAME)
    if state == 'Shutdown':
        call('xcrun', 'simctl', 'boot', identifier)
        booted_here = True
        boot = subprocess.Popen(['xcrun', 'simctl', 'bootstatus', identifier, '-b'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 240
        while boot.poll() is None:
            if time.monotonic() > deadline:
                raise RuntimeError('Preview boot timed out.')
            time.sleep(1)
        assert boot.returncode == 0, 'Preview boot failed.'
    call('xcrun', 'simctl', 'install', identifier, str(APP))
    installed = Path(call('xcrun', 'simctl', 'get_app_container', identifier, BUNDLE, 'app').stdout.strip())
    fingerprint = hashlib.sha256((APP/'RideshareTaxPros').read_bytes()).hexdigest()
    bundle_fingerprint = verify_installed_app(APP, installed)
    launched = call('xcrun', 'simctl', 'launch', identifier, BUNDLE).stdout.strip()
    pid = int(launched.rsplit(':', 1)[1].strip())
    call('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', identifier)
    time.sleep(2)
    os.kill(pid, 0)
    report = dict(simulator=identifier, name=preview_name, appPid=pid, appExecutableSHA256=fingerprint, appBundleSHA256=bundle_fingerprint, userReviewLeftOpen=True, diagnosticSession=False, openedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    RECEIPT.write_text(json.dumps(report, indent=2)+'\n')
    ready = True
    print(json.dumps(report, indent=2), flush=True)
finally:
    stop(boot)
    if not ready and identifier and (created or booted_here):
        call('xcrun', 'simctl', 'shutdown', identifier, check=False)
        assert next(d['state'] for d in devices() if d['udid'] == identifier) == 'Shutdown', 'Failed preview shutdown needs inspection.'
        if created:
            call('xcrun', 'simctl', 'delete', identifier)
            assert all(d['udid'] != identifier for d in devices()), 'Failed preview deletion needs inspection.'
