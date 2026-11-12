import { HttpError } from './model.mjs';
export async function publicText(response, maximum = 2000000) {
  if (!response.ok) { await response.body?.cancel?.(); throw new HttpError(502, `The public data source returned HTTP ${response.status}.`); }
  if (Number(response.headers?.get('content-length') || 0) > maximum) { await response.body?.cancel?.(); throw new HttpError(502, 'The public data response exceeded its size limit.'); }
  const chunks = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > maximum) throw new HttpError(502, 'The public data response exceeded its size limit.'); chunks.push(Buffer.from(part)); }
  return Buffer.concat(chunks).toString('utf8');
}
