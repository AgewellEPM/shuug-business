// Usage: node scripts/sdr-export/import-care-library.mjs /path/to/TinkySpeak-Web [output directory]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw Error('Provide the path to the TinkySpeak-Web source checkout.');
const input = join(source, 'boards', 'imported');
const output = resolve(process.argv[3] || fileURLToPath(new URL('../../public/rideshare-tax-pros', import.meta.url)));
const read = name => JSON.parse(readFileSync(join(input, name), 'utf8'));
const write = (name, records) => {
  // One source board per line keeps the large dictionaries easy to diff.
  const lines = Object.entries(records).map(([key, value]) => '  ' + JSON.stringify(key) + ': ' + JSON.stringify(value));
  writeFileSync(join(output, 'care-library-' + name + '.json'), '{\n' + lines.join(',\n') + '\n}\n');
};
const manifest = read('catalog-manifest.json');
const groups = {};
const locales = {};
const catalog = [];
for (const info of manifest.boards) {
  const raw = read(info.path);
  const key = info.path.replace(/\.json$/, '');
  const id = raw.id || basename(key);
  const group = groups[info.category] ||= {};
  const board = { ...raw };
  if (Array.isArray(raw.tiles)) {
    board.tiles = raw.tiles.map(({ labels, spokenTexts, ...tile }, index) => {
      for (const lang of new Set([...Object.keys(labels || {}), ...Object.keys(spokenTexts || {})])) {
        const locale = locales[lang] ||= {};
        const translations = locale[key] ||= {};
        translations[index] = [labels?.[lang] || null, spokenTexts?.[lang] || null];
      }
      return tile;
    });
  }
  group[key] = board;
  const name = raw.title || (raw.venues ? 'Restaurant venue directory' : info.name);
  catalog.push({ key, id, name, category: info.category, topics: info.topics, sourceLanguage: info.lang, count: raw.tiles?.length ?? raw.venues?.length ?? 0 });
}
mkdirSync(output, { recursive: true });
write('catalog', { version: manifest.version, boards: catalog, languages: Object.keys(locales).sort() });
for (const [category, records] of Object.entries(groups)) write(category, records);
for (const [lang, records] of Object.entries(locales)) write('lang-' + lang, records);
console.log('Imported', catalog.length, 'catalog entries in', Object.keys(groups).length, 'groups and', Object.keys(locales).length, 'languages.');
