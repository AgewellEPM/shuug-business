import { HttpError, digest, email, text } from './model.mjs';

// Reuses Shuug invoice delivery's Mailgun contract: one durable send attempt,
// no automatic retry, no tracking pixels, explicit test/live mode.
// https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/pass-sending-options
export function singleEmail(value) {
  const clean = email(value);
  if (/[<>,;\r\n]/.test(clean)) throw new HttpError(400, 'Use one business email address.');
  return clean;
}
export function mailConfig(env) {
  const key = env.GIGTAX_MAILGUN_API_KEY || '', domain = env.GIGTAX_MAILGUN_DOMAIN || '', region = env.GIGTAX_MAILGUN_REGION || '', mode = env.GIGTAX_MAILGUN_MODE || '';
  const ready = /^[!-~]{10,500}$/.test(key) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) && ['US', 'EU'].includes(region) && ['live', 'test'].includes(mode);
  return { ready, key, domain, region, mode, digest: digest(JSON.stringify({ key: digest(key), domain, region, mode })),
    endpoint: ready ? `https://${region === 'EU' ? 'api.eu.mailgun.net' : 'api.mailgun.net'}/v3/${domain}/messages` : null };
}
export function mailConnection(env) {
  const config = mailConfig(env);
  return { configured: config.ready, mode: config.ready ? config.mode : null, domain: config.domain || null,
    webhooksConfigured: Boolean(env.GIGTAX_MAILGUN_WEBHOOK_KEY),
    message: config.ready ? config.mode === 'test' ? 'Email is in test mode. Test requests do not establish real delivery.' : 'Email settings are saved. Provider acceptance and recipient delivery are tracked separately.' : 'Direct email delivery needs setup. Contract links and your own email app remain available.' };
}
export async function sendContractMail(config, preview, deliveryId, fetcher = fetch) {
  if (!config.ready) throw new HttpError(503, 'Direct contract email is not connected. Use your email app or finish email setup.');
  if (singleEmail(preview.from).split('@')[1] !== config.domain) throw new HttpError(409, 'This sender must belong to the configured sending domain.');
  const body = new FormData();
  for (const [key, value] of Object.entries({ from: `${text(preview.fromName, 140)} <${singleEmail(preview.from)}>`, to: singleEmail(preview.to), 'h:Reply-To': singleEmail(preview.replyTo), subject: text(preview.subject, 180, true), text: preview.text,
    'v:gigtax_delivery': String(deliveryId), 'o:tracking': 'no', 'o:tracking-clicks': 'no', 'o:tracking-opens': 'no', 'o:require-tls': 'yes', 'o:skip-verification': 'no', ...(config.mode === 'test' ? { 'o:testmode': 'yes' } : {}) })) body.set(key, value);
  try {
    const response = await fetcher(config.endpoint, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`api:${config.key}`).toString('base64')}` }, body, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) { await response.body?.cancel(); return { status: 'rejected', providerId: null }; }
    if (response.status !== 200) { await response.body?.cancel(); return { status: 'uncertain', providerId: null }; }
    if (Number(response.headers.get('content-length') || 0) > 16000) { await response.body?.cancel(); return { status: 'uncertain', providerId: null }; }
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); return { status: 'uncertain', providerId: null }; } chunks.push(value); }
    const result = JSON.parse(Buffer.concat(chunks).toString());
    return typeof result.id === 'string' && /^[!-~]{1,300}$/.test(result.id) ? { status: 'accepted', providerId: result.id } : { status: 'uncertain', providerId: null };
  } catch { return { status: 'uncertain', providerId: null }; }
}
