#!/usr/bin/env python3
"""Check public-release prerequisites without changing any service or App Store record.

The private evidence JSON supplies physicalDeviceReport, hostedSyncReport,
recoveryReport, reviewAccessReport and screenshotReport as existing local files,
plus supportURL and privacyURL as the actual published HTTPS pages. Reports are
human-reviewed execution evidence, not generated readiness claims.
"""
import argparse
import importlib.util
import json
import urllib.request
from pathlib import Path
from urllib.parse import urlparse


def get(url):
    parsed = urlparse(url)
    assert parsed.scheme == 'https' and parsed.hostname and '.' in parsed.hostname, 'Public HTTPS URL required'
    assert not parsed.username and not parsed.password, 'URL credentials are forbidden'
    assert parsed.hostname not in ['localhost', 'example.com'] and not parsed.hostname.endswith('.example'), 'Placeholder URL'
    with urllib.request.urlopen(url, timeout=20) as response:
        assert response.status == 200 and urlparse(response.url).scheme == 'https'
        return response.read(2_000_001)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    validator = Path(__file__).with_name('verify-rideshare-ios-release.py')
    spec = importlib.util.spec_from_file_location('archive_check', validator)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.verify(args.archive.resolve())  # Strict: never accept an unsigned archive.
    evidence = json.loads(args.evidence.read_text())
    assert str(evidence.get('appStoreAppId', '')).isdigit(), 'App Store Connect app record required'
    for key in ['physicalDeviceReport', 'hostedSyncReport', 'recoveryReport', 'reviewAccessReport', 'screenshotReport']:
        file = Path(evidence.get(key, ''))
        if not file.is_absolute():
            file = args.evidence.parent / file
        assert file.is_file() and file.stat().st_size > 0, 'Missing observed execution evidence: ' + key
    for key in ['supportURL', 'privacyURL']:
        assert get(evidence.get(key, '')), 'Missing public page: ' + key
    config = json.loads(get('https://gigtax.pro/site-config.json'))
    workspace = config.get('workspaceUrl')
    assert workspace, 'Public workspace is still disconnected'
    parsed = urlparse(workspace)
    health = json.loads(get(f'{parsed.scheme}://{parsed.netloc}/api/website/customer/driver/health'))
    assert health == {'service': 'gig-tax-pros-workspace', 'apiVersion': 1, 'ready': True}, 'Unexpected backend'
    print('Public prerequisite checks passed. Review the linked evidence before submitting to Apple.')
