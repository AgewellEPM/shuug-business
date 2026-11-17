import { HttpError } from './model.mjs';

export const workspaceOrigin = 'https://portal.gigtax.pro';
const endpoint = 'https://gig-tax-pros-production.up.railway.app/api/auth/workspace/session';

export async function requestWorkspaceSession(action, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Sign-in expired. Sign in again.');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token }),
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401) throw new HttpError(401, 'Sign-in expired or access changed. Sign in again.');
  if (!response.ok) throw new HttpError(502, 'The workspace could not verify your sign-in. Try again.');
  const value = await response.json();
  if (action === 'revoke' && value?.revoked === true) return;
  const targetValid = value?.role === 'owner' ? value.targetId === null : ['staff', 'location'].includes(value?.role) && /^[1-9]\d{0,18}$/.test(value.targetId);
  if (!targetValid || !Number.isSafeInteger(value.expires) || value.expires <= Date.now() ||
    (action === 'redeem' && !/^[a-f0-9]{64}$/.test(value.session))) throw new HttpError(502, 'The workspace returned an invalid sign-in. Try again.');
  return value;
}
