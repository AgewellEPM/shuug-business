import { constants, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export function dataDirectory(root) {
  return resolve(process.env.SDR_DATA_DIR || resolve(root, 'workspace-data'));
}

export function privateValue(filename) {
  const info = lstatSync(filename);
  if (!info.isFile() || info.mode & 0o077) throw new Error('The SDR credential file must be private and regular.');
  return readFileSync(filename, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW }).trim();
}

export function initialize(root) {
  const directory = dataDirectory(root);
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.mode & 0o077) throw new Error('The SDR data directory must be private.');
  const owner = resolve(directory, 'owner-code');
  const session = resolve(directory, 'session-key');
  for (const [file, encoding] of [[owner, 'base64url'], [session, 'hex']]) {
    try { writeFileSync(file, randomBytes(32).toString(encoding) + '\n', { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!privateValue(file)) throw new Error('An existing SDR credential is empty.');
  }
  return { directory, owner, session };
}
