#!/usr/bin/env python3
"""Package original screenshots from successful current-release native capture runs."""
import argparse
import hashlib
import json
import plistlib
import re
import shutil
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('capture_root', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
source_commit = '65711035458174daf485842d261b40e633e41233'
runtime_paths = ['App', 'Resources', 'Shared', 'BroadcastUpload', 'ShareOffer',
                 'NotificationContent', 'ExtensionPrivacy', 'DriverCore', 'project.yml',
                 'Info.plist', 'RideshareTaxPros.entitlements']
subprocess.run(['git', 'diff', '--exit-code', source_commit, '--',
                *['native/ios/RideshareTaxPros/' + path for path in runtime_paths]],
               cwd=repo, check=True, capture_output=True)
app = args.capture_root / 'DerivedData/Build/Products/Release-iphonesimulator/RideshareTaxPros.app'
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'com.ridesharetaxpros.driver'
assert info['CFBundleShortVersionString'] == '1.0.0' and info['CFBundleVersion'] == '2026111603'
assert not args.output.exists(), 'Choose a fresh package output; preserve existing assets'
receipt = {'preparedAt': datetime.now(timezone.utc).isoformat(),
           'version': '1.0.0', 'build': '2026111603', 'currentBuildVerified': True,
           'captureConfiguration': 'Release', 'sourceCommit': source_commit,
           'sourceMatchesUploadedRelease': True, 'simulator': True,
           'physicalDeviceVerified': False, 'ownerVisualAcceptanceVerified': False,
           'uploaded': False, 'screenshots': []}
pending = []
specs = [('iPhone', 'iPhone-signed.xcresult', 'iPhone 17 Pro Max', 'APP_IPHONE_67', (1320, 2868)),
         ('iPad', 'iPad-floating-tabs.xcresult', 'iPad Pro 13-inch (M4)', 'APP_IPAD_PRO_3GEN_129', (2064, 2752))]
for family, result_name, model, display_type, dimensions in specs:
    summary = json.loads(subprocess.check_output(['xcrun', 'xcresulttool', 'get', 'test-results', 'summary',
                          '--path', str(args.capture_root / result_name), '--format', 'json']))
    assert summary['result'] == 'Passed' and summary['failedTests'] == 0 and summary['passedTests'] == 1
    device = summary['devicesAndConfigurations'][0]['device']
    assert device['modelName'] == model, 'Unexpected capture device: ' + device['modelName']
    for number in range(1, 7):
        item = json.loads((args.capture_root / family / f'store-{number:02}.json').read_text())
        path = args.capture_root / family / item['file']
        assert path.parent.resolve() == (args.capture_root / family).resolve()
        data = path.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', data[16:24]) == dimensions
        assert data[25] in [0, 2], 'Apple screenshots must not contain alpha'
        slug = re.sub(r'[^a-z0-9]+', '-', item['title'].lower()).strip('-')
        target = f'{family}/{number:02}-{slug}.png'
        pending.append((path, target))
        receipt['screenshots'].append({'file': target, 'title': item['title'], 'route': item['route'],
          'mode': item['mode'], 'capturedAt': item['capturedAt'], 'dimensions': dimensions,
          'screenshotDisplayType': display_type, 'deviceModel': model, 'osVersion': device['osVersion'],
          'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
args.output.mkdir(parents=True, mode=0o700)
for source, name in pending:
    destination = args.output / name
    destination.parent.mkdir(exist_ok=True, mode=0o700)
    shutil.copyfile(source, destination)
(args.output / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(f'Packaged {len(pending)} current-release screenshots, with original pixels, hashes and device provenance.')
