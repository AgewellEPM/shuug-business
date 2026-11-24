import { HttpError } from '../../sales/model.mjs';

export function bookingHTTP(app, origin) {
  const limits = new Map();
  function rateLimit(req, type, maximum) {
    const now = Date.now(), id = (req.socket.remoteAddress || '') + ':' + type;
    if (limits.size > 1000) for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
    const current = limits.get(id);
    if (!current || current.expires <= now) limits.set(id, { count: 1, expires: now + 60_000 });
    else if (++current.count > maximum) throw new HttpError(429, 'Please wait a minute before trying again.');
  }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send a JSON booking request.');
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 12_000) throw new HttpError(413, 'The booking request is too large.');
      chunks.push(chunk);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'Send a valid JSON booking request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Invalid booking request.');
    return input;
  }
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const url = new URL(req.url, origin);
      if (/^\/book\/feed\//.test(url.pathname)) {
        if (req.method !== 'GET') throw new HttpError(405, 'Use GET for a calendar feed.');
        const match = /^\/book\/feed\/(owner|[1-9]\d*)\/([A-Za-z0-9_-]{43})\.ics$/.exec(url.pathname);
        if (!match) throw new HttpError(404, 'Calendar feed unavailable.');
        const ics = app.feed(match[1], match[2]);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        return res.end(ics);
      }
      let action, input;
      if (req.method === 'GET' && ['/api/booking/hosts', '/api/booking/slots'].includes(url.pathname)) {
        action = url.pathname.split('/').pop();
        input = Object.fromEntries(url.searchParams);
        delete input.token;
      } else if (req.method === 'POST' && url.pathname === '/api/booking') {
        if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Open the booking page on its workspace website.');
        input = await body(req);
        action = input.action;
        if (!['read', 'book', 'slots', 'reschedule', 'cancel'].includes(action)) throw new HttpError(400, 'Unknown booking operation.');
      } else throw new HttpError(404, 'Booking endpoint unavailable.');
      rateLimit(req, action, action === 'book' ? 30 : 240);
      const result = await app.publicAction(action, input);
      res.end(JSON.stringify(result));
      if (['book', 'reschedule', 'cancel'].includes(action)) app.tick().catch(() => console.error('Booking notifications are awaiting the next delivery cycle.'));
    } catch (error) {
      res.statusCode = error instanceof HttpError ? error.status : 503;
      if (res.statusCode === 429) res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: error instanceof HttpError ? error.message : 'Booking is temporarily unavailable. Refresh and try again.' }));
    }
  };
}
