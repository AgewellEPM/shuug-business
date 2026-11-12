import { backend } from './backend.mjs';
import { service } from './service.mjs';
import { HttpError } from './model.mjs';

export function createHandler(env = process.env, adapter, tools = {}) {
  return async function handler(req, res) {
    const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!env.GIGTAX_TINKY_KEY || !/^[a-f0-9]{64}$/.test(env.GIGTAX_SALES_SESSION_KEY || '') || !/^[a-f0-9]{64}$/.test(env.GIGTAX_SALES_OWNER_HASH || '') || !env.GIGTAX_SALES_ORIGIN) throw new HttpError(503, 'Sales workspace setup is not complete.');
      if (req.method !== 'POST') throw new HttpError(405, 'Use the sales workspace to make this request.');
      const origins=[env.GIGTAX_SALES_ORIGIN,...(env.GIGTAX_SALES_ORIGIN==='https://gigtax.pro'?['https://www.gigtax.pro']:[])];
      if (!origins.includes(req.headers.origin)) throw new HttpError(403, 'Open the sales workspace on GigTax.pro.');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use a JSON request.');
      let body;
      if (req.body !== undefined) {
        const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > 16000) throw new HttpError(413, 'This request is too large.');
        body = JSON.parse(raw);
      } else {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16000) throw new HttpError(413, 'This request is too large.'); }
        body = JSON.parse(raw);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
      const app = service(env, adapter || backend(env), undefined, tools);
      if (body.action === 'login') {
        const result = await app.login(body);
        res.setHeader('Set-Cookie', `gigtax_sales=${result.token}; HttpOnly; Secure; SameSite=Strict; Path=/api/sales; Max-Age=28800`);
        return reply(200, { user: result.user });
      }
      if (body.action === 'logout') {
        res.setHeader('Set-Cookie', 'gigtax_sales=; HttpOnly; Secure; SameSite=Strict; Path=/api/sales; Max-Age=0');
        return reply(200, { ok: true });
      }
      if (['signup-view', 'signup-accept', 'signup-confirm', 'signup-sign', 'signup-receipt'].includes(body.action)) return reply(200, await app.signup(body.action.slice(7), body));
      const cookie = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('gigtax_sales='))?.slice(13);
      const user = await app.identity(cookie);
      return reply(200, await app.dispatch(user, body.action, body));
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError || error instanceof TypeError ? 400 : 502);
      reply(status, { error: error instanceof HttpError ? error.message : status === 400 ? 'Check your request and try again.' : 'The backend did not confirm this operation. Refresh before trying again.' });
    }
  };
}
export default createHandler();
