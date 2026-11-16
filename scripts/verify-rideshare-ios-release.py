#!/usr/bin/env python3
"""Inspect the actual Release archive, including every embedded app extension."""
import argparse
import hashlib
import json
import plistlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path

BUNDLE = 'com.ridesharetaxpros.driver'
GROUP = 'group.com.ridesharetaxpros.driver'
REASONS = {
    BUNDLE: {'FileTimestamp': 'C617.1'},
    BUNDLE + '.offershare': {'FileTimestamp': 'C617.1'},
    BUNDLE + '.offerbroadcast': {'FileTimestamp': 'C617.1', 'SystemBootTime': '35F9.1'},
    BUNDLE + '.notificationcontent': {},
}


def verify(archive, allow_unsigned=False):
    app = archive / 'Products/Applications/RideshareTaxPros.app'
    assert app.is_dir(), 'Missing archived application'
    main = plistlib.loads((app / 'Info.plist').read_bytes())
    assert main['CFBundleIdentifier'] == BUNDLE, 'Unexpected application identity'
    assert main['MinimumOSVersion'] == '17.0', 'Unexpected minimum iOS version'
    assert set(main['UIDeviceFamily']) == {1, 2}, 'Preserve iPhone and iPad support'
    assert 'location' in main.get('UIBackgroundModes', []), 'Mileage background mode missing'
    assert not main.get('NSAppTransportSecurity', {}).get('NSAllowsArbitraryLoads'), 'Insecure transport'
    for key in ['NSCameraUsageDescription', 'NSLocationWhenInUseUsageDescription',
                'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSMotionUsageDescription']:
        assert main.get(key), 'Missing permission explanation: ' + key
    bundles = [app, *sorted((app / 'PlugIns').glob('*.appex'))]
    found, results = set(), []
    for bundle in bundles:
        info = plistlib.loads((bundle / 'Info.plist').read_bytes())
        identity = info['CFBundleIdentifier']
        assert identity in REASONS, 'Unexpected extension: ' + identity
        found.add(identity)
        assert info['CFBundleShortVersionString'] == main['CFBundleShortVersionString'], 'Version mismatch'
        assert info['CFBundleVersion'] == main['CFBundleVersion'], 'Build number mismatch'
        executable = bundle / info['CFBundleExecutable']
        assert executable.is_file(), 'Missing executable: ' + identity
        architecture = subprocess.check_output(['xcrun', 'lipo', '-archs', str(executable)], text=True).strip()
        assert architecture == 'arm64', 'Archive must contain device code only: ' + architecture
        needed = REASONS[identity]
        manifest = bundle / 'PrivacyInfo.xcprivacy'
        privacy = plistlib.loads(manifest.read_bytes()) if manifest.exists() else {}
        if needed:
            assert privacy and not privacy.get('NSPrivacyTracking', True), 'Missing no-tracking manifest'
            declarations = {x['NSPrivacyAccessedAPIType']: x['NSPrivacyAccessedAPITypeReasons']
                            for x in privacy.get('NSPrivacyAccessedAPITypes', [])}
            for category, reason in needed.items():
                assert reason in declarations.get('NSPrivacyAccessedAPICategory' + category, []), \
                    'Missing required reason in ' + identity + ': ' + category
        if identity == BUNDLE:
            types = {x['NSPrivacyCollectedDataType'] for x in privacy['NSPrivacyCollectedDataTypes']}
            for name in ['Name', 'EmailAddress', 'UserID', 'OtherFinancialInfo', 'PhotosorVideos', 'OtherUserContent']:
                assert 'NSPrivacyCollectedDataType' + name in types, 'Missing collected-data declaration: ' + name
            assert list(bundle.rglob('LinkKit.framework/PrivacyInfo.xcprivacy')), 'Missing Plaid SDK privacy manifest'
        signed = subprocess.run(['codesign', '--verify', '--strict', str(bundle)], capture_output=True).returncode == 0
        if not allow_unsigned:
            assert signed, 'Unsigned bundle cannot be distributed: ' + identity
            assert (bundle / 'embedded.mobileprovision').is_file(), 'Missing provisioning profile'
            ent = subprocess.run(['codesign', '-d', '--entitlements', ':-', str(bundle)], capture_output=True)
            permissions = plistlib.loads(ent.stdout)
            assert permissions.get('application-identifier', '').endswith('.' + identity), 'Signing identity mismatch'
            if identity in [BUNDLE, BUNDLE + '.offershare', BUNDLE + '.offerbroadcast']:
                assert GROUP in permissions.get('com.apple.security.application-groups', []), 'App Group missing'
        results.append({'bundleId': identity, 'architecture': architecture, 'signed': signed,
                        'executableSHA256': hashlib.sha256(executable.read_bytes()).hexdigest()})
    assert found == set(REASONS), 'A required app extension is absent'
    return {'verifiedAt': datetime.now(timezone.utc).isoformat(), 'archive': str(archive),
            'version': main['CFBundleShortVersionString'], 'build': main['CFBundleVersion'],
            'artifactCheck': 'passed', 'archiveSigningVerified': not allow_unsigned,
            'uploaded': False, 'physicalDeviceVerified': False, 'bundles': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--allow-unsigned', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(args.archive.resolve(), args.allow_unsigned)
    encoded = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.write_text(encoded)
    print(encoded, end='')
