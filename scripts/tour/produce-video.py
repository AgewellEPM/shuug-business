"""Edit the recorded native app tour, synthesize narration locally, burn captions and bundle the video."""
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RECORDING = Path(sys.argv[1]).resolve()
OUT = RECORDING/'edit-branded'
OUT.mkdir(exist_ok=True)
PREVIEW = '--preview' in sys.argv[2:]
RESOURCE = ROOT/'native/ios/RideshareTaxPros/Resources'
FFMPEG = shutil.which('ffmpeg')
FFPROBE = shutil.which('ffprobe')
assert FFMPEG and FFPROBE

def run(args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def probe(file):
    return json.loads(subprocess.check_output([FFPROBE, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(file)]))

def duration(file): return float(probe(file)['format']['duration'])
def stamp(seconds):
    milliseconds = round(seconds*1000)
    return f'{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02},{milliseconds%1000:03}'

receipt = json.loads((RECORDING/'recording.json').read_text())
assert receipt['ok'] and receipt['ownedSimulatorDeleted'], 'Only finish a verified, cleaned-up recording.'
raw = RECORDING/'app-tour-raw.mp4'
raw_duration = duration(raw)
cuts = json.loads((ROOT/'scripts/tour/verified-cuts.json').read_text())
assert hashlib.sha256(raw.read_bytes()).hexdigest() == cuts['sourceSHA256'], 'Review decoded scene boundaries for this recording before rendering.'
markers = {kind: {} for kind in ['BEGIN', 'END']}
for kind, name, value in re.findall(r'TOUR_(BEGIN|END)\|([a-z_]+)\|([0-9.]+)', (RECORDING/'tour-ui.log').read_text()):
    markers[kind][name] = float(value)
chapters = json.loads((ROOT/'scripts/tour/chapters.json').read_text())
timeline = 0.0
subtitles = []
metadata = [';FFMETADATA1', 'title=Getting started with Gig Tax Pros', 'comment=Recorded native app walkthrough; practice examples are labeled.']
for chapter in chapters:
    name = chapter['id']
    assert name in markers['BEGIN'] and name in markers['END'], 'Missing recorded chapter: '+name
    # Recorder startup and the Simulator clock do not establish video PTS.
    # Use reviewed decoded-frame cuts, guarded by the exact recording digest.
    chapter['rawStart'] = cuts['chapters'][name]['start']
    chapter['rawDuration'] = cuts['chapters'][name]['end'] - chapter['rawStart']
    assert 0 <= chapter['rawStart'] < raw_duration and chapter['rawDuration'] > 2
    voice_text, voice_file = OUT/(name+'.txt'), OUT/(name+'.aiff')
    voice_text.write_text(chapter['narration'])
    run(['/usr/bin/say', '-v', 'Samantha', '-r', '170', '-f', voice_text, '-o', voice_file])
    audio_duration = duration(voice_file)
    chapter['start'], chapter['duration'] = timeline, math.ceil((audio_duration + 0.8) * 30) / 30
    words = chapter['narration'].split()
    chapter['captions'] = []
    for first in range(0, len(words), 19):
        text = ' '.join(words[first:first+19])
        start = 0.4 + audio_duration * first / len(words)
        end = 0.4 + audio_duration * min(first+19, len(words)) / len(words)
        chapter['captions'].append({'text': text, 'start': start, 'end': end})
        subtitles.append(f'{len(subtitles)+1}\n{stamp(timeline+start)} --> {stamp(timeline+end)}\n{text}\n')
    metadata += ['[CHAPTER]', 'TIMEBASE=1/1000', f'START={round(timeline*1000)}', f'END={round((timeline+chapter["duration"])*1000)}', 'title='+chapter['title']]
    timeline += chapter['duration']
(OUT/'plan.json').write_text(json.dumps(chapters, indent=2))
run(['swift', ROOT/'scripts/tour/render-panels.swift', OUT/'plan.json', OUT])
print(f'Narration and captions ready: {timeline/60:.1f} minutes, {len(chapters)} chapters.', flush=True)
for chapter in chapters[:1] if PREVIEW else chapters:
    name, length = chapter['id'], chapter['duration']
    movie = OUT/(name+'.mp4')
    args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
            '-loop', '1', '-i', OUT/(name+'-panel.png'), '-i', OUT/(name+'.aiff'), '-loop', '1', '-i', OUT/'phone-mask.png']
    for number in range(len(chapter['bullets'])): args += ['-loop', '1', '-i', OUT/f'{name}-bullet-{number}.png']
    for number in range(len(chapter['captions'])): args += ['-loop', '1', '-i', OUT/f'{name}-caption-{number}.png']
    speed = min(1, length/chapter['rawDuration'])
    # Simulator recordings omit unchanged frames. Normalize BEFORE cutting so
    # a still scene retains its held frame at the selected in/out timestamps.
    graph = [f'[0:v]fps=30,trim=start={chapter["rawStart"]}:end={chapter["rawStart"]+chapter["rawDuration"]},setpts=(PTS-STARTPTS)*{speed:.8f},scale=440:952,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration={length},format=rgba[rawphone]',
             '[3:v]format=gray[mask]', '[rawphone][mask]alphamerge[phone]',
             '[1:v]setsar=1[panel]', '[panel][phone]overlay=1350:64[scene0]']
    layer = 0
    for number in range(len(chapter['bullets'])):
        start = 0.5 + number * 0.23
        graph += [f'[{4+number}:v]format=rgba,fade=t=in:st={start:.2f}:d=0.45:alpha=1[bullet{number}]',
                  f"[scene{layer}][bullet{number}]overlay=x='88+24*exp(-5*max(0,t-{start:.2f}))':y={490+number*80}[scene{layer+1}]"]
        layer += 1
    for number, caption in enumerate(chapter['captions']):
        graph.append(f"[scene{layer}][{number+4+len(chapter['bullets'])}:v]overlay=118:852:enable='gte(t,{caption['start']:.4f})*lt(t,{caption['end']:.4f})'[scene{layer+1}]")
        layer += 1
    graph.append(f'[scene{layer}]fade=t=in:st=0:d=0.3,fade=t=out:st={length-0.3:.4f}:d=0.3[finished]')
    args += ['-filter_complex', ';'.join(graph), '-map', '[finished]', '-map', '2:a:0', '-af', 'adelay=400:all=1,apad',
             '-t', str(length), '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', movie]
    print('Rendering '+chapter['title'], flush=True)
    try: run(args)
    except subprocess.CalledProcessError as error:
        print(error.stderr.decode(errors='replace')[-4000:]); raise
if PREVIEW:
    print('Preview: '+str(OUT/(chapters[0]['id']+'.mp4')), flush=True)
    raise SystemExit(0)
(OUT/'concat.txt').write_text(''.join("file '"+str(OUT/(c['id']+'.mp4')).replace("'", "'\\''")+"'\n" for c in chapters))
(OUT/'captions.srt').write_text('\n'.join(subtitles))
(OUT/'chapters.metadata').write_text('\n'.join(metadata)+'\n')
video = RESOURCE/'GettingStarted.mp4'
run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT/'concat.txt', '-i', OUT/'captions.srt',
     '-f', 'ffmetadata', '-i', OUT/'chapters.metadata', '-map', '0:v:0', '-map', '0:a:0', '-map', '1:0', '-map_metadata', '2',
     '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0', '-movflags', '+faststart', video])
run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '3', '-i', video, '-frames:v', '1', '-q:v', '3', RESOURCE/'GettingStartedPoster.jpg'])
manifest = {'duration': duration(video), 'chapters': [{key: c[key] for key in ['id','title','narration','start','duration']} for c in chapters]}
(RESOURCE/'GettingStartedTour.json').write_text(json.dumps(manifest, indent=2)+'\n')
shutil.copyfile(OUT/'captions.srt', RESOURCE/'GettingStarted.en.srt')
streams = probe(video)['streams']
assert any(s['codec_name'] == 'h264' for s in streams) and any(s['codec_name'] == 'aac' for s in streams) and any(s['codec_name'] == 'mov_text' for s in streams)
assert video.stat().st_size < 90_000_000 and abs(manifest['duration']-timeline) < 3
proof = {'ok': True, 'durationSeconds': manifest['duration'], 'chapterCount': len(chapters), 'sizeBytes': video.stat().st_size,
         'sha256': hashlib.sha256(video.read_bytes()).hexdigest(), 'rawRecording': str(RECORDING), 'narration': 'Installed macOS Samantha voice, synthesized locally',
         'captions': 'Burned on-screen captions plus an English selectable subtitle track and transcript',
         'design': 'Website purple/pink palette, original vector brand mark, animated chapter steps, rounded phone frame and fade transitions',
         'cuts': 'Reviewed decoded-frame boundaries, bound to the source recording SHA256',
         'appRecordingVerified': True, 'humanVisualAcceptance': False}
(OUT/'video-verification.json').write_text(json.dumps(proof, indent=2)+'\n')
print(json.dumps(proof, indent=2), flush=True)
