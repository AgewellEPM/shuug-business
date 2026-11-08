"""Create the local screenshot gallery and archive exact duplicate captures."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import struct

def write_gallery(items, output):
    cards = []
    for item in sorted(items, key=lambda x: x['id']):
        label, route, mode, file = (html.escape(str(item[key]), quote=True) for key in ['title', 'route', 'mode', 'file'])
        cards.append(f'<figure><a href="{file}"><img loading="lazy" src="{file}" alt="{label}"></a><figcaption><strong>{html.escape(item["id"])} · {label}</strong><p>{route}</p><small>{mode}</small></figcaption></figure>')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gig Tax Pros — Screen catalogue</title><style>
body{margin:0;background:#03060c;color:#fff;font:16px Arial,sans-serif;padding:40px}h1{font-size:40px;letter-spacing:-.04em}header{max-width:900px;margin-bottom:32px}header p,figcaption p{color:#d5d1df;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}figure{margin:0;padding:14px;border:1px solid #9053b7;border-radius:20px;background:linear-gradient(145deg,#1d122c,#080b12)}figure[hidden]{display:none}img{width:100%;height:500px;object-fit:contain;background:#000;border-radius:12px}figcaption{padding:14px 4px}small,a{color:#e3a0ff}a:focus,input:focus{outline:3px solid #f70ce8}input{display:block;width:min(100%,580px);box-sizing:border-box;background:#181020;border:1px solid #9053b7;border-radius:12px;padding:15px;color:white;font:inherit;margin-top:10px}@media(max-width:600px){body{padding:18px}h1{font-size:30px}}</style>
<header><h1>Gig Tax Pros<br>The app, screen by screen.</h1><p>COUNT native iPhone Simulator screenshots. Select an image to open it at full resolution. Filenames identify the feature; captions show how to reach it. Built-in sample data and interactive practice are labeled.</p><p><a href="CAPTURE%20NOTES.txt">Capture notes and unavailable screens</a></p><label>Find a screen<input type="search" placeholder="Try offers, expense, privacy, or tour" aria-label="Find a screen"></label><p class="results" role="status" aria-live="polite"></p></header><main class="grid">CARDS</main>
<script>const cards=[...document.querySelectorAll('figure')];document.querySelector('input').addEventListener('input',event=>{const term=event.target.value.toLowerCase().trim();let count=0;for(const card of cards){card.hidden=!card.textContent.toLowerCase().includes(term);if(!card.hidden)count++}document.querySelector('.results').textContent=count+' screenshots shown';});</script></html>'''
    (output/'Open Screen Gallery.html').write_text(page.replace('COUNT', str(len(items))).replace('CARDS', ''.join(cards)))

def finalize(output, archive):
    items = sorted(json.loads((output/'screen-index.json').read_text()), key=lambda x: x['id'])
    archive.mkdir(parents=True, exist_ok=True)
    unique, seen, duplicates = [], {}, []
    for item in items:
        file = output/item['file']
        if file.parent != output or file.suffix != '.png': raise ValueError('Unexpected screenshot path')
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']: raise ValueError('Screenshot digest changed: '+file.name)
        if raw[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('Not a PNG: '+file.name)
        width, height = struct.unpack('>II', raw[16:24])
        # XCUIScreenshot can encode portrait pixels with orientation metadata
        # for a landscape image. Keep both encoded and displayed dimensions.
        expected = (item['width'], item['height'])
        if (width, height) not in (expected, expected[::-1]): raise ValueError('Screenshot dimensions changed')
        item.update(encodedWidth=width, encodedHeight=height)
        if item['sha256'] in seen:
            shutil.move(str(file), archive/file.name)
            duplicates.append({'file': item['file'], 'sameAs': seen[item['sha256']]})
        else:
            seen[item['sha256']] = item['file']; unique.append(item)
    (archive/'duplicates.json').write_text(json.dumps(duplicates, indent=2)+'\n')
    (output/'screen-index.json').write_text(json.dumps(unique, indent=2)+'\n')
    (output/'CAPTURE NOTES.txt').write_text(f'''GIG TAX PROS — iOS SCREEN COLLECTION

{len(unique)} distinct full-resolution PNG captures from the installed app in the existing iPhone 17 Pro Max Simulator. Portrait and landscape tour playback are included. Exact duplicate scroll captures were archived separately.

Open "Open Screen Gallery.html" for the searchable gallery. Each image name identifies the screen; the gallery and screen-index.json also give its navigation path. Numbered pages cover longer screens. Sample earnings, sample offer decisions and screenshot lessons are labeled as built-in examples or practice.

COVERED
Getting started, landscape guidance, video player, chapters and written transcript; Home and tools; drive setup, trips and manual trip forms; Go Home mission and offer planning; Position; earnings, goals and built-in sample results; income, expenses, categories and details; bank review and statement import; offer inbox, manual offer form, screenshot import and reader setup; platform settings, connected jobs, reserves and history; all five capture-diagnostics pages; screenshot lessons for both iPhone button styles and both import paths; universal delivery and in-store shopper profiles; account setup, privacy, reminders, rewards, Tax & Goals, ratings/reviews, and office help.

NOT AVAILABLE IN THIS PREVIEW
This is an unconnected guest profile. Signed-in tax documents, protected-key enrollment and encrypted snapshots, live bank/provider authorization, connected transactions/jobs, reward redemption, saved-record detail/edit views, and account-specific sync/conflict states require the corresponding account or records. Their available setup/empty screens are included. Live tracking, physical camera/ReplayKit capture, the actual iOS share-extension handoff, third-party gig apps, and office actions require their real environment; the practice guide is not a photograph of those external screens.

No drives, financial entries, offers, ratings, reviews, account connections, calls or bookings were created. Existing journal bytes were verified unchanged after each capture run. Screenshots are local; this collection was not published to the website or GitHub. Physical-iPhone behavior and visual acceptance remain separate from these Simulator captures.
''')
    write_gallery(unique, output)
    print(json.dumps({'screenshots': len(unique), 'archivedDuplicateCaptures': len(duplicates), 'output': str(output)}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--archive', type=Path, required=True)
    arguments = parser.parse_args()
    finalize(arguments.output.resolve(), arguments.archive.resolve())
