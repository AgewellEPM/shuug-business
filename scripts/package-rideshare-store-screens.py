#!/usr/bin/env python3
"""Copy genuine historic screenshot candidates; never manufacture current-build proof."""
import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

SELECTED = ['02-01-1', '03-04-1', '08-01-1', '10-03-1', '04-01-1', '01-01']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists(), 'Choose a fresh output directory; preserve earlier packages.'
index = {item['id']: item for item in json.loads((args.source / 'screen-index.json').read_text())}
candidates = []
for number, identity in enumerate(SELECTED, 1):
    item = index[identity]
    source = args.source / item['file']
    assert source.parent.resolve() == args.source.resolve(), 'Unexpected screenshot path'
    data = source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == item['sha256'], 'Capture digest mismatch'
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'PNG required'
    dimensions = struct.unpack('>II', data[16:24])
    assert dimensions == (1320, 2868), 'Unexpected original capture dimensions'
    assert data[25] in (0, 2), 'Remove screenshot alpha through a reviewed export before submission'
    candidates.append((source, f'{number:02}-{identity}.png', item, dimensions))
args.output.mkdir(parents=True, mode=0o700)
receipt = {'status': 'historic candidates; refresh against current release before submission',
           'captureDate': '2026-11-07', 'device': 'iPhone 17 Pro Max Simulator',
           'currentBuildVerified': False, 'iPadScreenshotsIncluded': False, 'screenshots': []}
for source, name, item, dimensions in candidates:
    shutil.copyfile(source, args.output / name)
    receipt['screenshots'].append({'file': name, 'title': item['title'], 'source': str(source),
                                   'dimensions': dimensions, 'sha256': item['sha256']})
(args.output / 'provenance.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(f'Prepared {len(candidates)} historic candidates in {args.output}; current-release and iPad captures remain required.')
