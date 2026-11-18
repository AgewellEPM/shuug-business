import { readResponseJson, responseJson } from './client.mjs';
import { createSignInProof, providerProof, signInRequestId, validateSignInFlow } from './social-proof.mjs';

export const website = 'https://gigtax.pro';
export const workspaceSecret = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const flowKey = 'gigtax-workspace-sign-in';

async function post(url, body, credentials = 'omit') {
  const response = await fetch(url, { method: 'POST', credentials, cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const detail = response.status === 409 ? await readResponseJson(response, 2048).catch(() => null) : undefined;
    const error = new Error(response.status === 409 ? 'This sign-in is unavailable. Use your account code or ask for a fresh invitation.' :
      response.status === 403 ? 'Your workspace access is unavailable. Contact the owner.' :
      response.status === 401 ? 'Sign-in expired or the code was incorrect. Try again.' : 'Sign-in could not be completed. Start again.');
    error.status = response.status;
    if (detail?.code === 'provider_not_connected') error.code = detail.code;
    await response.body?.cancel().catch(() => {});
    throw error;
  }
  return responseJson(response, 8192);
}

export async function enterBusinessWorkspace(body) {
  const result = await post(`${website}/api/sales`, body, 'include');
  if (!['/sales', '/location'].includes(result.destination)) throw new Error('The assigned workspace could not be verified.');
  return website + result.destination;
}

export async function signInWorkspacePassword(apiOrigin, email, password, invitation) {
  const operation = invitation ? 'set-password' : 'password';
  try {
    return await post(`${apiOrigin}/api/auth/workspace/${operation}`, { email, password, ...(invitation ? { invitation } : {}) });
  } catch (error) {
    if (error.status === 401) throw new Error('Check your email and password. If you still use an account code, add your sign-in email under Account access.');
    if (error.status === 409 && invitation) throw new Error('That email or invitation is unavailable. Use your current sign-in or ask the owner for a new link.');
    throw error;
  }
}

export async function startWorkspaceProvider(apiOrigin, provider, invitation) {
  const { verifier, challenge } = await createSignInProof();
  const result = await post(`${apiOrigin}/api/auth/workspace/start`, { provider, challenge, ...(invitation ? { invitation } : {}) });
  const { requestId, authorizationUrl, expires } = validateSignInFlow(result, apiOrigin, provider);
  sessionStorage.setItem(flowKey, JSON.stringify({ requestId, verifier, expires }));
  location.assign(authorizationUrl);
}

export async function resumeWorkspaceProvider(apiOrigin) {
  const stored = sessionStorage.getItem(flowKey);
  sessionStorage.removeItem(flowKey);
  const { requestId, verifier, expires } = JSON.parse(stored || '{}');
  if (!signInRequestId(requestId) || !providerProof(verifier) || !Number.isSafeInteger(expires) || expires <= Date.now()) {
    throw new Error('Sign-in expired. Continue with Google or Apple again.');
  }
  const result = await post(`${apiOrigin}/api/auth/workspace/result`, { requestId, verifier });
  if (result.apiVersion !== 1 || result.pending) throw new Error('The provider did not complete sign-in. Start again.');
  return result;
}
