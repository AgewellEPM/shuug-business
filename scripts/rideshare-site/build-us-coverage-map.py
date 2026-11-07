#!/usr/bin/env python3
"""Build a local SVG from official Census state geometry; no third-party modules.

Input: cb_2024_us_state_20m.zip downloaded from the SOURCE_URL below.
Run: python3 scripts/rideshare-site/build-us-coverage-map.py /path/to/archive.zip
The geography is public federal Census data. Styling illustrates a brand goal,
not present service coverage. Alaska/Hawaii insets use separate display scales.
"""
import hashlib
import html
import json
import math
from pathlib import Path
import struct
import sys
import zipfile

SOURCE_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_20m.zip"
SOURCE_SHA256 = "7bc773d83c01b6df69b8aada9c2b5983d97f22f4551947cc5c00b87c663223ef"
OUTPUT = Path(__file__).resolve().parents[2] / "public/rideshare-tax-pros/assets/us-national-vision.svg"


def records(archive):
    """Read only the bounded polygon/DBF records of this pinned official file."""
    table = archive.read("cb_2024_us_state_20m.dbf")
    count = struct.unpack_from("<I", table, 4)[0]
    header, length = struct.unpack_from("<HH", table, 8)
    fields, offset = [], 32
    while table[offset] != 13:
        field = table[offset:offset + 32]
        fields.append((field[:11].split(b"\0")[0].decode("ascii"), field[16]))
        offset += 32
    names = []
    for index in range(count):
        row, start = {}, header + index * length + 1
        for name, size in fields:
            row[name] = table[start:start + size].decode("utf-8").strip()
            start += size
        names.append(row)
    shapes, offset = [], 100
    content = archive.read("cb_2024_us_state_20m.shp")
    while offset < len(content):
        size = struct.unpack_from(">I", content, offset + 4)[0] * 2
        record = content[offset + 8:offset + 8 + size]
        if struct.unpack_from("<I", record)[0] != 5:
            raise ValueError("Expected official Polygon geometry")
        parts, points = struct.unpack_from("<II", record, 36)
        starts = list(struct.unpack_from(f"<{parts}I", record, 44)) + [points]
        coordinates = [struct.unpack_from("<dd", record, 44 + parts * 4 + index * 16) for index in range(points)]
        shapes.append([coordinates[starts[index]:starts[index + 1]] for index in range(parts)])
        offset += 8 + size
    if len(shapes) != len(names) or len(shapes) != 52:
        raise ValueError("Unexpected official state record count")
    return [(name, rings) for name, rings in zip(names, shapes) if name["STUSPS"] != "PR"]


def albers(longitude_origin, latitude_origin, first_parallel, second_parallel):
    """Spherical Albers equal-area display projection, input NAD83 lon/lat."""
    rad = math.pi / 180
    first, second, latitude_origin = [value * rad for value in (first_parallel, second_parallel, latitude_origin)]
    n = (math.sin(first) + math.sin(second)) / 2
    c = math.cos(first) ** 2 + 2 * n * math.sin(first)
    rho_origin = math.sqrt(c - 2 * n * math.sin(latitude_origin)) / n

    def project(point):
        longitude, latitude = point
        delta = ((longitude - longitude_origin + 180) % 360 - 180) * rad
        rho = math.sqrt(max(0, c - 2 * n * math.sin(latitude * rad))) / n
        return rho * math.sin(n * delta), -(rho_origin - rho * math.cos(n * delta))
    return project


def group(states, project, box, label):
    projected = [(name, [[project(point) for point in ring] for ring in rings]) for name, rings in states]
    points = [point for _, rings in projected for ring in rings for point in ring]
    left, top = min(x for x, _ in points), min(y for _, y in points)
    width, height = max(x for x, _ in points) - left, max(y for _, y in points) - top
    x, y, bound_width, bound_height = box
    scale = min(bound_width / width, bound_height / height)
    dx, dy = x + (bound_width - width * scale) / 2, y + (bound_height - height * scale) / 2
    result = [f'<g id="{label}" fill="url(#brand-fill)" stroke="#dba2ff" stroke-width=".72" stroke-linejoin="round">']
    for name, rings in projected:
        paths = []
        for ring in rings:
            paths.append("M" + "L".join(f"{dx + (px - left) * scale:.2f},{dy + (py - top) * scale:.2f}" for px, py in ring) + "Z")
        result.append(f'<path data-state="{name["STUSPS"]}" d="{"".join(paths)}" fill-rule="evenodd"><title>{html.escape(name["NAME"])}</title></path>')
    result.append('</g>')
    return "\n".join(result)


def main():
    source = Path(sys.argv[1]).read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError("Census archive does not match the independently recorded SHA256")
    with zipfile.ZipFile(Path(sys.argv[1])) as archive:
        states = records(archive)
    if len(states) != 51 or {name["STUSPS"] for name, _ in states}.issuperset({"AK", "HI", "DC"}) is False:
        raise ValueError("Expected all 50 states and District of Columbia")
    contiguous = [(name, rings) for name, rings in states if name["STUSPS"] not in {"AK", "HI"}]
    alaska = [(name, rings) for name, rings in states if name["STUSPS"] == "AK"]
    hawaii = [(name, rings) for name, rings in states if name["STUSPS"] == "HI"]
    metadata = html.escape(json.dumps({"source": SOURCE_URL, "sourceSHA256": SOURCE_SHA256,
        "geography": "50 states and District of Columbia; Census 2024 generalized 1:20m",
        "display": "Albers equal-area; Alaska and Hawaii insets are not to scale",
        "meaning": "Nationwide brand/expansion goal only; no current coverage or office markers"}, separators=(",", ":")))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" aria-labelledby="map-title map-description">
<title id="map-title">United States · our nationwide brand vision</title>
<desc id="map-description">Actual United States state boundaries, including Alaska and Hawaii insets. The illuminated map illustrates an expansion goal, not current service coverage. No office markers are shown.</desc>
<metadata>{metadata}</metadata>
<defs>
<linearGradient id="brand-fill" gradientUnits="userSpaceOnUse" x1="140" y1="70" x2="850" y2="470"><stop stop-color="#a627f6"/><stop offset=".5" stop-color="#8421ba"/><stop offset="1" stop-color="#f70ce8"/></linearGradient>
<radialGradient id="halo"><stop stop-color="#a627f6" stop-opacity=".28"/><stop offset="1" stop-color="#a627f6" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#b28bd9" stroke-opacity=".07"/></pattern>
</defs>
<rect width="1000" height="650" rx="24" fill="#03060c"/>
<rect width="1000" height="650" rx="24" fill="url(#grid)"/>
<ellipse cx="520" cy="285" rx="470" ry="300" fill="url(#halo)"/>
<g filter="url(#glow)">
{group(contiguous, albers(-96, 37.5, 29.5, 45.5), (65, 50, 870, 445), 'contiguous-states')}
{group(alaska, albers(-154, 58.5, 55, 65), (72, 440, 225, 148), 'alaska-inset')}
{group(hawaii, albers(-157.5, 19.9, 8, 18), (340, 502, 155, 82), 'hawaii-inset')}
</g>
<g fill="none" stroke="#ff9bec" stroke-width="1.5" stroke-opacity=".32" stroke-dasharray="5 7" aria-hidden="true"><path d="M180 275Q475 70 830 235"/><path d="M225 315Q490 490 755 305"/></g>
<g fill="#d7c4ec" font-family="system-ui,sans-serif" font-size="15" letter-spacing="2"><text x="95" y="616">ALASKA</text><text x="350" y="616">HAWAII</text></g>
<text x="934" y="616" text-anchor="end" fill="#baa8ce" font-family="system-ui,sans-serif" font-size="12">Alaska + Hawaii shown as insets · not to scale</text>
</svg>'''
    OUTPUT.write_text(svg + "\n")
    print(f"Created {OUTPUT.name}: {len(states)} geographic features, {len(svg.encode())} bytes")


if __name__ == "__main__":
    main()
