"""Build the public geographic-name catalog from official Census Gazetteer ZIPs.

Usage: python3 scripts/sales/build-territory-catalog.py DIRECTORY_WITH_GAZ_ZIPS
Assignments use recorded office locality names; these are not parcel geofences.
"""
import csv
import hashlib
import io
import json
import pathlib
import re
import sys
import unicodedata
import zipfile

root = pathlib.Path(__file__).resolve().parents[2]
inputs = pathlib.Path(sys.argv[1])
destination = root / 'sales' / 'territory-data'
destination.mkdir(exist_ok=True)
states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
catalog = {state: {} for state in states}
sources = []

def key(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).lower()
    value = re.sub(r'[^a-z0-9]+', ' ', value).strip()
    return re.sub(r'\bst\b', 'saint', value)

for kind in ('cousubs', 'place'):
    archive = inputs / ('gaz-' + kind + '.zip')
    sources.append({'url': 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_' + kind + '_national.zip', 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
    with zipfile.ZipFile(archive) as zipped:
        raw = zipped.read(zipped.namelist()[0]).decode('utf-8-sig')
    for row in csv.DictReader(io.StringIO(raw), delimiter='|'):
        state = row['USPS']
        if state not in catalog:
            continue
        if kind == 'cousubs' and row['FUNCSTAT'] not in ('A', 'B', 'C', 'E', 'F', 'N'):
            continue
        if kind == 'place' and state == 'CT':
            continue  # CT's 169 municipal towns, without duplicate overlaid places.
        name = re.sub(r' (?:city and borough|unified government|consolidated government|metropolitan government|municipality|borough|township|village|city|town|CDP)$', '', row['NAME']).strip()
        if not name or name.endswith('not defined'):
            continue
        identity = key(name)
        entry = catalog[state].setdefault(identity, {'key': identity, 'name': name, 'kinds': [], 'geoids': []})
        label = 'Town / municipality' if kind == 'cousubs' else 'Community' if row['NAME'].endswith(' CDP') else 'City / town'
        if label not in entry['kinds']:
            entry['kinds'].append(label)
        entry['geoids'].append(row['GEOID'])

assert len(catalog['CT']) == 169, 'Connecticut must contain all 169 municipal towns.'
assert all(catalog.values()), 'Every state/DC must have catalog entries.'
manifest = {'version': '2026', 'sources': sources, 'assignmentBasis': 'Recorded office city/town name within its state. Identically named localities in one state share an assignment; this catalog is not an address-boundary geofence.', 'states': []}
for state in states:
    rows = sorted(catalog[state].values(), key=lambda row: row['name'].casefold())
    # One generated record per line keeps changes reviewable without a huge module.
    data = '[\n' + ',\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows) + '\n]\n'
    (destination / (state + '.json')).write_text(data)
    manifest['states'].append({'state': state, 'localities': len(rows), 'sha256': hashlib.sha256(data.encode()).hexdigest()})
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'states': len(states), 'localities': sum(len(rows) for rows in catalog.values()), 'CT': len(catalog['CT'])}))
