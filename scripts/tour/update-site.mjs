import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportTour } from './export-web.mjs';

// Replace media and lesson content inside the current site's tour page while
// preserving its navigation, mobile controls, metadata and surrounding design.
const destination = path.resolve(process.argv[2] || '');
assert(process.argv[2] && path.basename(destination) === 'tour', 'Pass the existing public tour directory.');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'gigtax-tour-export-'));
try {
  const result = exportTour(temporary);
  assert.equal(result.chapters, 13);
  const generated = readFileSync(path.join(temporary, 'index.html'), 'utf8');
  const revision = createHash('sha256').update(readFileSync(path.join(temporary, 'getting-started.mp4'))).digest('hex').slice(0, 12);
  const versionMedia = value => value.replace(/((?:\.\/|\/tour\/)(?:getting-started\.mp4|poster\.jpg|captions\.en\.vtt))(?:\?v=[a-f0-9]+)?/g,
    (_, url) => `${url}?v=${revision}`);
  const file = path.join(destination, 'index.html');
  let html = readFileSync(file, 'utf8');
  const list = /(<nav class="chapters"[\s\S]*?<ol>)[\s\S]*?(<\/ol>)/;
  const transcript = /<section id="transcript"[\s\S]*?<\/section>/;
  assert(list.test(html) && transcript.test(html));
  const chapters = generated.match(list);
  html = html.replace(list, () => chapters[0]);
  html = html.replace(transcript, () => generated.match(transcript)[0]);
  html = html.replace('srclang="en" label="English">', 'srclang="en" label="English" default>');
  const runtime = `${Math.floor(result.duration / 60)}:${String(Math.floor(result.duration % 60)).padStart(2, '0')} · 13 chapters`;
  html = html.replace(/(<span class="runtime">)[\s\S]*?(<\/span>)/, (_, start, end) => start + runtime + end);
  writeFileSync(file, versionMedia(html));
  const home = path.join(destination, '../index.html');
  writeFileSync(home, versionMedia(readFileSync(home, 'utf8')));
  for (const name of ['getting-started.mp4', 'poster.jpg', 'captions.en.vtt', 'chapters.json', 'README.txt']) {
    copyFileSync(path.join(temporary, name), path.join(destination, name));
  }
  const playerFile = path.join(destination, 'player.js');
  let player = readFileSync(playerFile, 'utf8');
  const captionSelection = "      Array.from(video.textTracks || []).forEach((track, index) => { track.mode = index === 0 ? 'showing' : 'disabled'; });";
  player = player.replace(/      \/\/ Designed captions[\s\S]*?for \(const track of video.textTracks \|\| \[\]\) track.mode = 'disabled';/,
    captionSelection);
  player = player.replace("      if (video.textTracks?.length) video.textTracks[0].mode = 'showing';", captionSelection);
  assert(player.includes(captionSelection));
  writeFileSync(playerFile, player);
  const styleFile = path.join(destination, 'player.css');
  let css = readFileSync(styleFile, 'utf8');
  css = css.replace('aspect-ratio:16/9;background:#000;border:1px solid #9053b7;border-radius:20px;box-shadow:0 26px 75px #8e1ce51c',
    'height:auto;background:#000;border:0;border-radius:0;box-shadow:none');
  css = css.replace('.player video{border-radius:12px}', '.player video{border-radius:0}');
  writeFileSync(styleFile, css);
  console.log(JSON.stringify({ ...result, destination, currentSiteLayoutPreserved: true }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
