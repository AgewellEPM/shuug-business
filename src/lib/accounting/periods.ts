import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { bookIdInput } from "./book-scope";
import type { JournalEntry } from "./ledger";
export interface PeriodSeal { through: string; entries: JournalEntry[]; digest: string; actor: string; at: string }
interface PeriodState { active: PeriodSeal | null; history: { action: "close" | "reopen"; through: string; actor: string; at: string; reason: string; digest: string }[] }
const key = (bookId: string) => `accounting-periods:${bookIdInput.parse(bookId)}`;
export function readPeriods(db: DatabaseSync, bookId = "office"): PeriodState {
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='accounting-periods'").get(key(bookId)) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : { active: null, history: [] };
}
export function periodHistory(bookId = "office") { return workspaceDatabase(db => readPeriods(db, bookId)); }
export function assertPeriodOpen(db: DatabaseSync, date: string, bookId = "office") {
  const current = readPeriods(db, bookId).active;
  if (current && date <= current.through) throw new Error(`Books are closed through ${current.through}. Use an open-period correction or have the owner reopen the period with a recorded reason.`);
}
export function entriesDigest(entries: JournalEntry[]) {
  return createHash("sha256").update(JSON.stringify(entries.map(({ id, date, source, memo, lines }) => ({ id, date, source, memo, lines })).sort((a,b) => a.id.localeCompare(b.id)))).digest("hex");
}
export function changePeriod(db: DatabaseSync, bookId: string, input: { action: "close" | "reopen"; through: string; reason: string; reviewed: true }, entries: JournalEntry[], actor: string) {
  const v = z.object({ action: z.enum(["close", "reopen"]), through: z.iso.date(), reason: z.string().trim().min(3).max(1000), reviewed: z.literal(true) }).strict().parse(input);
  const state = readPeriods(db, bookId), at = new Date().toISOString();
  if (v.through > at.slice(0,10)) throw new Error("Cannot close a future period.");
  if (v.action === "reopen") {
    if (state.active?.through !== v.through) throw new Error("The closed period changed. Reload before reopening.");
    state.history.push({ ...v, actor, at, digest: state.active.digest }); state.active = null;
  } else {
    if (state.active && v.through <= state.active.through) throw new Error("Choose a date after the current close.");
    if (state.active && entriesDigest(entries.filter(e => e.date <= state.active!.through)) !== state.active.digest) throw new Error("Previously closed history changed. Review it before extending the close.");
    const snapshot = structuredClone(entries.filter(e => e.date <= v.through));
    const digest = entriesDigest(snapshot);
    state.active = { through: v.through, entries: snapshot, digest, actor, at };
    state.history.push({ ...v, actor, at, digest });
  }
  db.prepare("INSERT INTO documents VALUES(?,'accounting-periods',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(key(bookId), JSON.stringify(state));
  return state;
}
/** A closed statement remains reproducible even if a legacy source is edited. */
export function applyPeriodSeal(entries: JournalEntry[], bookId = "office") {
  const active = periodHistory(bookId).active;
  if (!active) return { entries, issues: [] as string[] };
  const changed = entriesDigest(entries.filter(e => e.date <= active.through)) !== active.digest;
  return { entries: [...active.entries, ...entries.filter(e => e.date > active.through)], issues: changed ? [`Source records differ from the sealed books through ${active.through}. Reports retain the closed entries; the owner must review this discrepancy before extending the close.`] : [] };
}
