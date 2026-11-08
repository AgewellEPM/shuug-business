#!/usr/bin/env python3
"""Build a local, searchable gallery from complete native app captures."""
import argparse
import html
import re
import struct
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder',type=Path)
args=parser.parse_args()
folder=args.folder.resolve()
screens=[]
for path in sorted(folder.glob('*.png')):
    data=path.read_bytes()
    if data.startswith(bytes.fromhex('89504e470d0a1a0a')) and data[-8:]==b'IEND'+bytes.fromhex('ae426082'):
        code=path.stem.split(' - ',1)[0]
        match=re.fullmatch(r'(.*?)(F\d*|R\d*)?',code)
        group,version=match.groups()
        version=version or ''
        rank=(300 if version.startswith('F') else 200 if version.startswith('R') else 100)+int(re.sub(r'\D','',version) or '0')
        width,height=struct.unpack('>II',data[16:24])
        screens.append({'path':path,'group':group,'version':version,'rank':rank,'review':version.startswith('F'),'diagnostic':code.startswith('00-'),'landscape':width>height})
preferred={}
for screen in screens:
    previous=preferred.get(screen['group'])
    if previous is None or (screen['rank'],screen['path'].stat().st_mtime)>(previous['rank'],previous['path'].stat().st_mtime):preferred[screen['group']]=screen
cards=[]
for screen in screens:
    path=screen['path'];current=preferred[screen['group']] is screen
    badge=('Review build · '+screen['version']) if screen['review'] else ('Earlier capture · '+screen['version'] if screen['version'] else 'Earlier capture')
    if not current:badge+=' · superseded'
    label=html.escape(path.stem);name=html.escape(path.name,quote=True)
    cards.append('<article class="'+('landscape' if screen['landscape'] else '')+'" data-review="'+str(int(screen['review']))+'" data-current="'+str(int(current))+'" data-diagnostic="'+str(int(screen['diagnostic']))+'"><a href="'+name+'"><img loading="lazy" src="'+name+'" alt="'+html.escape(path.stem,quote=True)+'"><small>'+html.escape(badge)+'</small><span>'+label+'</span></a></article>')
review_count=sum(s['review'] and preferred[s['group']] is s for s in screens)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gig Tax Pros · Android screens</title>
<style>body{margin:0;background:#03060c;color:#fff;font:16px system-ui;padding:28px}h1{font-size:30px;margin:0 0 12px}p{color:#d5d1df;max-width:860px;line-height:1.5}input,select{box-sizing:border-box;width:100%;max-width:720px;background:#16101f;border:1px solid #9053b7;border-radius:14px;padding:14px;color:white;font:inherit;margin:8px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}article{border:1px solid #553267;border-radius:16px;overflow:hidden;background:#0c0914}a{color:inherit;text-decoration:none}img{width:100%;height:380px;object-fit:contain;background:black}small{display:block;padding:12px 14px 0;color:#e3a0ff}span{display:block;padding:10px 14px 14px;line-height:1.4}article[hidden]{display:none}@media(min-width:700px){article.landscape{grid-column:span 2}}</style>
<h1>Gig Tax Pros · Android screens</h1><p>REVIEW_COUNT latest review-build captures are shown by default. Earlier screenshots remain preserved under the other views. Open an image at its original size. See CAPTURE NOTES.txt for the exact verification limits.</p>
<select id="scope" aria-label="Capture version"><option value="review">Final review build · F2/F</option><option value="latest">All features · latest available capture</option><option value="all">Complete capture history</option></select>
<input id="search" type="search" placeholder="Find a screen or feature…" aria-label="Find a screen or feature"><p id="count" aria-live="polite"></p><main class="grid">CARDS</main>
<script>const search=document.getElementById('search'),scope=document.getElementById('scope');function filter(){const q=search.value.toLocaleLowerCase();let shown=0;document.querySelectorAll('article').forEach(a=>{const version=scope.value==='all'||(a.dataset.current==='1'&&a.dataset.diagnostic!=='1'&&(scope.value!=='review'||a.dataset.review==='1'));a.hidden=!version||!a.textContent.toLocaleLowerCase().includes(q);if(!a.hidden)shown++});document.getElementById('count').textContent=shown+' shown · CAPTURE_COUNT complete captures preserved'}search.addEventListener('input',filter);scope.addEventListener('change',filter);filter()</script></html>'''
target=folder/'Open Android Screen Gallery.html'
target.write_text(page.replace('CAPTURE_COUNT',str(len(screens))).replace('REVIEW_COUNT',str(review_count)).replace('CARDS','\n'.join(cards)))
print(target)
print(str(len(screens))+' complete native screenshots')
print(str(review_count)+' preferred review-build screenshots')
