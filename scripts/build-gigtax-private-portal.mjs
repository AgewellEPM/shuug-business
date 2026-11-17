// Build the independent static portal. Only public trust pins belong in config.
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareBrowser } from '../packages/secure-tax-client/prepare-browser.mjs';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  if (!['--config', '--output'].includes(key) || !args[i + 1] || options[key]) {
    throw new Error('Use --config PUBLIC-CONFIG.json --output NEW-DIRECTORY.');
  }
  options[key] = args[i + 1];
}
if (Object.keys(options).length !== 2) throw new Error('Select public config and a new output directory.');
const config = JSON.parse(await readFile(options['--config'], 'utf8'));
const output = path.resolve(options['--output']);
await mkdir(output, { mode: 0o700 }); // Never overwrite a previous artifact.
const build = path.join(output, '.vercel', 'output');
const assets = path.join(build, 'static');
await prepareBrowser({ output: assets, config });

// Translate the client's generated security headers into the Build Output API.
const generated = JSON.parse(await readFile(path.join(assets, 'vercel.json'), 'utf8'));
const headers = Object.fromEntries(generated.headers[0].headers.map(({ key, value }) => [key, value]));
if (!headers['Content-Security-Policy'].includes("frame-ancestors 'none'")) throw new Error('Missing frame protection.');
if (headers['Referrer-Policy'] !== 'no-referrer') throw new Error('The independent vault must not emit private referrers.');
await writeFile(path.join(build, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/.*', headers, continue: true },
    { handle: 'filesystem' },
  ],
}, null, 2) + '\n');

const inventory = [];
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name, file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file, relative + '/');
    else if (entry.isFile()) {
      const bytes = await readFile(file);
      inventory.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error('Portal artifacts cannot contain symlinks or special files.');
  }
}
await walk(assets);
await writeFile(path.join(output, 'asset-inventory.json'), JSON.stringify({
  apiOrigin: config.apiOrigin, uiOrigin: config.uiOrigin,
  files: inventory.sort((a, b) => a.path.localeCompare(b.path)),
}, null, 2) + '\n');
console.log(JSON.stringify({ output, files: inventory.length, privateKeysIncluded: false }));
