import { constants, existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HttpError } from '../../../sales/model.mjs';
import { privateValue } from '../setup.mjs';
import { sameAddress, zohoConfig, zohoId, zohoSession } from './zoho-account.mjs';

// Zoho Self Client grants are issued by the organization owner and consumed once.
export async function authorizeZoho(env, directory, grant, ownerAddress, fetcher = fetch) {
  const path = env.SDR_ZOHO_CONFIG_FILE || join(directory, 'zoho-mail.json');
  const existing = () => existsSync(path) ? privateValue(path) : '';
  const before = existing(), previous = before ? JSON.parse(before) : {};
  const current = zohoConfig(env, directory);
  const address = current.ownerAddress || String(ownerAddress || '').trim().toLowerCase();
  if (!sameAddress(address, address)) throw new HttpError(400, 'Enter the Zoho business address assigned to the workspace owner.');
  const clientId = grant?.client_id || current.clientId, clientSecret = grant?.client_secret || current.clientSecret;
  const code = grant?.code;
  if (![clientId, clientSecret, code].every(value => typeof value === 'string' && /^[!-~]{6,2000}$/.test(value))) {
    throw new HttpError(400, 'Choose the Zoho Self Client JSON containing the client ID, client secret and fresh grant code.');
  }
  if ((env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_ID !== clientId) || (env.ZOHO_CLIENT_SECRET && env.ZOHO_CLIENT_SECRET !== clientSecret) || env.ZOHO_REFRESH_TOKEN) {
    throw new HttpError(409, 'This installation manages Zoho credentials through its server environment.');
  }
  const configuredReps = Object.values(current.mailboxes).some(value => value?.refreshToken);
  if (configuredReps && current.clientId && current.clientId !== clientId) throw new HttpError(409, 'Use the Zoho application already assigned to the workspace.');
  let tokens;
  try {
    const response = await fetcher('https://accounts.' + current.host + '/oauth/v2/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code }),
    });
    tokens = await response.json();
    if (!response.ok || !tokens.refresh_token) throw new Error();
  } catch { throw new HttpError(422, 'Zoho could not exchange the grant. Generate a fresh Self Client code in the organization’s data center.'); }

  // Verify the intended owner and actual folder access before changing the working configuration.
  const candidate = { ...current, clientId, clientSecret, refreshToken: tokens.refresh_token, orgId: '' };
  const account = { config: candidate, address, accountId: '', configured: true };
  const api = await zohoSession(fetcher).open(account);
  const folders = await api('folders');
  if (!Array.isArray(folders) || !folders.some(folder => folder.folderType === 'Inbox' && zohoId(folder.folderId))) {
    throw new HttpError(403, 'Zoho did not grant access to the assigned owner inbox.');
  }
  if (before !== existing()) throw new HttpError(409, 'The workspace mail settings changed during authorization. Review the current assignment.');
  const temporary = join(dirname(path), '.zoho-mail-' + randomUUID());
  try {
    writeFileSync(temporary, JSON.stringify({ ...previous, ownerAddress: address, clientId, clientSecret, refreshToken: tokens.refresh_token }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return { authorized: true };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [file, address] = process.argv.slice(2);
    if (!file || process.argv.length > 4) throw new Error('Usage: npm run mail:authorize -- /path/to/self_client.json [owner-address]');
    const info = lstatSync(file);
    if (!info.isFile() || info.size > 16_384) throw new Error('Choose the downloaded Zoho Self Client JSON file.');
    const grant = JSON.parse(readFileSync(file, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW }));
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    await authorizeZoho(process.env, process.env.SDR_DATA_DIR || join(root, 'workspace-data'), grant, address);
    console.log('Zoho authorization saved. The assigned owner account and Inbox were verified.');
  } catch (error) {
    console.error(error instanceof HttpError ? error.message : 'Could not import the workspace grant. Check the selected JSON file, owner address and private configuration path.');
    process.exitCode = 1;
  }
}
