"""Edit live action clips into an app-display-only lesson, with one synchronized instruction at a time."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recording',type=Path)
parser.add_argument('--install',action='store_true')
args = parser.parse_args()
OUT = args.recording/'finished'; OUT.mkdir(exist_ok=True)
report = json.loads((args.recording/'actions.json').read_text())
assert report['ok'] and report['normalJournalPreserved']
clips = report['clips']; assert clips and all(c['events'] for c in clips)
edits_path = args.recording/'edit-ranges.json'
edits = json.loads(edits_path.read_text()) if edits_path.exists() else {}

def run(command):
    p = subprocess.run([str(v) for v in command],capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr.decode(errors='replace')[-5000:])

def stamp(value):
    n=round(value*1000)
    return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'

run(['swift',ROOT/'scripts/tour/render-touch.swift',OUT/'touch.png'])
chapter_names = {c['id']:c['title'] for c in json.loads((ROOT/'scripts/tour/chapters.json').read_text())}
timeline, subtitles, chapters = 0.0, [], []
for clip in clips:
    name=clip['id']
    recorded=clip.get('recordElapsed',max(clip['duration'],max(e['end'] for e in clip['events'])+.8))
    # simctl omits unchanged tail frames. Restore only time that was actually
    # recorded, stopping as soon as the action and its short narration finish.
    # Cut the test runner's search/reveal lead-in. Begin just before the actual
    # touch, so the spoken instruction accompanies its tap and typing.
    first=max(.1,min(clip['events'][0]['start']+.25-.8,recorded-clip['voiceDuration']-.55))
    end=min(recorded-.05,max(clip['rawDuration']-.05,max(e['end'] for e in clip['events'])+.5,first+clip['voiceDuration']+.5))
    length=math.floor((end-first)*30)/30
    ranges=[[first,first+length]]
    if name in edits:
        edit=edits[name]
        assert hashlib.sha256((args.recording/(name+'-raw.mp4')).read_bytes()).hexdigest()==edit['sourceSHA256']
        ranges=edit['keep']
        assert all(0<=a<b<=recorded for a,b in ranges)
        assert all(a[1]<=b[0] for a,b in zip(ranges,ranges[1:]))
        # Every dispatched tap remains in the lesson. Only reviewed pauses or
        # unsuccessful test-runner scrolling may be removed between actions.
        assert all(any(a<=e['start']+.25<b for a,b in ranges) for e in clip['events'])
        length=sum(b-a for a,b in ranges)
    tail=max(0,ranges[-1][1]-clip['rawDuration'])
    assert length>=clip['voiceDuration']+.15
    width=1920; height=round(clip['height']*width/clip['width']/2)*2
    rotation='transpose='+clip['transpose']+',' if clip.get('transpose') else ''
    graph=[f'[0:v]{rotation}fps=30,tpad=stop_mode=clone:stop_duration={tail+.05:.6f},split={len(ranges)}'+''.join(f'[raw{i}]' for i in range(len(ranges)))]
    for i,(a,b) in enumerate(ranges): graph.append(f'[raw{i}]trim=start={a:.6f}:end={b:.6f},setpts=PTS-STARTPTS[part{i}]')
    graph.append(''.join(f'[part{i}]' for i in range(len(ranges)))+f'concat=n={len(ranges)}:v=1:a=0,scale={width}:{height},setsar=1[scene0]')
    events=clip['events']
    graph.append('[2:v]format=rgba,split='+str(len(events))+''.join(f'[touch{i}]' for i in range(len(events))))
    for i,event in enumerate(events):
        # The test records the real control's bounds around its tap dispatch.
        def edited_time(t): return sum(max(0,min(t,b)-a) for a,b in ranges)
        start=edited_time(event['start']+.25); end=min(length,edited_time(event['end']+.55))
        x=max(0,min(width-120,event['x']*width-60)); y=max(0,min(height-120,event['y']*height-60))
        graph += [f'[touch{i}]fade=t=in:st={start:.4f}:d=0.08:alpha=1,fade=t=out:st={max(start,end-.15):.4f}:d=0.15:alpha=1[pulse{i}]',
          f"[scene{i}][pulse{i}]overlay={x:.2f}:{y:.2f}:enable='between(t,{start:.4f},{end:.4f})'[scene{i+1}]"]
    movie=OUT/(name+'.mp4')
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',args.recording/(name+'-raw.mp4'),'-i',args.recording/(name+'.aiff'),'-loop','1','-i',OUT/'touch.png',
      '-filter_complex_threads','2','-filter_complex',';'.join(graph),'-map',f'[scene{len(events)}]','-map','1:a:0','-af','adelay=200:all=1,apad','-t',f'{length:.6f}',
      '-c:v','libx264','-threads','4','-preset','medium','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','44100','-movflags','+faststart',movie])
    if not chapters or chapters[-1]['id']!=clip['chapter']:
        chapters.append(dict(id=clip['chapter'],title=chapter_names[clip['chapter']],start=timeline,duration=0,narration=''))
    chapters[-1]['duration']+=length; chapters[-1]['narration']+=((' ' if chapters[-1]['narration'] else '')+clip['narration'])
    subtitles.append(f'{len(subtitles)+1}\n{stamp(timeline+.2)} --> {stamp(timeline+length-.1)}\n{clip["narration"]}\n')
    clip.update(start=timeline,duration=length,restoredRecorderIdleSeconds=tail,sourceRanges=ranges)
    timeline+=length
    print(f'Rendered action {name}: {length:.1f}s, {len(events)} visible taps',flush=True)
(OUT/'concat.txt').write_text(''.join("file '"+str(OUT/(c['id']+'.mp4'))+"'\n" for c in clips))
(OUT/'GettingStarted.en.srt').write_text('\n'.join(subtitles))
metadata=[';FFMETADATA1','title=Getting started with Gig Tax Pros']
for c in chapters: metadata+=['[CHAPTER]','TIMEBASE=1/1000',f'START={round(c["start"]*1000)}',f'END={round((c["start"]+c["duration"])*1000)}','title='+c['title']]
(OUT/'chapters.metadata').write_text('\n'.join(metadata)+'\n')
movie=OUT/'GettingStarted.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',OUT/'concat.txt','-i',OUT/'GettingStarted.en.srt','-f','ffmetadata','-i',OUT/'chapters.metadata',
  '-map','0:v:0','-map','0:a:0','-map','1:0','-map_metadata','2','-c','copy','-c:s','mov_text','-metadata:s:s:0','language=eng','-disposition:s:0','default','-movflags','+faststart',movie])
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','0.2','-i',movie,'-frames:v','1','-q:v','2',OUT/'GettingStartedPoster.jpg'])
(OUT/'GettingStartedTour.json').write_text(json.dumps(dict(duration=timeline,chapters=chapters),indent=2)+'\n')
proof=dict(ok=True,duration=timeline,actions=len(clips),chapterCount=len(chapters),sha256=hashlib.sha256(movie.read_bytes()).hexdigest(),
  sizeBytes=movie.stat().st_size,fullAppDisplay=True,editorialFreezeFrames=False,normalJournalPreserved=True,
  restoredRecorderIdleSeconds=sum(c['restoredRecorderIdleSeconds'] for c in clips),
  reviewedCuts=edits,
  actionsTimeline=[dict(id=c['id'],start=c['start'],duration=c['duration'],sourceRanges=c['sourceRanges'],tapCount=len(c['events']),
    sourceSHA256=hashlib.sha256((args.recording/(c['id']+'-raw.mp4')).read_bytes()).hexdigest()) for c in clips],
  design='App display only. Real taps and typing. One synchronized instruction per action. Native selectable captions. No panels, phone bezel or artwork.')
(OUT/'verification.json').write_text(json.dumps(proof,indent=2)+'\n')
if args.install:
    assert len(chapters)==13 and len(clips)==54, 'Only install the complete walkthrough.'
    import shutil
    for name in ['GettingStarted.mp4','GettingStartedPoster.jpg','GettingStartedTour.json','GettingStarted.en.srt']:
        shutil.copyfile(OUT/name,ROOT/'native/ios/RideshareTaxPros/Resources'/name)
print(json.dumps(proof,indent=2),flush=True)
