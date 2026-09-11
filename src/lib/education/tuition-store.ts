/**
 * Tuition invoices store — durable (tuition.json). A monthly billing run creates one
 * invoice per enrolled student; a student is never double-billed for the same month.
 * Invoices move draft → sent → paid. Kept separate from the wholesale order/AR store.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { listStudents, listClasses, listEnrollments } from "./store";
import { buildTuitionRun, isBillingMonth, type TuitionLine } from "./billing";

export type TuitionStatus = "draft" | "sent" | "paid";
export interface TuitionInvoice {
  id: string;
  studentId: string;
  studentName: string;
  month: string;        // YYYY-MM
  lines: TuitionLine[];
  totalCents: number;
  status: TuitionStatus;
  createdAt: string;
}

const holder = globalThis as unknown as { __tuition?: TuitionInvoice[] };
const file = () => path.join(dataDirectory(), "tuition.json");

function loadFromDisk(): TuitionInvoice[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: TuitionInvoice[]) {
  holder.__tuition = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `tuition-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): TuitionInvoice[] {
  if (holder.__tuition) return holder.__tuition;
  holder.__tuition = loadFromDisk() ?? [];
  return holder.__tuition;
}

export function listTuition(month?: string): TuitionInvoice[] {
  return state().filter((i) => !month || i.month === month).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((i) => ({ ...i }));
}

export interface RunResult { created: number; skipped: number; invoices: TuitionInvoice[] }

/** Generate the tuition run for a month from current enrollments. Idempotent per student+month. */
export function generateMonthlyRun(month: string): RunResult {
  if (!isBillingMonth(month)) throw new Error("Pick a valid billing month (YYYY-MM).");
  const drafts = buildTuitionRun(listStudents(), listClasses(), listEnrollments());
  const existing = state();
  const alreadyBilled = new Set(existing.filter((i) => i.month === month).map((i) => i.studentId));

  const now = new Date().toISOString();
  const created: TuitionInvoice[] = [];
  for (const d of drafts) {
    if (alreadyBilled.has(d.studentId)) continue;
    created.push({ id: randomUUID(), studentId: d.studentId, studentName: d.studentName, month, lines: d.lines, totalCents: d.totalCents, status: "draft", createdAt: now });
  }
  if (created.length) persist([...existing, ...created]);
  return { created: created.length, skipped: drafts.length - created.length, invoices: created };
}

export function setTuitionStatus(id: string, status: TuitionStatus): TuitionInvoice {
  const list = state();
  const inv = list.find((i) => i.id === id);
  if (!inv) throw new Error("Invoice not found.");
  const next = { ...inv, status };
  persist(list.map((i) => (i.id === id ? next : i)));
  return next;
}

export function removeTuition(id: string): void {
  persist(state().filter((i) => i.id !== id));
}

export interface TuitionSummary { month: string; billedCents: number; paidCents: number; outstandingCents: number; count: number }
export function tuitionSummary(month: string): TuitionSummary {
  const inv = state().filter((i) => i.month === month);
  const paidCents = inv.filter((i) => i.status === "paid").reduce((n, i) => n + i.totalCents, 0);
  const billedCents = inv.reduce((n, i) => n + i.totalCents, 0);
  return { month, billedCents, paidCents, outstandingCents: billedCents - paidCents, count: inv.length };
}
