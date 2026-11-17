import { publicKeyId } from '../envelope.mjs';

const identifier = value => typeof value === 'string' && value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0] === value;
export async function validateTrustedConfig(value, currentOrigin) {
  if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)throw new Error('Use a current HTTPS browser with WebCrypto before opening this private workspace.');
  const clientOnly=value?.version===2&&value.profile==='client-only-v1';
  const keys = clientOnly?['version','profile','uiOrigin','apiOrigin','workspaceId','signerPublicKey']:['version','uiOrigin','apiOrigin','workspaceId','signerPublicKey','firmRecoveryPublicKey'];
  if (!value || Object.keys(value).sort().join('|') !== keys.sort().join('|') || !clientOnly&&value.version!==1) throw new Error('This client has no independently supplied trust configuration. Connections and key setup are disabled.');
  const ui = new URL(value.uiOrigin), api = new URL(value.apiOrigin);
  if (ui.protocol !== 'https:' || api.protocol !== 'https:' || ui.origin !== value.uiOrigin || api.origin !== value.apiOrigin || ui.origin !== currentOrigin || ui.origin === api.origin || !identifier(value.workspaceId)) throw new Error('Use the separately controlled HTTPS client and an explicitly different HTTPS ciphertext API origin.');
  if (ui.username || api.username || ui.password || api.password) throw new Error('Credentials are not permitted in trusted origins.');
  const signerId = await publicKeyId(value.signerPublicKey);
  if(!clientOnly&&signerId===await publicKeyId(value.firmRecoveryPublicKey)) throw new Error('The public signing and firm recovery pins must be distinct.');
  return Object.freeze({...value});
}
