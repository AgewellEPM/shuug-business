const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export const providerProof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const signInRequestId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);

export async function createSignInProof() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export function validateSignInFlow(result, apiOrigin, provider) {
  if (!['apple', 'google'].includes(provider)) throw new Error('Choose Google or Apple.');
  const url = new URL(result?.authorizationUrl), google = provider === 'google';
  const expectedOrigin = google ? 'https://accounts.google.com' : 'https://appleid.apple.com';
  const expectedPath = google ? '/o/oauth2/v2/auth' : '/auth/authorize';
  const params = url.searchParams;
  const keys = ['client_id', 'redirect_uri', 'response_type', 'state', 'nonce', ...(google ? ['scope', 'code_challenge', 'code_challenge_method', 'prompt'] : ['response_mode'])];
  const expires = Date.parse(result.expiresAt);
  if (result.apiVersion !== 1 || !signInRequestId(result.requestId) || url.origin !== expectedOrigin || url.pathname !== expectedPath || url.username || url.password || url.hash ||
    [...params.keys()].sort().join('|') !== keys.sort().join('|') || params.get('redirect_uri') !== `${apiOrigin}/api/auth/social/${provider}/callback` ||
    params.get('response_type') !== 'code' || !['state', 'nonce'].every(key => providerProof(params.get(key))) ||
    (google ? params.get('scope') !== 'openid' || params.get('code_challenge_method') !== 'S256' || params.get('prompt') !== 'select_account' : params.get('response_mode') !== 'query') ||
    !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 11 * 60000) {
    throw new Error('The provider sign-in request is invalid.');
  }
  return { requestId: result.requestId, authorizationUrl: url.href, expires };
}
