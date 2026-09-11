import { workspaceDatabase } from "./database";
import type { DatabaseSync } from "node:sqlite";
/** Atomic adapter for older aggregate stores. Nested synchronous operations
 * share the transaction, so sample approval + shipment + inventory commit once. */
export function persistentState<T>(name: string, initial: () => T) {
  let current: T | undefined;
  let currentDb: DatabaseSync | undefined;
  function change<R>(work: (state: T, db: DatabaseSync) => R): R {
    if (current !== undefined) return work(current, currentDb!);
    return workspaceDatabase(db => {
      const id = `state:${name}`, row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='state'").get(id) as { body: string } | undefined;
      const state: T = row ? JSON.parse(row.body) : structuredClone(initial());
      current = state; currentDb = db;
      try {
        const result = work(state, db);
        if (result instanceof Promise) throw new Error("Persistent state transactions cannot contain asynchronous operations.");
        db.prepare("INSERT INTO documents VALUES(?,'state',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(id, JSON.stringify(state));
        return structuredClone(result);
      } finally { current = undefined; currentDb = undefined; }
    }, true);
  }
  return { change, read: () => current ?? change(state => state) };
}
