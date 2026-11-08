import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'public/rideshare-tax-pros/tour');
const media = path.join(root, 'native/ios/RideshareTaxPros/Resources');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const timestamp = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

export function exportTour(destination) {
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
  for (const [input, output] of [['GettingStarted.mp4', 'getting-started.mp4'], ['GettingStartedPoster.jpg', 'poster.jpg'], ['GettingStartedTour.json', 'chapters.json']]) {
    cpSync(path.join(media, input), path.join(destination, output));
  }
  cpSync(path.join(root, 'public/rideshare-tax-pros/favicon.svg'), path.join(destination, 'brand.svg'));
  const manifest = JSON.parse(readFileSync(path.join(media, 'GettingStartedTour.json'), 'utf8'));
  let previousEnd = 0;
  for (const chapter of manifest.chapters) {
    if (!Number.isFinite(chapter.start) || !Number.isFinite(chapter.duration) || chapter.duration <= 0 || Math.abs(chapter.start - previousEnd) > .1) throw new Error('Tour chapter timeline is not contiguous.');
    previousEnd = chapter.start + chapter.duration;
  }
  if (Math.abs(previousEnd - manifest.duration) > 1) throw new Error('Tour chapters do not match the video duration.');
  const srt = readFileSync(path.join(media, 'GettingStarted.en.srt'), 'utf8');
  writeFileSync(path.join(destination, 'captions.en.vtt'), 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
  const chapters = manifest.chapters.map(chapter => `<li><button type="button" disabled data-seek="${chapter.start}" data-title="${escape(chapter.title)}"><time>${timestamp(chapter.start)}</time><span>${escape(chapter.title)}</span></button></li>`).join('\n');
  const transcript = manifest.chapters.map(chapter => `<details><summary>${timestamp(chapter.start)} · ${escape(chapter.title)}</summary><p>${escape(chapter.narration)}</p></details>`).join('\n');
  const html = readFileSync(path.join(source, 'index.html'), 'utf8').replace('<!--CHAPTERS-->', chapters).replace('<!--TRANSCRIPT-->', transcript);
  writeFileSync(path.join(destination, 'index.html'), html);
  writeFileSync(path.join(destination, 'README.txt'), 'Gig Tax Pros — reusable app tour\n\nHost this directory together. Open index.html to preview. The existing website build includes it at /tour/.\n\nThe H.264/AAC MP4 is the same video bundled in the iPhone app. English captions, chapter times, a poster and the full transcript are included. Playback uses native video controls and does not autoplay or contact external services.\n\nTo embed in another existing page, copy the .gig-tour element, load player.css and player.js, and retain the relative asset paths (or adjust them to your hosted directory).\n\nNo website deployment is performed by this export.\n');
  return { destination, chapters: manifest.chapters.length, duration: manifest.duration };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/tour/export-web.mjs OUTPUT_DIRECTORY');
  console.log(JSON.stringify(exportTour(path.resolve(process.argv[2])), null, 2));
}
