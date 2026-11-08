import { HttpError, metadata, secret } from './model.mjs';

/** Keep every metadata write conditional on the record that was reviewed.
 * The deployed backend implements this with one tenant-scoped SQL update. */
export async function patchReviewed(db, kind, before, patch) {
  const info = patch.notes === undefined ? metadata(before) : JSON.parse(patch.notes);
  const change = { ...patch, notes: JSON.stringify({ ...info, revision: secret() }) };
  if (typeof db.patchIfUnchanged === 'function') {
    const result = await db.patchIfUnchanged(kind, before.id, before.notes ?? null, change);
    if (!result || result.matched === false) throw new HttpError(409, 'This record changed. Refresh it before trying again.');
    return result;
  }
  // In-memory test adapters have no distributed writers. The actual hosted
  // backend always supplies patchIfUnchanged and never takes this branch.
  return db.patch(kind, before.id, change);
}
