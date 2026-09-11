import { accountCommandInput, accountType, standardAccounts, validateAccountTree, type WorkspaceAccount } from "./account-model";
import { accountHasSourceHistory } from "./account-usage";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { persistentState } from "../workspace/state";
import { validateEntry, type JournalEntry, type JournalLine } from "./ledger";
import { journalCommandInput, journalPostInput, journalReverseInput } from "./journal-model";

interface StoredEntry { entry: JournalEntry; actor: string; recordedAt: string; reversesId: string | null; reason: string | null; imported: boolean }
interface AccountAudit { id: string; number: number; actor: string; at: string; before: WorkspaceAccount | null; after: WorkspaceAccount }
interface JournalState { accounts?: WorkspaceAccount[]; accountAudit?: AccountAudit[]; entries: StoredEntry[]; commands: Record<string, { hash: string; id: string }>; audit: { id: string; action: string; entryId: string; actor: string; at: string; relatedId: string | null }[] }
const legacyEntry = z.object({ id: z.string().min(1).max(100), date: z.iso.date(), memo: z.string().max(1000), source: z.literal("manual"), lines: z.array(z.object({ accountNumber: z.number().int(), debitCents: z.number().int().nonnegative(), creditCents: z.number().int().nonnegative() }).strict()).min(2).max(100) }).strict();
const state = persistentState<JournalState>("manual-journal", () => {
  const empty: JournalState = { entries: [], commands: {}, audit: [] };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path.join(dataDirectory(), "journal.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty; throw new Error("The existing journal.json cannot be imported. Repair or restore it before continuing; it has not been replaced."); }
  const parsed = z.array(legacyEntry).safeParse(raw);
  if (!parsed.success || new Set(parsed.data.map(e => e.id)).size !== parsed.data.length || parsed.data.some(e => validateEntry(e))) throw new Error("The existing journal.json has invalid or duplicate accounting entries. Repair or restore it before continuing; it has not been replaced.");
  const at = new Date().toISOString();
  for (const entry of parsed.data) {
    empty.entries.push({ entry, actor: "Legacy import; original author unavailable", recordedAt: at, reversesId: null, reason: null, imported: true });
    empty.audit.push({ id: randomUUID(), action: "journal.import", entryId: entry.id, actor: "System migration", at, relatedId: null });
  }
  return empty;
});
function view(s: JournalState) {
  const reversed = new Map(s.entries.filter(r => r.reversesId).map(r => [r.reversesId!, r.entry.id]));
  return s.entries.map(r => ({ ...r.entry, manual: { revision: 1 as const, actor: r.actor, recordedAt: r.recordedAt, reversesId: r.reversesId, reversedById: reversed.get(r.entry.id) ?? null, reason: r.reason, imported: r.imported } }));
}
export function manualJournalData() { return state.change(s => ({ entries: view(s), audit: s.audit })); }
export function listManualEntries(): JournalEntry[] { return state.change(view); }
export function executeJournalCommand(raw: unknown, actor: string) {
  const command = journalCommandInput.parse(raw);
  const input = command.action === "journal.post" ? journalPostInput.parse(command.input) : journalReverseInput.parse(command.input);
  const hash = createHash("sha256").update(JSON.stringify({ action: command.action, input, actor })).digest("hex");
  return state.change(s => {
    const previous = s.commands[command.requestId];
    if (previous) { if (previous.hash !== hash) throw new Error("This request ID already belongs to a different journal action or author."); return { id: previous.id, kind: "manual-journal" }; }
    if (s.entries.length >= 100000) throw new Error("The manual-journal archive is full. Review deployment capacity before adding entries.");
    const at = new Date().toISOString();
    let entry: JournalEntry, reversesId: string | null = null, reason: string | null = null;
    if (command.action === "journal.post") {
      const v = journalPostInput.parse(input), error = validateEntry(v, (s.accounts ?? standardAccounts()).filter(a => a.active)); if (error) throw new Error(error);
      entry = { id: `manual:${randomUUID()}`, date: v.date, memo: v.memo, source: "manual", lines: v.lines };
    } else {
      const v = journalReverseInput.parse(input), original = s.entries.find(r => r.entry.id === v.id);
      if (!original) throw new Error("Manual journal entry unavailable. Correct automatically generated entries in their source workflow.");
      if (s.entries.some(r => r.reversesId === v.id)) throw new Error("This entry already has a recorded reversal. Reload its history before making another correction.");
      if (v.date < original.entry.date) throw new Error("A reversal cannot precede its original posting date.");
      reversesId = original.entry.id; reason = v.reason;
      entry = { id: `manual:${randomUUID()}`, date: v.date, memo: `Reversal: ${original.entry.memo}`.slice(0, 1000), source: "manual", lines: original.entry.lines.map(l => ({ accountNumber: l.accountNumber, debitCents: l.creditCents, creditCents: l.debitCents })) };
      const error = validateEntry(entry, s.accounts ?? standardAccounts()); if (error) throw new Error(error);
    }
    s.entries.push({ entry, actor, recordedAt: at, reversesId, reason, imported: false });
    s.audit.push({ id: randomUUID(), action: command.action, entryId: entry.id, actor, at, relatedId: reversesId });
    s.commands[command.requestId] = { hash, id: entry.id };
    return { id: entry.id, kind: "manual-journal" };
  });
}
/** Trusted internal callers use the same validation and durable posting path. */
export interface NewEntry { date: string; memo: string; lines: JournalLine[] }
export function addManualEntry(input: NewEntry, actor = "Internal workflow", requestId = randomUUID()): JournalEntry {
  const result = executeJournalCommand({ requestId, action: "journal.post", input: { ...input, memo: input.memo.trim() || "Manual entry", reviewed: true } }, actor);
  return listManualEntries().find(e => e.id === result.id)!;
}
/** Kept as an explicit failure for older callers; posted history is never erased. */
export function removeManualEntry(id: string): never { void id; throw new Error("Posted journal entries cannot be removed. Record a reviewed reversal with its date and reason."); }

export function chartOfAccounts() { return state.change(s => ({ accounts: s.accounts ?? standardAccounts(), audit: s.accountAudit ?? [] })); }
export function executeAccountCommand(raw: unknown, actor: string) {
  const command = accountCommandInput.parse(raw), v = command.input;
  const hash = createHash("sha256").update(JSON.stringify({ action: command.action, input: v, actor })).digest("hex");
  return state.change((s, db) => {
    const previous = s.commands[command.requestId];
    if (previous) { if (previous.hash !== hash) throw new Error("This request ID belongs to another accounting action or author."); return { id: previous.id, kind: "account" }; }
    const accounts = s.accounts ?? standardAccounts(), before = accounts.find(a => a.number === v.number);
    if ((before?.revision ?? 0) !== v.revision) throw new Error("This account changed. Reload its current revision before saving.");
    if (before?.system && (before.classification !== v.classification || !v.active)) throw new Error("System posting accounts must keep their original classification and remain active.");
    if (before && before.classification !== v.classification && (s.entries.some(e => e.entry.lines.some(l => l.accountNumber === before.number)) || accountHasSourceHistory(db, before.number))) throw new Error("An account with journal history cannot change classification.");
    if (!before && accounts.length >= 50000) throw new Error("The account directory is full. Review deployment capacity.");
    if (accounts.some(a => a.number !== v.number && a.parentNumber === v.parentNumber && a.name.toLocaleLowerCase() === v.name.toLocaleLowerCase())) throw new Error("Another account at this level already uses that name.");
    const type = accountType(v.classification);
    const after: WorkspaceAccount = { number: v.number, name: v.name, type, statement: ["asset", "liability", "equity"].includes(type) ? "balance-sheet" : "profit-and-loss", classification: v.classification, parentNumber: v.parentNumber, active: v.active, revision: (before?.revision ?? 0) + 1, system: before?.system ?? false };
    const next = [...accounts.filter(a => a.number !== v.number), after].sort((a, b) => a.number - b.number);
    validateAccountTree(next);
    s.accounts = next; (s.accountAudit ??= []).push({ id: randomUUID(), number: v.number, actor, at: new Date().toISOString(), before: before ?? null, after });
    const id = `account:${v.number}`; s.commands[command.requestId] = { hash, id };
    return { id, kind: "account" };
  });
}
