"""Build display geometry for the SDR town catalog. Run with a Census ZIP directory.

Build dependencies: pyshp 2.3.1, shapely 2.1.2, pyproj 3.7.2.
From https://www2.census.gov/geo/tiger/GENZ2025/shp/ download
cb_2025_us_{state,county,place,cousub}_500k.zip as {state,county,place,cousub}.zip.
From the 2026 Gazetteer directory download 2026_Gaz_{place,cousubs}_national.zip
as gaz-{place,cousubs}.zip. Download cities1000.zip from the GeoNames export dump
(geonames.org, CC BY 4.0), and Natural Earth ne_50m_ocean.zip as ocean.zip. For newer GEOIDs also download the matching
tl_2026_SS_LAYER.zip from https://www2.census.gov/geo/tiger/TIGER2026/LAYER/.
"""
import csv
import gzip
import hashlib
import io
from itertools import groupby
import json
import statistics
import sys
import zipfile
from pathlib import Path
from collections import defaultdict

import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import Point, box as rectangle, shape

root = Path(__file__).resolve().parents[2]
archives = Path(sys.argv[1])
catalog = root / 'sales/territory-data'
destination = root / 'sales/territory-map-data'
destination.mkdir(exist_ok=True)
manifest = json.loads((catalog / 'manifest.json').read_text())
towns = {}
for region in manifest['states']:
    code = region['state']
    for town in json.loads((catalog / (code + '.json')).read_text()):
        for geoid in town['geoids']:
            towns[geoid] = town['name']

points = {}
for layer, source in zip(('cousubs', 'place'), manifest['sources'], strict=True):
    archive = archives / f'gaz-{layer}.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == source['sha256']
    with zipfile.ZipFile(archive) as z, z.open(z.namelist()[0]) as raw:
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig'), delimiter='|'):
            if row['GEOID'] in towns:
                points[row['GEOID']] = (float(row['INTPTLONG']), float(row['INTPTLAT']), row['NAME'])

# Index by GEOID so towns sharing address names keep their separate polygons.
boundaries = {}
for layer, length in [('cousub', 10), ('place', 7)]:
    def index(archive, wanted, extra_fields):
        reader = shapefile.Reader(str(archive))
        for record in reader.iterRecords(fields=['GEOID', *extra_fields]):
            if record.GEOID in wanted:
                boundaries[record.GEOID] = (reader, record.oid, getattr(record, 'NAMELSADCO', ''))

    expected = {g for g in towns if len(g) == length}
    index(archives / f'{layer}.zip', expected, ['NAMELSADCO'] if layer == 'cousub' else [])
    missing = expected - boundaries.keys()
    for fips in sorted({g[:2] for g in missing}):
        index(archives / f'tl_2026_{fips}_{layer}.zip', missing, [])
    assert not expected - boundaries.keys(), f'Missing boundaries: {expected - boundaries.keys()}'
assert points.keys() == towns.keys()


def rings_path(geom, xy):
    polygons = [geom] if geom.geom_type == 'Polygon' else geom.geoms
    paths = []
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            points = [p for p, _ in groupby(xy(x, y) for x, y in ring.coords[:-1])]
            if len(points) >= 3:
                paths.append('M' + ' '.join(f'{x},{y}' for x, y in points) + 'Z')
    return ''.join(paths)


def county_colors(geometries):
    # Color touching counties differently, including narrow borders lost in simplification.
    tree = shapely.STRtree(geometries)
    neighbors = [set(tree.query(g, predicate='dwithin', distance=80)) - {i}
                 for i, g in enumerate(geometries)]
    colors = {}
    usage = [0] * 7
    while len(colors) < len(geometries):
        candidates = (i for i in range(len(geometries)) if i not in colors)
        def forbidden(i):
            return {colors[n] for n in neighbors[i] if n in colors}
        index = max(candidates, key=lambda i: (len(forbidden(i)), len(neighbors[i]), -i))
        used = forbidden(index)
        color = min(range(len(usage)), key=lambda c: (c in used, usage[c], c))
        colors[index] = color
        usage[color] += 1
    return colors


seats = defaultdict(list)
with zipfile.ZipFile(archives / 'cities1000.zip') as z, z.open('cities1000.txt') as raw:
    for row in csv.reader(io.TextIOWrapper(raw, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
        if row[8] == 'US' and row[7] in ('PPLA', 'PPLC', 'PPLA2'):
            seats[row[10]].append((row[1], row[7], float(row[5]), float(row[4]), int(row[14] or 0)))
county_reader = shapefile.Reader(str(archives / 'county.zip'))
county_records = defaultdict(list)
for record in county_reader.iterRecords():
    county_records[record.STUSPS].append(record)

ocean = shapely.union_all([shape(raw.__geo_interface__) for raw in shapefile.Reader(str(archives / 'ocean.zip')).shapes()])
states = shapefile.Reader(str(archives / 'state.zip'))
for state in states.iterShapeRecords():
    code = state.record.STUSPS
    ids = [g for g in towns if g.startswith(state.record.STATEFP)]
    if not ids:
        continue
    lon = statistics.median(points[g][0] for g in ids)
    lat = statistics.median(points[g][1] for g in ids)
    crs = f'+proj=aeqd +lat_0={lat} +lon_0={lon} +ellps=GRS80 +units=m'
    project = Transformer.from_crs('EPSG:4269', crs, always_xy=True).transform

    def projected(raw):
        return shapely.transform(shape(raw.__geo_interface__), project, interleaved=False)

    outline = projected(state.shape)
    xmin, ymin, xmax, ymax = outline.bounds
    focus = outline
    if code == 'HI':
        # Show the inhabited island chain at entry while preserving the full outline.
        focus = max((p for p in outline.geoms), key=lambda p: p.area)
        main = [p for p in outline.geoms if p.distance(focus) < 600000]
        focus = shapely.geometry.GeometryCollection(main)
    fx0, fy0, fx1, fy1 = focus.bounds
    unit = max(fx1 - fx0, fy1 - fy0) / 20000

    def xy(x, y):
        return round((x - xmin) / unit), round((ymax - y) / unit)

    def box(bounds):
        left, bottom, right, top = bounds
        return [*xy(left, top), *xy(right, bottom)]

    # Clip ocean in geographic coordinates before projecting each chart. Split at the
    # date line so the western Aleutians are adjacent to mainland Alaska.
    frame = rectangle(xmin - (fx1 - fx0), ymin - (fy1 - fy0), xmax + (fx1 - fx0), ymax + (fy1 - fy0))
    longitudes = [lon + ((pt[0] - lon + 180) % 360) - 180 for pt in state.shape.points]
    south, north = state.shape.bbox[1], state.shape.bbox[3]
    margin = max(max(longitudes) - min(longitudes), north - south)
    oceans = []
    for shift in (-360, 0, 360):
        west, east = max(-180, min(longitudes) - margin + shift), min(180, max(longitudes) + margin + shift)
        if east <= west:
            continue
        crop = rectangle(west, max(-85, south - margin), east, min(85, north + margin))
        fragment = ocean.intersection(crop)
        if not fragment.is_empty:
            local = shapely.transform(fragment.segmentize(0.5), project, interleaved=False)
            clipped = shapely.make_valid(local).intersection(frame)
            for poly in shapely.get_parts(clipped):
                if poly.geom_type in ('Polygon', 'MultiPolygon'):
                    oceans.append(rings_path(poly.simplify(unit * 4), xy))
    records = sorted(county_records[code], key=lambda r: r.GEOID)
    county_geoms = [projected(county_reader.shape(r.oid)) for r in records]
    colors = county_colors(county_geoms)
    counties = []
    for i, (record, geom) in enumerate(zip(records, county_geoms, strict=True)):
        largest = max(geom.geoms, key=lambda p: p.area) if geom.geom_type == 'MultiPolygon' else geom
        anchor = largest.centroid
        if not largest.covers(anchor):
            anchor = largest.representative_point()
        x, y = xy(anchor.x, anchor.y)
        counties.append(dict(id=record.GEOID, name=record.NAME, label=record.NAMELSAD, x=x, y=y,
                             color=colors[i], bounds=box(geom.bounds), path=rings_path(geom.simplify(unit * 2), xy)))
    landmarks = []
    for name, kind, lon, lat, population in sorted(seats[code], key=lambda row: (row[1] == 'PPLA2', -row[4], row[0])):
        x, y = xy(*project(lon, lat))
        landmarks.append(dict(name=name, x=x, y=y, capital=kind != 'PPLA2'))
    assert len([m for m in landmarks if m['capital']]) == 1
    features = []
    for geoid in ids:
        reader, index, county = boundaries[geoid]
        geom = projected(reader.shape(index)).simplify(unit * 2)
        anchor = Point(*project(*points[geoid][:2]))
        if not geom.covers(anchor):
            # Gazetteer internal points can lie in water removed by coastal clipping.
            main = max(geom.geoms, key=lambda p: p.area) if geom.geom_type == 'MultiPolygon' else geom
            anchor = main.representative_point()
        x, y = xy(anchor.x, anchor.y)
        path = rings_path(geom, xy)
        item = dict(id=geoid, name=towns[geoid], label=points[geoid][2], x=x, y=y,
                    bounds=box(geom.bounds), path=path)
        if county:
            item['label'] += ', ' + county
        features.append((geom.area, item))
    # Paint smaller places over larger, overlapping municipalities.
    features.sort(key=lambda pair: (-pair[0], pair[1]['id']))
    payload = dict(state=code, name=state.record.NAME, bounds=box(outline.bounds),
                   metersPerUnit=unit, counties=counties, landmarks=landmarks,
                   frame=box(frame.bounds), water="".join(oceans),
                   fit=box(focus.bounds), outline=rings_path(outline.simplify(unit * 2), xy),
                   features=[item for _, item in features])
    raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
    (destination / f'{code}.json.gz').write_bytes(gzip.compress(raw, mtime=0))
    print(code, len(features), flush=True)
