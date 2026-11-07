"""Fingerprint actual bundled code and resources, including Xcode's debug dylib."""
import hashlib
import json
from pathlib import Path


def app_fingerprint(app: Path):
    files = {str(item.relative_to(app)): hashlib.sha256(item.read_bytes()).hexdigest()
             for item in sorted(app.rglob('*')) if item.is_file()}
    assert files and 'RideshareTaxPros' in files, 'The iPhone app bundle is incomplete.'
    bundle = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return files, bundle


def verify_installed_app(app: Path, installed: Path):
    expected, fingerprint = app_fingerprint(app)
    for relative, digest in expected.items():
        item = installed / relative
        assert item.is_file() and hashlib.sha256(item.read_bytes()).hexdigest() == digest, \
            'Installed app differs from the compiled bundle: ' + relative
    return fingerprint
