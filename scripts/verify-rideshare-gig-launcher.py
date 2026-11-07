#!/usr/bin/env python3
"""Check the shipped iPhone launcher catalog against its publisher evidence and assets."""

import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
IOS = ROOT / "native/ios/RideshareTaxPros"
PROVENANCE = ROOT / "docs/deployments/gig-tax-pros-app-launcher-catalog-20261107.json"


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def swift_field(row, key, url=False):
    pattern = rf'\b{key}: URL\(string: "([^"]+)"\)!' if url else rf'\b{key}: "([^"]+)"'
    match = re.search(pattern, row)
    return match.group(1) if match else None


def main():
    evidence = json.loads(PROVENANCE.read_text())
    apps = evidence["apps"]
    source = (IOS / "App/GigAppCatalog.swift").read_text()
    rows = [line.strip() for line in source.splitlines() if line.strip().startswith(".init(id:")]
    require(len(rows) == len(apps) >= 5, "Swift catalog and publisher evidence have different app counts")
    require(len({app["id"] for app in apps}) == len(apps), "Duplicate launcher app IDs")
    require(len({app["iconAsset"] for app in apps}) == len(apps), "Launcher apps unexpectedly share an icon asset")
    schemes = set()
    universal_links = 0
    for row, app in zip(rows, apps):
        name = app["id"]
        for field in ["id", "name", "iconAsset"]:
            require(swift_field(row, field) == app[field], f"{name}: Swift {field} differs from evidence")
        for field in ["appStoreURL", "appURL", "universalLink"]:
            require(swift_field(row, field, url=True) == app[field], f"{name}: Swift {field} differs from evidence")
        store = urlparse(app["appStoreURL"])
        require(store.scheme == "https" and store.hostname == "apps.apple.com", f"{name}: unofficial store URL")
        require(re.search(rf'/id{app["appStoreID"]}(?:$|/)', store.path), f"{name}: App Store ID mismatch")
        require(app["appStoreURL"] in app["officialSourceURLs"], f"{name}: missing official store source")
        if app["appURL"]:
            scheme = urlparse(app["appURL"]).scheme
            require(scheme not in {"", "http", "https"}, f"{name}: invalid custom app scheme")
            require(any(urlparse(url).hostname not in {"apps.apple.com", "itunes.apple.com", "app-site-association.cdn-apple.com"}
                        for url in app["officialSourceURLs"]), f"{name}: custom scheme lacks publisher documentation")
            schemes.add(scheme)
        if app["universalLink"]:
            universal_links += 1
            require(urlparse(app["universalLink"]).scheme == "https", f"{name}: universal link must use HTTPS")
            launch = app.get("launchEvidence") or {}
            require(launch.get("matchedBundleID") == app["bundleID"], f"{name}: missing matching app association")
            require(re.fullmatch(r"[a-f0-9]{64}", launch.get("associationSHA256", "")), f"{name}: missing association receipt")
        icon = (ROOT / app["iconPath"]).resolve()
        require(icon.is_relative_to(IOS / "Resources"), f"{name}: icon is outside bundled resources")
        require(icon.is_file(), f"{name}: bundled publisher icon is missing")
        require(hashlib.sha256(icon.read_bytes()).hexdigest() == app["iconSHA256"], f"{name}: publisher icon hash mismatch")
        contents = json.loads((icon.parent / "Contents.json").read_text())
        require(any(image.get("filename") == icon.name for image in contents["images"]), f"{name}: icon is not wired into its asset")
    config = (IOS / "project.yml").read_text()
    configured = re.search(r"^\s+LSApplicationQueriesSchemes:\s*\[([^\]]*)\]\s*$", config, re.MULTILINE)
    require(configured, "Project does not declare launcher URL query schemes")
    declared = {value.strip().strip("\"'") for value in configured.group(1).split(",") if value.strip()}
    require(declared == schemes and len(declared) <= 50, "Project query schemes do not match the verified catalog")
    print(json.dumps({"apps": len(apps), "publisherIconsVerified": len(apps),
                      "publisherAssociatedUniversalLinks": universal_links, "querySchemes": sorted(schemes),
                      "physicalProviderLaunchVerified": False}, indent=2))


if __name__ == "__main__":
    main()
