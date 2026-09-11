/**
 * Pipeline store — durable (pipeline.json). Moving a deal to a new stage stamps
 * the entry time (for days-in-stage) and resets probability to that stage's
 * default unless the owner set one. Won/Lost are terminal.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { defaultProbability, type Deal, type Stage } from "./model";

const holder = globalThis as unknown as { __pipeline?: Deal[] };
const file = () => path.join(dataDirectory(), "pipeline.json");

function seed(): Deal[] {
  const now = new Date().toISOString();
  const mk = (over: Partial<Deal>): Deal => ({
    id: randomUUID(), title: "", company: "", contact: "", customerId: null, stage: "new", assignedTo: null,
    expectedValueCents: 0, probability: 10, source: "", nextAction: "", nextActionDate: null, lostReason: "",
    notes: "", createdAt: now, updatedAt: now, stageEnteredAt: now, ...over,
  });
  return [
    mk({ title: "Whole Foods NE — wholesale", company: "Whole Foods NE", stage: "proposal", assignedTo: "alex", expectedValueCents: 480000, probability: 60, source: "Referral", nextAction: "Follow up on the case-pricing proposal" }),
    mk({ title: "Coop Market — new account", company: "Coop Market", stage: "qualified", assignedTo: "jordan", expectedValueCents: 120000, probability: 30, source: "Website", nextAction: "Send samples" }),
    mk({ title: "Corner Deli — reorder inquiry", company: "Corner Deli", stage: "new", assignedTo: null, expectedValueCents: 60000, probability: 10, source: "Inbound email", nextAction: "Qualify volume" }),
  ];
}

function loadFromDisk(): Deal[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: Deal[]) {
  holder.__pipeline = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `pipeline-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): Deal[] {
  if (holder.__pipeline) return holder.__pipeline;
  holder.__pipeline = loadFromDisk() ?? seed();
  return holder.__pipeline;
}

export function listDeals(): Deal[] { return state().map((d) => ({ ...d })); }

export interface NewDeal { title: string; company: string; contact?: string; expectedValueCents: number; assignedTo?: string | null; source?: string; nextAction?: string; customerId?: string | null }
export function createDeal(input: NewDeal): Deal {
  const now = new Date().toISOString();
  const d: Deal = {
    id: randomUUID(), title: input.title.trim().slice(0, 160), company: input.company.trim().slice(0, 160), contact: (input.contact ?? "").slice(0, 160),
    customerId: input.customerId ?? null, stage: "new", assignedTo: input.assignedTo ?? null, expectedValueCents: Math.max(0, Math.round(input.expectedValueCents)),
    probability: defaultProbability("new"), source: (input.source ?? "").slice(0, 80), nextAction: (input.nextAction ?? "").slice(0, 200), nextActionDate: null, lostReason: "",
    notes: "", createdAt: now, updatedAt: now, stageEnteredAt: now,
  };
  persist([...state(), d]);
  return d;
}

function patch(id: string, fn: (d: Deal) => Deal): Deal {
  const list = state();
  const cur = list.find((x) => x.id === id);
  if (!cur) throw new Error(`Unknown deal ${id}`);
  const next = { ...fn(cur), updatedAt: new Date().toISOString() };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}

export function moveStage(id: string, stage: Stage): Deal {
  return patch(id, (d) => ({ ...d, stage, stageEnteredAt: new Date().toISOString(), probability: defaultProbability(stage) }));
}
export function markLost(id: string, reason: string): Deal {
  return patch(id, (d) => ({ ...d, stage: "lost", stageEnteredAt: new Date().toISOString(), probability: 0, lostReason: reason.slice(0, 200) }));
}
export function updateDeal(id: string, fields: Partial<Pick<Deal, "title" | "company" | "contact" | "assignedTo" | "expectedValueCents" | "source" | "nextAction" | "nextActionDate" | "probability" | "notes">>): Deal {
  return patch(id, (d) => ({ ...d, ...fields }));
}
