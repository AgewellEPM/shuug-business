#!/usr/bin/env python3
"""Verify actual signed Android release artifacts before Play upload."""
import argparse
import hashlib
import json
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def run(args):
    result = subprocess.run([str(v) for v in args], text=True, capture_output=True, check=True)
    return result.stdout + result.stderr


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native_alignment(archive):
    libraries = []
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None, "Archive checksum failure"
        for name in bundle.namelist():
            if not name.endswith(".so"):
                continue
            data = bundle.read(name)
            assert data[:4] == b"\x7fELF", "Invalid native library"
            order = "<" if data[5] == 1 else ">"
            bits = data[4]
            if bits == 2:
                offset = struct.unpack_from(order + "Q", data, 32)[0]
                size, count = struct.unpack_from(order + "HH", data, 54)
                layout = order + "IIQQQQQQ"
            else:
                offset = struct.unpack_from(order + "I", data, 28)[0]
                size, count = struct.unpack_from(order + "HH", data, 42)
                layout = order + "IIIIIIII"
            alignments = [struct.unpack_from(layout, data, offset + i * size)[-1]
                          for i in range(count)
                          if struct.unpack_from(order + "I", data, offset + i * size)[0] == 1]
            assert alignments, "Native library has no load segments"
            if bits == 2:
                assert min(alignments) >= 16384, "64-bit native library is not 16KB aligned: " + name
            libraries.append({"path": name, "elfBits": 64 if bits == 2 else 32,
                              "minimumLoadAlignment": min(alignments)})
    return libraries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-root", type=Path, required=True)
    parser.add_argument("--certificate", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--version-code", type=int, default=1)
    parser.add_argument("--version-name", default="1.0.0")
    args = parser.parse_args()
    sdk = Path.home() / "Library/Android/sdk/build-tools/36.0.0"
    java = Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin")
    apk = args.build_root / "app/outputs/apk/release/app-release.apk"
    aab = args.build_root / "app/outputs/bundle/release/app-release.aab"
    badging = run([sdk / "aapt2", "dump", "badging", apk])
    expected = "name='com.ridesharetaxpros.driver' versionCode='%s' versionName='%s'" % (args.version_code, args.version_name)
    assert expected in badging, "Unexpected package or version"
    assert "application-debuggable" not in badging, "Debuggable release"
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
    signature = run([sdk / "apksigner", "verify", "--verbose", "--print-certs", apk])
    expected_cert = run(["openssl", "x509", "-in", args.certificate, "-noout", "-fingerprint", "-sha256"])
    fingerprint = expected_cert.strip().split("=")[-1].replace(":", "").lower()
    assert "SHA-256 digest: " + fingerprint in signature, "Unexpected APK signing certificate"
    run([sdk / "zipalign", "-c", "-P", "16", "4", apk])
    jar = run([java / "jarsigner", "-verify", aab])
    assert "jar verified." in jar, "Bundle signature is invalid"
    bundle_cert = run([java / "keytool", "-printcert", "-jarfile", aab])
    assert fingerprint in bundle_cert.replace(":", "").lower(), "Unexpected bundle certificate"
    with zipfile.ZipFile(apk) as archive:
        assert any(b"ML Kit reads receipt and offer images on this device." in archive.read(name)
                   for name in archive.namelist() if name.endswith(".dex")), "SDK disclosure is missing from APK"
    with zipfile.ZipFile(aab) as archive:
        assert "BundleConfig.pb" in archive.namelist() and "base/manifest/AndroidManifest.xml" in archive.namelist()
        assert any(b"ML Kit reads receipt and offer images on this device." in archive.read(name)
                   for name in archive.namelist() if name.endswith(".dex")), "SDK disclosure is missing from bundle"
    counts = {key: 0 for key in ["tests", "failures", "errors", "skipped"]}
    tests = list((args.build_root / "app/test-results/testReleaseUnitTest").glob("TEST-*.xml"))
    assert tests, "Missing release test results"
    for test in tests:
        suite = ET.parse(test).getroot()
        for key in counts:
            counts[key] += int(suite.get(key, 0))
    assert counts["failures"] == counts["errors"] == 0
    libraries = native_alignment(apk)
    native_alignment(aab)
    receipt = {"verifiedAt": datetime.now(timezone.utc).isoformat(),
               "packageName": "com.ridesharetaxpros.driver", "versionCode": args.version_code,
               "versionName": args.version_name, "minSdk": 26, "targetSdk": 36,
               "debuggable": False, "uploadCertificateSHA256": fingerprint,
               "apk": {"fileName": apk.name, "bytes": apk.stat().st_size, "sha256": sha(apk)},
               "aab": {"fileName": aab.name, "bytes": aab.stat().st_size, "sha256": sha(aab)},
               "apkSignatureVerified": True, "bundleSignatureVerified": True,
               "zip16KBAlignmentVerified": True, "nativeLibraries": libraries,
               "sdkDisclosurePresentInBothArtifacts": True, "releaseUnitTests": counts,
               "physicalDeviceVerified": False, "playUploadVerified": False}
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
