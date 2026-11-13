#!/usr/bin/env python3
"""Build a pinned, resumable US tax/accounting contact catalogue from Overture.

Requires pyarrow 21+. Anonymous S3 range reads only; no account, browser or full
Parquet downloads. The output is research data, never verified ownership/CRM.
Example: python3 scripts/sales/build-business-places.py --release 2026-10-21.0 \
  --cache /private/tmp/gigtax-place-cache --output /private/tmp/gigtax-place-data
"""
import argparse
import gzip
import hashlib
import ipaddress
import json
import math
from pathlib import Path
import re
import shutil
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
# tax_office is a government tax office; tax_law/taxi_service are not preparers.
CATEGORIES = {'accountant', 'tax_service', 'bookkeeper'}
BOXES = [(-125, 24, -66, 50), (-180, 50, -129, 72), (172, 50, 180, 72), (-161, 18, -154, 23)]
COLUMNS = ['id', 'names.primary', 'addresses', 'websites', 'phones', 'emails',
           'sources', 'operating_status', 'confidence', 'taxonomy.primary', 'bbox']
BUCKET = 'overturemaps-us-west-2'
ORIGIN = f'https://{BUCKET}.s3.us-west-2.amazonaws.com/'
SOURCE_URL = 'https://docs.overturemaps.org/guides/places/'
NS = {'s': 'http://s3.amazonaws.com/doc/2006-03-01/'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()


def bounded_text(value, limit):
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        return ''
    return value.strip()


def website(value):
    value = bounded_text(value, 700)
    try:
        url = urllib.parse.urlsplit(value)
        host = url.hostname or ''
        if url.scheme not in {'https', 'http'} or url.username or url.password or url.port or '.' not in host:
            return ''
        if re.search(r'\.(?:local|internal|lan|home|test|invalid|example|onion)$', host) or host.endswith('.'):
            return ''
        try:
            ipaddress.ip_address(host)
            return ''
        except ValueError:
            pass
        return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path or '/', url.query, ''))
    except ValueError:
        return ''


def phone(value):
    value = bounded_text(value, 60)
    if not re.fullmatch(r'\+?[\d ().-]+', value):
        return ''
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10:
        digits = '1' + digits
    if not re.fullmatch(r'1[2-9]\d{2}[2-9]\d{6}', digits) or re.fullmatch(r'1\d{3}55501\d{2}', digits):
        return ''
    return '+' + digits


def email(value):
    value = bounded_text(value, 240).lower()
    return value if re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[a-z]{2,24}', value) and not value.endswith(('.example', '.test', '.invalid')) else ''


def normalize(row, file_index, group_index):
    category = (row.get('taxonomy') or {}).get('primary')
    if category not in CATEGORIES or row.get('operating_status') == 'permanently_closed':
        return []
    confidence = row.get('confidence')
    if confidence is not None and (not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or confidence <= 0):
        return []
    identifier, name = row.get('id', ''), bounded_text((row.get('names') or {}).get('primary'), 240)
    if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', identifier) or not name:
        return []
    channels = {key: sorted({clean(value) for value in (row.get(key) or []) if clean(value)})[:8]
                for key, clean in [('websites', website), ('phones', phone), ('emails', email)]}
    # The place subset is solely for contact enrichment. Empty records add no value.
    if not any(channels.values()):
        return []
    sources = []
    for source in (row.get('sources') or [])[:40]:
        item = {key: bounded_text(source.get(key), limit) for key, limit in
                [('dataset', 100), ('property', 100), ('record_id', 300), ('update_time', 60), ('license', 150)]}
        if item['dataset']:
            sources.append({key: value for key, value in item.items() if value})
    bbox = row.get('bbox') or {}
    coordinates = [bbox.get('ymin'), bbox.get('xmin')]
    point = coordinates if all(isinstance(v, (int, float)) and math.isfinite(v) for v in coordinates) and -90 <= coordinates[0] <= 90 and -180 <= coordinates[1] <= 180 else None
    result, seen = [], set()
    for address in (row.get('addresses') or [])[:20]:
        region = bounded_text(address.get('region'), 5).removeprefix('US-')
        city, street = bounded_text(address.get('locality'), 100), bounded_text(address.get('freeform'), 300)
        if address.get('country') != 'US' or region not in STATES or not city or not street:
            continue
        identity = (region, city, street)
        if identity in seen:
            continue
        seen.add(identity)
        result.append({'id': identifier, 'name': name, 'address': street, 'city': city, 'state': region,
                       'zip': bounded_text(address.get('postcode'), 12), 'category': category,
                       'operatingStatus': bounded_text(row.get('operating_status'), 40) or 'unknown',
                       'confidence': confidence, **channels, 'sources': sources,
                       'sourceFile': file_index, 'sourceRowGroup': group_index,
                       # For a source-explorer link only; not imported as a verified office pin.
                       'sourcePoint': point})
    return result


def inventory(release):
    prefix = f'release/{release}/theme=places/type=place/'
    url = ORIGIN + '?' + urllib.parse.urlencode({'list-type': '2', 'prefix': prefix})
    request = urllib.request.Request(url, headers={'User-Agent': 'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Source inventory exceeds the bound.')
    root = ET.fromstring(raw)
    if root.findtext('s:IsTruncated', namespaces=NS) != 'false':
        raise ValueError('A truncated inventory cannot establish complete coverage.')
    files = [{'key': item.findtext('s:Key', namespaces=NS), 'etag': item.findtext('s:ETag', namespaces=NS),
              'bytes': int(item.findtext('s:Size', namespaces=NS))} for item in root.findall('s:Contents', NS)]
    if not files or len(files) > 100 or any(not item['key'].startswith(prefix) or not item['key'].endswith('.parquet') for item in files):
        raise ValueError('Unexpected source inventory.')
    return {'url': url, 'sha256': sha(raw), 'files': files}


def selected_groups(metadata):
    groups = []
    for index in range(metadata.num_row_groups):
        group = metadata.row_group(index)
        columns = {group.column(n).path_in_schema: group.column(n) for n in range(group.num_columns)}
        x, y = columns['bbox.xmin'].statistics, columns['bbox.ymin'].statistics
        if not x or not y:
            raise ValueError('Missing spatial bounds; refusing an unbounded read.')
        if any(x.max >= west and x.min <= east and y.max >= south and y.min <= north for west, south, east, north in BOXES):
            if group.num_rows > 100_000:
                raise ValueError('Source row group exceeds the memory bound.')
            amount = sum(column.total_compressed_size for key, column in columns.items()
                         if any(key == chosen or key.startswith(chosen + '.') for chosen in COLUMNS))
            groups.append({'index': index, 'rows': group.num_rows, 'bytes': amount})
    return groups


def write_gzip(path, value):
    raw = encoded(value)
    if len(raw) > 32 * 2**20:
        raise ValueError('A catalogue shard exceeds its output bound.')
    data = gzip.compress(raw, compresslevel=9, mtime=0)
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_bytes(data)
    temporary.replace(path)
    return data


def build(args):
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.fs as fs
    import pyarrow.parquet as pq
    if not re.fullmatch(r'20\d{2}-\d{2}-\d{2}\.\d+', args.release):
        raise ValueError('Supply an explicit Overture release.')
    cache, output = Path(args.cache), Path(args.output)
    if output.exists():
        raise ValueError('Use a new output directory; incomplete work resumes only in cache.')
    cache.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(cache).free < 2 * 2**30:
        raise ValueError('At least 2 GiB of free space is required for this bounded extract.')
    pa.set_cpu_count(2)
    pa.set_io_thread_count(4)
    source = inventory(args.release)
    builder_hash = sha(Path(__file__).read_bytes())
    s3 = fs.S3FileSystem(anonymous=True, region='us-west-2', connect_timeout=10, request_timeout=25)
    plans = []
    for index, item in enumerate(source['files']):
        with s3.open_input_file(BUCKET + '/' + item['key']) as remote:
            metadata = pq.ParquetFile(remote).metadata
        groups = selected_groups(metadata)
        plans.append({**item, 'index': index, 'groups': groups})
    source_bytes = sum(group['bytes'] for plan in plans for group in plan['groups'])
    if source_bytes > args.max_source_mib * 2**20:
        raise ValueError(f'Selected source columns exceed {args.max_source_mib} MiB.')
    print(json.dumps({'plannedGroups': sum(len(p['groups']) for p in plans), 'selectedMiB': round(source_bytes / 2**20, 1)}), flush=True)

    def extract(plan):
        paths = []
        with s3.open_input_file(BUCKET + '/' + plan['key']) as remote:
            parquet = pq.ParquetFile(remote, pre_buffer=True)
            for group in plan['groups']:
                identity = {'builder': builder_hash, 'key': plan['key'], 'etag': plan['etag'], 'group': group['index']}
                target = cache / (sha(encoded(identity)) + '.json.gz')
                if target.exists():
                    saved = json.loads(gzip.decompress(target.read_bytes()))
                    if saved.get('identity') != identity:
                        raise ValueError('Checkpoint identity mismatch.')
                else:
                    table = parquet.read_row_group(group['index'], columns=COLUMNS)
                    mask = pc.is_in(pc.struct_field(table['taxonomy'], 'primary'), value_set=pa.array(sorted(CATEGORIES)))
                    rows = [record for row in table.filter(mask).to_pylist() for record in normalize(row, plan['index'], group['index'])]
                    write_gzip(target, {'identity': identity, 'records': rows})
                paths.append(target)
                if len(paths) % 25 == 0:
                    print(json.dumps({'file': plan['index'], 'groupsDone': len(paths), 'groupsTotal': len(plan['groups'])}), flush=True)
        return paths

    with ThreadPoolExecutor(max_workers=2) as pool:
        checkpoints = [path for paths in pool.map(extract, [p for p in plans if p['groups']]) for path in paths]
    regions = {state: {} for state in STATES}
    for checkpoint in checkpoints:
        for row in json.loads(gzip.decompress(checkpoint.read_bytes()))['records']:
            key = (row['id'], row['address'], row['city'])
            if key in regions[row['state']]:
                raise ValueError('Duplicate source place/address identity.')
            regions[row['state']][key] = row
    if any(not rows for rows in regions.values()):
        raise ValueError('No complete nationwide catalogue: at least one state is empty.')
    output.mkdir(parents=True)
    states, output_bytes = [], 0
    for state, indexed in regions.items():
        rows = sorted(indexed.values(), key=lambda row: (row['city'].casefold(), row['name'].casefold(), row['id'], row['address']))
        data = write_gzip(output / (state + '.json.gz'), rows)
        output_bytes += len(data)
        states.append({'state': state, 'records': len(rows), 'withWebsite': sum(bool(r['websites']) for r in rows),
                       'withPhone': sum(bool(r['phones']) for r in rows), 'withEmail': sum(bool(r['emails']) for r in rows),
                       'sha256': sha(data), 'bytes': len(data)})
    manifest = {'schemaVersion': 1, 'release': args.release, 'checkedAt': datetime.now(timezone.utc).isoformat(),
                'sourceURL': SOURCE_URL, 'sourceInventory': source, 'builderSha256': builder_hash,
                'categories': sorted(CATEGORIES), 'selectedSourceBytes': source_bytes, 'outputBytes': output_bytes,
                'records': sum(row['records'] for row in states), 'states': states,
                'limits': 'Published business channels, not owner identities. Source dates/addresses may be outdated. Missing fields and unmatched offices remain unknown; source/business review is required.'}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'complete': True, 'records': manifest['records'], 'states': len(states), 'outputMiB': round(output_bytes / 2**20, 1)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', required=True)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-source-mib', type=int, default=3072)
    build(parser.parse_args())
