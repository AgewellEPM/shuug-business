import { service } from '../../sales/service.mjs';
import { digest } from '../../sales/model.mjs';
export function contactFixture() {
  const rows = { offices: [], agents: [], events: [], enrollments: [] };
  let nextId = 1;
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const db = {
    list: async kind => clone(rows[kind]), get: async (kind, id) => clone(rows[kind].find(r => String(r.id) === String(id))),
    create: async (kind, input) => { const row = { ...clone(input), id: nextId++ }; rows[kind].push(row); return clone(row); },
    patch: async (kind, id, input) => { const row = rows[kind].find(r => String(r.id) === String(id)); Object.assign(row, clone(input)); return clone(row); },
    patchIfUnchanged: async (kind, id, notes, input) => {
      const row = rows[kind].find(r => String(r.id) === String(id));
      if (!row || (row.notes ?? null) !== notes) return { matched: false };
      return db.patch(kind, id, input);
    },
    terms: async () => null, support: async () => null,
  };
  const code = 'synthetic-contact-test-code', env = { GIGTAX_TINKY_KEY: 'synthetic', GIGTAX_SALES_OWNER_HASH: digest(code), GIGTAX_SALES_SESSION_KEY: 'a'.repeat(64), GIGTAX_SALES_ORIGIN: 'https://gigtax.pro' };
  const app = service(env, db), owner = { id: 'owner', name: 'Synthetic Workspace Owner', role: 'owner', states: [] };
  const createOffice = async (input = {}) => (await app.dispatch(owner, 'create-office', { name: 'Synthetic Test Office', address: '123 Example Street', city: 'Hartford', state: 'CT', ...input })).office;
  return { rows, db, env, code, app, owner, createOffice };
}
