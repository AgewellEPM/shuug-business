"""Edit the recorded native app tour, synthesize narration locally, burn captions and bundle the video."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RECORDING = Path(sys.argv[1]).resolve()
OUT = RECORDING/'edit'
OUT.mkdir(exist_ok=True)
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
    chapter['rawStart'] = markers['BEGIN'][name] - receipt['recordStartedAt'] + 0.25
    chapter['rawDuration'] = markers['END'][name] - markers['BEGIN'][name] - 0.5
    assert 0 <= chapter['rawStart'] < raw_duration and chapter['rawDuration'] > 2
    voice_text, voice_file = OUT/(name+'.txt'), OUT/(name+'.aiff')
    voice_text.write_text(chapter['narration'])
    run(['/usr/bin/say', '-v', 'Samantha', '-r', '170', '-f', voice_text, '-o', voice_file])
    audio_duration = duration(voice_file)
    chapter['start'], chapter['duration'] = timeline, audio_duration + 0.8
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
for chapter in chapters:
    name, length = chapter['id'], chapter['duration']
    movie = OUT/(name+'.mp4')
    args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(chapter['rawStart']), '-t', str(chapter['rawDuration']), '-i', raw,
            '-loop', '1', '-i', OUT/(name+'-panel.png'), '-i', OUT/(name+'.aiff')]
    for number in range(len(chapter['captions'])): args += ['-loop', '1', '-i', OUT/f'{name}-caption-{number}.png']
    speed = min(1, length/chapter['rawDuration'])
    graph = [f'[0:v]setpts=(PTS-STARTPTS)*{speed:.8f},scale=-2:952,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration={length}[phone]',
             '[1:v]setsar=1[panel]', '[panel][phone]overlay=1350:64[scene0]']
    for number, caption in enumerate(chapter['captions']):
        graph.append(f"[scene{number}][{number+3}:v]overlay=100:746:enable='between(t,{caption['start']:.4f},{caption['end']:.4f})'[scene{number+1}]")
    args += ['-filter_complex', ';'.join(graph), '-map', f'[scene{len(chapter["captions"])}]', '-map', '2:a:0', '-af', 'adelay=400:all=1,apad',
             '-t', str(length), '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', movie]
    print('Rendering '+chapter['title'], flush=True)
    try: run(args)
    except subprocess.CalledProcessError as error:
        print(error.stderr.decode(errors='replace')[-4000:]); raise
(OUT/'concat.txt').write_text(''.join("file '"+str(OUT/(c['id']+'.mp4')).replace("'", "'\\''")+"'\n" for c in chapters))
(OUT/'captions.srt').write_text('\n'.join(subtitles))
(OUT/'chapters.metadata').write_text('\n'.join(metadata)+'\n')
video = RESOURCE/'GettingStarted.mp4'
run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT/'concat.txt', '-i', OUT/'captions.srt',
     '-f', 'ffmetadata', '-i', OUT/'chapters.metadata', '-map', '0:v:0', '-map', '0:a:0', '-map', '1:0', '-map_metadata', '2',
     '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0', '-movflags', '+faststart', video])
run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', video, '-frames:v', '1', '-q:v', '3', RESOURCE/'GettingStartedPoster.jpg'])
manifest = {'duration': duration(video), 'chapters': [{key: c[key] for key in ['id','title','narration','start','duration']} for c in chapters]}
(RESOURCE/'GettingStartedTour.json').write_text(json.dumps(manifest, indent=2)+'\n')
shutil.copyfile(OUT/'captions.srt', RESOURCE/'GettingStarted.en.srt')
streams = probe(video)['streams']
assert any(s['codec_name'] == 'h264' for s in streams) and any(s['codec_name'] == 'aac' for s in streams) and any(s['codec_name'] == 'mov_text' for s in streams)
assert video.stat().st_size < 90_000_000 and abs(manifest['duration']-timeline) < 3
proof = {'ok': True, 'durationSeconds': manifest['duration'], 'chapterCount': len(chapters), 'sizeBytes': video.stat().st_size,
         'sha256': hashlib.sha256(video.read_bytes()).hexdigest(), 'rawRecording': str(RECORDING), 'narration': 'Installed macOS Samantha voice, synthesized locally',
         'captions': 'Burned on-screen captions plus an English selectable subtitle track and transcript', 'appRecordingVerified': True, 'humanVisualAcceptance': False}
(OUT/'video-verification.json').write_text(json.dumps(proof, indent=2)+'\n')
print(json.dumps(proof, indent=2), flush=True)
