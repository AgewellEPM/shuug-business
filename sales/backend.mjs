import { HttpError } from './model.mjs';
import { discoverOffices } from './discovery.mjs';

// The same authenticated Worker and D1 board API used by TinkySDR Mac.
// Only this adapter holds the tenant credential. No generic proxy is exposed.
export function backend(env, fetcher = fetch) {
  const base = 'https://tinkyspeak-tiles.tinkyspeak.workers.dev';
  async function request(path, method = 'GET', body) {
    const r = await fetcher(base + path, { method, headers: { Authorization: `Bearer ${env.GIGTAX_TINKY_KEY}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25000) });
    const data = await r.json().catch(() => ({}));
    if (r.status === 404) throw new HttpError(404, 'Record not found.');
    if (r.status === 409) throw new HttpError(409, 'This record changed. Refresh before trying again.');
    if (!r.ok) throw new HttpError(502, 'TinkySDR could not complete this request. Your changes have not been confirmed.');
    return data;
  }
  const boards = JSON.parse(env.GIGTAX_SALES_BOARDS || '{}');
  const boardPath = kind => {
    if (!/^[a-zA-Z0-9_-]+$/.test(boards[kind] || '')) throw new HttpError(503, 'The sales workspace needs backend setup.');
    return `/api/outreach/boards/${boards[kind]}`;
  };
  return {
    discover: (region, city, options) => discoverOffices(region, city, fetcher, options),
    async list(kind) { return (await request(boardPath(kind) + '/rows')).rows || []; },
    async get(kind, id) { if (!/^\d+$/.test(String(id))) throw new HttpError(404, 'Record not found.'); try { return (await request(boardPath(kind) + '/rows/' + id)).row; } catch(error) { if (error.status === 404) return undefined; throw error; } },
    async create(kind, body) { return (await request(boardPath(kind) + '/rows', 'POST', body)).row; },
    async patch(kind, id, body) { return (await request(boardPath(kind) + '/rows/' + id, 'PATCH', body)).row; },
    async patchIfUnchanged(kind, id, expectedNotes, body) {
      if (!/^\d+$/.test(String(id))) throw new HttpError(404, 'Record not found.');
      const value = await request(boardPath(kind) + '/rows/' + id, 'PATCH', { ...body, expected_notes: expectedNotes ?? null });
      if (value.matched !== true) throw new HttpError(503, 'The backend has not confirmed its conditional-write support. Refresh before retrying.');
      return value.row;
    },
    async terms() { return (await request(boardPath('offices'))).board?.config_json?.terms || null; },
    async setTerms(terms) { const board = (await request(boardPath('offices'))).board; await request(boardPath('offices'),'PATCH',{ config_json:{ ...board.config_json,terms } }); },
    async support() { return (await request(boardPath('offices'))).board?.config_json?.publicSupport || null; },
    async setSupport(publicSupport) { const board = (await request(boardPath('offices'))).board; await request(boardPath('offices'),'PATCH',{ config_json:{ ...board.config_json,publicSupport } }); },
    async search(query) {
      // Reuses TinkySDR's existing research endpoint. Results are source links,
      // never represented as verified offices, owners, or contact details.
      const data = await request('/api/native-browser/research', 'POST', { query });
      // The legacy service collapses provider/parse failures to []. An empty
      // response cannot honestly establish that this business has no website.
      const results=(Array.isArray(data.results)?data.results:[]).slice(0,10).map(r=>({title:r.title,url:r.url,snippet:r.snippet || ''}));
      return {results,status:results.length?'results':'unconfirmed'};
    },
  };
}
