import { backend } from './backend.mjs';
import { service } from './service.mjs';
import { HttpError } from './model.mjs';
import { workspaceOrigin } from './workspace-session.mjs';

function salesCookie(res, name, token, age, localHttp) {
  res.setHeader('Set-Cookie', `${name}=${token}; HttpOnly; ${localHttp ? '' : 'Secure; '}SameSite=Strict; Path=/api/sales; Max-Age=${age}`);
}

export function createHandler(env = process.env, adapter, tools = {}) {
  const cookieName = tools.cookieName || 'gigtax_sales';
  if (!/^gigtax_sales(?:_[a-f0-9]{16})?$/.test(cookieName)) throw new Error('Invalid SDR session cookie name.');
  const cookiePrefix = cookieName + '=';
  const localHttp = Boolean(adapter && tools.localHttp && /^http:\/\/127\.0\.0\.1:\d+$/.test(env.GIGTAX_SALES_ORIGIN));
  return async function handler(req, res) {
    const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if ((!adapter && !env.GIGTAX_TINKY_KEY) || !/^[a-f0-9]{64}$/.test(env.GIGTAX_SALES_SESSION_KEY || '') || !/^[a-f0-9]{64}$/.test(env.GIGTAX_SALES_OWNER_HASH || '') || !env.GIGTAX_SALES_ORIGIN) throw new HttpError(503, 'Sales workspace setup is not complete.');
      const origins=[env.GIGTAX_SALES_ORIGIN,...(env.GIGTAX_SALES_ORIGIN==='https://gigtax.pro'?['https://www.gigtax.pro']:[])];
      const sharedOrigin = tools.sharedOrigin === undefined ? (env.GIGTAX_SALES_ORIGIN === 'https://gigtax.pro' ? workspaceOrigin : null) : tools.sharedOrigin;
      const sharedEntry = Boolean(sharedOrigin && req.headers.origin === sharedOrigin);
      res.setHeader('Vary', 'Origin');
      if (sharedEntry) {
        res.setHeader('Access-Control-Allow-Origin', sharedOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'POST');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          return res.end();
        }
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Use the sales workspace to make this request.');
      if (!sharedEntry && !origins.includes(req.headers.origin)) throw new HttpError(403, 'Open the sales workspace on its configured website.');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use a JSON request.');
      const mailApi = Boolean(tools.repEmail && req.url?.split('?')[0] === '/api/sales/mail/v1');
      const cookie = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(cookiePrefix))?.slice(cookiePrefix.length);
      const mailApp = mailApi ? service(env, adapter, undefined, tools) : null;
      if (mailApi && sharedEntry) throw new HttpError(403, 'Use your workspace session for email.');
      const mailUser = mailApi ? await mailApp.identity(cookie) : null;
      if (mailApi && !['agent', 'owner'].includes(mailUser?.role)) throw new HttpError(403, 'A sales workspace account is required.');
      const limit = mailApi ? 6 * 1024 * 1024 : 16000;
      let body;
      if (req.body !== undefined) {
        const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > limit) throw new HttpError(413, 'This request is too large.');
        body = JSON.parse(raw);
      } else {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > limit) throw new HttpError(413, 'This request is too large.');
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
      if (mailApi) {
        if (!tools.repEmail.actions.has(body.action)) throw new HttpError(404, 'Unknown email action.');
        return reply(200, await mailApp.dispatch(mailUser, body.action, body));
      }
      const disconnect = body.action === 'chat-watch' && tools.teamChat ? new AbortController() : null;
      if (disconnect) res.once('close', () => disconnect.abort());
      const app = service(env, adapter || backend(env), undefined, disconnect ? { ...tools, requestSignal: disconnect.signal } : tools);
      if (sharedEntry) {
        if (body.action === 'workspace-entry' && typeof body.ticket === 'string' && /^[a-f0-9]{64}$/.test(body.ticket)) {
          const result = await app.enterWorkspace(body.ticket);
          salesCookie(res, cookieName, result.token, 28800, false);
          return reply(200, { destination: result.destination });
        }
        if (body.action === 'login') {
          await tools.beforeLogin?.(req);
          const result = await app.login(body);
          salesCookie(res, cookieName, result.token, 28800, false);
          return reply(200, { destination: '/sales' });
        }
        throw new HttpError(403, 'Use your assigned workspace to continue.');
      }
      if (body.action === 'login') {
        await tools.beforeLogin?.(req);
        const result = await app.login(body);
        salesCookie(res, cookieName, result.token, 28800, localHttp);
        return reply(200, { user: result.user });
      }
      if (body.action === 'logout') {
        salesCookie(res, cookieName, '', 0, localHttp);
        await app.logout(cookie);
        return reply(200, { ok: true });
      }
      if (['signup-view', 'signup-accept', 'signup-confirm', 'signup-sign', 'signup-receipt'].includes(body.action)) return reply(200, await app.signup(body.action.slice(7), body));
      const user = await app.identity(cookie);
      const result = await app.dispatch(user, body.action, body);
      if (!res.destroyed) return reply(200, result);
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError || error instanceof TypeError ? 400 : 502);
      reply(status, { error: error instanceof HttpError ? error.message : status === 400 ? 'Check your request and try again.' : 'The backend did not confirm this operation. Refresh before trying again.' });
    }
  };
}
export default createHandler();
