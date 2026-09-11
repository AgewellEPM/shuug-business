/**
 * Shared customer communications — conversations attached to the right customer,
 * each with an OWNER and a reply status so two people don't both reply (or both
 * assume someone else did). Durable (comms.json). Feeds the customer timeline.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";

export type CommChannel = "email" | "call" | "message" | "note";
export type CommDirection = "in" | "out";

export interface Comm {
  id: string;
  customerId: string;
  channel: CommChannel;
  direction: CommDirection;
  subject: string;
  body: string;
  from: string;
  at: string; // ISO datetime
  /** team member id who owns the reply, or null (unclaimed). */
  ownerId: string | null;
  replied: boolean;
}

const holder = globalThis as unknown as { __comms?: Comm[] };
const file = () => path.join(dataDirectory(), "comms.json");

function seed(): Comm[] {
  const iso = (d: string) => new Date(`${d}T15:00:00Z`).toISOString();
  return [
    { id: "seed-c1", customerId: "joes-market", channel: "email", direction: "in", subject: "Wholesale order inquiry", body: "Can we get the usual case pricing on Zhoug and Amba?", from: "buyer@joesmarket.com", at: iso("2026-09-08"), ownerId: "alex", replied: false },
    { id: "seed-c2", customerId: "joes-market", channel: "call", direction: "out", subject: "Followed up on reorder", body: "Left voicemail about the September reorder.", from: "Alex Rivera", at: iso("2026-09-06"), ownerId: "alex", replied: true },
  ];
}

function loadFromDisk(): Comm[] | null {
  try {
    const v = JSON.parse(readFileSync(file(), "utf8"));
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}
function persist(list: Comm[]) {
  holder.__comms = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `comms-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): Comm[] {
  if (holder.__comms) return holder.__comms;
  holder.__comms = loadFromDisk() ?? (process.env.DEMO_DATA === "true" ? seed() : []);
  return holder.__comms;
}

export function listComms(customerId: string): Comm[] {
  return state().filter((c) => c.customerId === customerId).sort((a, b) => b.at.localeCompare(a.at)).map((c) => ({ ...c }));
}

export interface NewComm { customerId: string; channel: CommChannel; direction: CommDirection; subject: string; body: string; from: string; ownerId?: string | null }
export function addComm(input: NewComm): Comm {
  const comm: Comm = {
    id: randomUUID(),
    customerId: input.customerId,
    channel: input.channel,
    direction: input.direction,
    subject: input.subject.trim().slice(0, 200),
    body: input.body.trim().slice(0, 4000),
    from: input.from.trim().slice(0, 160),
    at: new Date().toISOString(),
    ownerId: input.ownerId ?? null,
    // outbound messages are already "replied" (they ARE the reply).
    replied: input.direction === "out",
  };
  persist([...state(), comm]);
  return comm;
}

export function assignComm(id: string, ownerId: string | null): Comm {
  const list = state();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown message ${id}`);
  const next = { ...c, ownerId };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}

export function markReplied(id: string, replied: boolean): Comm {
  const list = state();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown message ${id}`);
  const next = { ...c, replied };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}
