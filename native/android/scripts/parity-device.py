#!/usr/bin/env python3
"""Inspect/capture an explicitly selected existing Android parity device.

Uses the native accessibility hierarchy and adb only. Never creates a device,
changes app data, starts a browser, or dispatches an action without a command.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial',required=True)
    parser.add_argument('--output',type=Path,default=Path.home()/'Desktop'/'Gig Tax Pros Android Screens - 2026-11-07')
    parser.add_argument('--adb',default=str(Path.home()/'Library/Android/sdk/platform-tools/adb'))
    commands=parser.add_subparsers(dest='command',required=True)
    commands.add_parser('tree')
    capture=commands.add_parser('snapshot');capture.add_argument('label')
    tap=commands.add_parser('tap');tap.add_argument('label');tap.add_argument('--contains',action='store_true');tap.add_argument('--index',type=int,default=0)
    commands.add_parser('back')
    swipe=commands.add_parser('swipe');swipe.add_argument('direction',choices=['up','down']);swipe.add_argument('--fraction',type=float,default=.55)
    text=commands.add_parser('text');text.add_argument('value')
    args=parser.parse_args()
    base=[args.adb,'-s',args.serial]
    def adb(*parts,binary=False):
        return subprocess.run(base+list(parts),check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30).stdout if binary else subprocess.run(base+list(parts),check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30,text=True).stdout
    state=adb('get-state').strip()
    if state!='device':raise RuntimeError('The explicitly selected device is not available: '+state)
    def hierarchy():
        adb('shell','uiautomator','dump','/sdcard/gigtax-parity-window.xml')
        data=adb('exec-out','cat','/sdcard/gigtax-parity-window.xml',binary=True)
        root=ET.fromstring(data)
        # This helper controls only the requested app or an OS consent surface.
        packages={node.get('package') for node in root.iter('node') if node.get('package')}
        allowed={'com.ridesharetaxpros.driver','com.android.systemui','com.google.android.permissioncontroller','com.android.permissioncontroller'}
        if packages and not packages.issubset(allowed):raise RuntimeError('Unexpected foreground surface: '+', '.join(sorted(packages)))
        return root,data
    def bounds(node):
        values=[int(x) for x in re.findall(r'\d+',node.get('bounds',''))]
        return values if len(values)==4 and values[2]>values[0] and values[3]>values[1] else None
    if args.command=='tree':
        root,_=hierarchy()
        for node in root.iter('node'):
            label=node.get('text') or node.get('content-desc')
            if label and bounds(node):print(json.dumps({'text':label,'bounds':bounds(node),'clickable':node.get('clickable'),'enabled':node.get('enabled')},ensure_ascii=False))
    elif args.command=='tap':
        root,_=hierarchy();matches=[]
        for node in root.iter('node'):
            labels=[node.get('text',''),node.get('content-desc','')]
            match=any(args.label in label for label in labels) if args.contains else args.label in labels
            if match and bounds(node) and node.get('enabled')!='false':matches.append(node)
        matches.sort(key=lambda node:node.get('clickable')!='true')
        if args.index<0 or args.index>=len(matches):raise RuntimeError(f'Visible enabled target not found: {args.label!r}; matches={len(matches)}')
        x1,y1,x2,y2=bounds(matches[args.index]);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
        print(json.dumps({'tapped':args.label,'bounds':[x1,y1,x2,y2]}))
    elif args.command=='snapshot':
        _,tree=hierarchy()
        args.output.mkdir(parents=True,exist_ok=True)
        label=re.sub(r'[^\w .&+()-]','_',args.label).strip()[:140]
        if not label:raise RuntimeError('A descriptive screen name is required.')
        target=args.output/(label+'.png')
        if target.exists():raise RuntimeError('Keep the earlier evidence; choose another label: '+str(target))
        image=adb('exec-out','screencap','-p',binary=True)
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):raise RuntimeError('The device did not return a PNG screenshot.')
        target.write_bytes(image);target.with_suffix('.xml').write_bytes(tree)
        index=args.output/'capture-index.jsonl'
        with index.open('a') as output:output.write(json.dumps({'screen':args.label,'file':target.name,'device':args.serial,'capturedAt':dt.datetime.now(dt.timezone.utc).isoformat()})+'\n')
        print(target)
    elif args.command=='back':adb('shell','input','keyevent','KEYCODE_BACK')
    elif args.command=='text':
        # adb input text has a deliberately restricted shell syntax. Avoid any
        # quoting or remote-shell interpretation of arbitrary input.
        if not re.fullmatch(r'[A-Za-z0-9 .,@_+:/=-]{1,2000}',args.value):raise RuntimeError('Use plain ASCII form input without shell metacharacters.')
        adb('shell','input','text',args.value.replace(' ','%s'))
    elif args.command=='swipe':
        size=adb('shell','wm','size');match=re.search(r'(\d+)x(\d+)',size)
        if not match:raise RuntimeError('Cannot read the selected device display size.')
        width,height=map(int,match.groups());fraction=max(.1,min(.7,args.fraction));center=int(height*.52);delta=int(height*fraction/2)
        y1,y2=(center+delta,center-delta) if args.direction=='up' else (center-delta,center+delta)
        adb('shell','input','swipe',str(width//2),str(y1),str(width//2),str(y2),'500')


if __name__=='__main__':
    try:main()
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired,RuntimeError,ET.ParseError) as failure:
        print(str(failure),file=sys.stderr)
        sys.exit(1)
