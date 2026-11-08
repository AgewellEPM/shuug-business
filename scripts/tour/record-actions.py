"""Record paced, real app interactions on the existing preview, in a separate practice journal."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
import uuid
import plistlib

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = 'com.ridesharetaxpros.driver'
RUNNER = BUNDLE + '.uitests.xctrunner'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--device', default='65176034-9B90-4191-8E4F-870D34082F9A')
parser.add_argument('--limit', type=int)
parser.add_argument('--reuse', type=Path, help='Keep verified earlier clips while replaying their inputs in the new practice session.')
parser.add_argument('--rerecord', action='append', default=[], help='Capture this action again while reusing other earlier clips.')
parser.add_argument('--seed-practice', type=Path, help='Resume from a previously captured isolated practice journal.')
parser.add_argument('--skip-before', help='With a matching practice seed, skip earlier replay inputs and resume at a step reachable from Home.')
args = parser.parse_args()
assert shutil.disk_usage(Path.home()).free >= 1_000_000_000, 'At least 1 GB of internal free space is needed for the native test runner.'
OUT = args.output.resolve(); OUT.mkdir(parents=True, exist_ok=False)
DERIVED = Path('/private/tmp/gigtax-telemetry-ios-build')
APP = DERIVED/'Build/Products/Debug-iphonesimulator/RideshareTaxPros.app'
test = recorder = None
report = {'ok': False, 'device': args.device, 'scope': 'Real native app interactions in a separate debug practice journal', 'clips': []}
previous = json.loads((args.reuse/'actions.json').read_text()) if args.reuse else None
if previous: assert previous['normalJournalPreserved']
reusable = {c['id']: c for c in previous['clips'] if c['id'] not in args.rerecord} if previous else {}

def call(*command, check=True, timeout=60):
    p = subprocess.run([str(v) for v in command], capture_output=True, text=True, timeout=timeout)
    if check and p.returncode: raise RuntimeError(p.stderr[-3000:] or p.stdout[-3000:])
    return p

def container(bundle, kind='data'):
    p = call('xcrun', 'simctl', 'get_app_container', args.device, bundle, kind, check=False)
    return Path(p.stdout.strip()) if p.returncode == 0 else None

def snapshot():
    data = container(BUNDLE)
    base = data/'Library/Application Support/RideshareTaxPros'
    return {str(p.relative_to(base)): hashlib.sha256(p.read_bytes()).hexdigest() for p in base.rglob('*') if p.is_file()}

def stop(process, signum=signal.SIGTERM):
    if process and process.poll() is None:
        process.send_signal(signum)
        try: process.wait(timeout=20)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)

def read(path):
    try: return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError): return None

def wait_for(predicate, timeout, message):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result: return result
        if test and test.poll() is not None: raise RuntimeError('UI walkthrough stopped. Inspect capture.log.')
        time.sleep(.05)
    raise RuntimeError(message)

def interrupted(signum, frame): raise KeyboardInterrupt('Recording interrupted; captured clips are preserved.')
signal.signal(signal.SIGTERM, interrupted)
before = snapshot()
steps = []
lines = (ROOT/'scripts/tour/action-script.txt').read_text().splitlines()
for line in lines[:args.limit] if args.limit else lines:
    identifier, chapter, title, narration = line.split('|')
    voice = OUT/(identifier+'.aiff')
    text = OUT/(identifier+'.txt'); text.write_text(narration)
    if identifier in reusable and reusable[identifier]['narration']==narration:
        shutil.copyfile(args.reuse/(identifier+'.aiff'),voice)
    else: call('/usr/bin/say', '-v', 'Samantha', '-r', '168', '-f', text, '-o', voice)
    seconds = float(call('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', voice).stdout)
    steps.append(dict(id=identifier, chapter=chapter, title=title, narration=narration, voiceDuration=seconds, duration=max(4.4, seconds+1.8)))
if args.limit: steps = steps[:args.limit]
skip_before=next((i for i,s in enumerate(steps) if s['id']==args.skip_before),0)
if args.skip_before: assert args.seed_practice and skip_before>0
(OUT/'plan.json').write_text(json.dumps(steps, indent=2)+'\n')
try:
    devices = json.loads(call('xcrun','simctl','list','devices','booted','--json').stdout)['devices']
    active = [d for group in devices.values() for d in group]
    assert len(active) == 1 and active[0]['udid'] == args.device, 'Use only the existing preview.'
    assert call('pgrep','-fl','qemu-system|emulator/qemu|IsolatedTester.app/Contents/MacOS/IsolatedTester',check=False).returncode == 1, 'Another guest is active.'
    call('xcrun','simctl','terminate',args.device,BUNDLE,check=False)
    call('xcrun','simctl','install',args.device,APP)
    runner = container(RUNNER)
    if runner and (runner/'Documents/ActionTour').exists(): shutil.rmtree(runner/'Documents/ActionTour')
    call('xcrun','simctl','status_bar',args.device,'override','--time','9:41','--dataNetwork','wifi','--wifiMode','active','--wifiBars','3','--batteryState','charged','--batteryLevel','100')
    call('open','-a','Simulator','--args','-CurrentDeviceUDID',args.device)
    command = ['xcodebuild','-project',ROOT/'native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj','-scheme','RideshareTaxPros','-destination','id='+args.device,
      '-derivedDataPath',DERIVED,'-resultBundlePath',OUT/'Actions.xcresult','-parallel-testing-enabled','NO','-disableAutomaticPackageResolution',
      '-only-testing:RideshareTaxProsUITests/TourActionRecordingFlows/testRecordInteractiveTour',
      '-test-timeouts-enabled','YES','-default-test-execution-time-allowance','1800','-maximum-test-execution-time-allowance','1800',
      'CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','test-without-building']
    with (OUT/'capture.log').open('w') as log:
        test = subprocess.Popen([str(c) for c in command],stdout=log,stderr=subprocess.STDOUT)
        # Xcode may replace the runner's data container during installation.
        # Resolve the current container when its first handshake actually exists.
        def first_directory():
            runner = container(RUNNER)
            directory = runner/'Documents/ActionTour' if runner else None
            return directory if directory and read(directory/'ready.json') else None
        directory = wait_for(first_directory,90,'Test runner did not become ready')
        prepared=read(directory/'ready.json'); assert prepared['id']=='prepare-session'
        report['rehearsalID']=prepared['rehearsalID']
        if args.seed_practice:
            source_report=json.loads((args.seed_practice/'actions.json').read_text())
            assert source_report['normalJournalPreserved']
            seed=args.seed_practice/'PracticeJournal'; assert seed.is_dir()
            destination=container(BUNDLE)/'Library/Caches/TourRehearsals'/str(uuid.UUID(prepared['rehearsalID'])).upper()
            shutil.copytree(seed,destination)
            report['practiceSeed']=str(args.seed_practice)
        (directory/'prepare-ack.json').write_text('{}')
        for index, step in enumerate(steps):
            ready = wait_for(lambda: (r if r and r.get('id') == step['id'] else None) if (r := read(directory/'ready.json')) else None,120,'Step not ready: '+step['id'])
            report['rehearsalID'] = ready['rehearsalID']
            if step['id'] in reusable:
                clip = reusable[step['id']]
                assert clip['narration']==step['narration']
                temporary=directory/('ack-'+step['id']+'.tmp')
                # This complete practice guide changes no journal state and
                # ends back on Offers. Its verified footage needs no replay.
                skip_guide=index<skip_before or step['chapter'] in ('screenshots','review') and step['id']!='offers-open'
                temporary.write_text(json.dumps({'duration': .8,'last': index==len(steps)-1,'skipBody':skip_guide}))
                temporary.replace(directory/('ack-'+step['id']+'.json'))
                wait_for(lambda: read(directory/('done-'+step['id']+'.json')),120,'Replay did not complete: '+step['id'])
                shutil.copyfile(args.reuse/(step['id']+'-raw.mp4'),OUT/(step['id']+'-raw.mp4'))
                report['clips'].append(dict(clip,reusedFrom=str(args.reuse),replaySkipped=skip_guide))
                (OUT/'actions.json').write_text(json.dumps(report,indent=2)+'\n')
                print(f"{'Retained verified' if skip_guide else 'Replayed'} {index+1}/{len(steps)}: {step['title']}",flush=True)
                continue
            movie, recording_log = OUT/(step['id']+'-raw.mp4'), OUT/(step['id']+'-record.log')
            with recording_log.open('w') as recording:
                recorder = subprocess.Popen(['xcrun','simctl','io',args.device,'recordVideo','--codec=h264',str(movie)],stdout=recording,stderr=subprocess.STDOUT)
                wait_for(lambda: 'Recording started' in recording_log.read_text(),30,'Recorder did not become ready')
                time.sleep(.25)
                ack = {'duration': step['duration'], 'last': index == len(steps)-1}
                temporary = directory/('ack-'+step['id']+'.tmp'); temporary.write_text(json.dumps(ack)); temporary.replace(directory/('ack-'+step['id']+'.json'))
                done = wait_for(lambda: read(directory/('done-'+step['id']+'.json')),120,'Step did not complete: '+step['id'])
                stop(recorder,signal.SIGINT); assert recorder.returncode == 0
            streams = json.loads(call('ffprobe','-v','error','-show_format','-show_streams','-of','json',movie).stdout)
            video = next(s for s in streams['streams'] if s['codec_type']=='video')
            # simctl stores the physical portrait canvas even while UIKit is
            # landscape. Rotate those recorded pixels into the app orientation.
            portrait = video['width'] < video['height']
            clip = dict(**step, events=done['events'], recordElapsed=done['elapsed']+.25, rawDuration=float(streams['format']['duration']),
              width=video['height'] if portrait else video['width'], height=video['width'] if portrait else video['height'],
              transpose='cclock' if portrait else None)
            report['clips'].append(clip); (OUT/'actions.json').write_text(json.dumps(report,indent=2)+'\n')
            print(f"Recorded {index+1}/{len(steps)}: {step['title']} ({clip['rawDuration']:.1f}s)",flush=True)
        wait_for(lambda: read(directory/'complete.json'),20,'Walkthrough did not finish')
        test.wait(timeout=90); assert test.returncode == 0, 'UI action failed; inspect capture.log.'
    report['ok'] = True
finally:
    stop(test); stop(recorder,signal.SIGINT)
    call('xcrun','simctl','terminate',args.device,BUNDLE,check=False)
    call('xcrun','simctl','terminate',args.device,RUNNER,check=False)
    report['normalJournalPreserved'] = snapshot() == before
    data = container(BUNDLE)
    if data and report.get('rehearsalID'):
        folder = data/'Library/Caches/TourRehearsals'/str(uuid.UUID(report['rehearsalID'])).upper()
        if folder.exists():
            shutil.copytree(folder,OUT/'PracticeJournal')
            shutil.rmtree(folder)
    call('xcrun','simctl','status_bar',args.device,'clear',check=False)
    call('xcrun','simctl','launch',args.device,BUNDLE,check=False)
    call('open','-a','Simulator','--args','-CurrentDeviceUDID',args.device,check=False)
    report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    (OUT/'actions.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='clips'},indent=2),flush=True)
assert report['ok'] and report['normalJournalPreserved']
