/**
 * Quotes & estimates — priced offers a customer can accept, with an expiration
 * and a clean path into a real order. Durable (quotes.json). Status transitions
 * are pure; converting an accepted quote into an order happens in the server
 * action (which owns the deal store). Feeds the customer timeline + portal.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";

export type QuoteStatus = "sent" | "accepted" | "declined" | "expired" | "converted";

export interface QuoteLine { skuId: string; name: string; cases: number; unitPriceCents: number; lineTotalCents: number }
export interface Quote {
  id: string;
  customerId: string;
  createdAt: string; // ISO datetime
  expiresAt: string; // ISO date
  status: QuoteStatus;
  lines: QuoteLine[];
  subtotalCents: number;
  note: string;
  orderId?: string; // set when converted
}

const holder = globalThis as unknown as { __quotes?: Quote[] };
const file = () => path.join(dataDirectory(), "quotes.json");

function loadFromDisk(): Quote[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: Quote[]) {
  holder.__quotes = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `quotes-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): Quote[] {
  if (holder.__quotes) return holder.__quotes;
  holder.__quotes = loadFromDisk() ?? [];
  return holder.__quotes;
}

/** Effective status: a still-"sent" quote past its date reads as expired. */
export function effectiveStatus(q: Quote, today: string): QuoteStatus {
  return q.status === "sent" && q.expiresAt < today ? "expired" : q.status;
}
export function isOpen(q: Quote, today: string): boolean {
  return effectiveStatus(q, today) === "sent";
}

export function listQuotes(customerId: string): Quote[] {
  return state().filter((q) => q.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((q) => ({ ...q }));
}
export function getQuote(id: string): Quote | null {
  const q = state().find((x) => x.id === id);
  return q ? { ...q } : null;
}

export interface NewQuote { customerId: string; expiresAt: string; note?: string; lines: { skuId: string; name: string; cases: number; unitPriceCents: number }[] }
export function createQuote(input: NewQuote): Quote {
  const lines: QuoteLine[] = input.lines.map((l) => ({ skuId: l.skuId, name: l.name, cases: l.cases, unitPriceCents: l.unitPriceCents, lineTotalCents: l.cases * l.unitPriceCents }));
  const quote: Quote = {
    id: randomUUID(),
    customerId: input.customerId,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    status: "sent",
    lines,
    subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
    note: (input.note ?? "").slice(0, 500),
  };
  persist([...state(), quote]);
  return quote;
}

export function setQuoteStatus(id: string, status: QuoteStatus, orderId?: string): Quote {
  const list = state();
  const q = list.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown quote ${id}`);
  const next: Quote = { ...q, status, ...(orderId ? { orderId } : {}) };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}
