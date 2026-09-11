/**
 * Handlers store — durable (handlers.json): the Handlers the owner has created and
 * their activity log. New handlers always start in "ask" (approval required) — never
 * live until the owner explicitly turns them on. Atomic write, globalThis cache.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { templateById } from "./templates";
import type { Handler, HandlerActivity, HandlerMode, ActivityOutcome } from "./model";

interface State { handlers: Handler[]; activity: HandlerActivity[] }
const holder = globalThis as unknown as { __handlers?: State };
const file = () => path.join(dataDirectory(), "handlers.json");

function loadFromDisk(): State | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return v && Array.isArray(v.handlers) ? { handlers: v.handlers, activity: v.activity ?? [] } : null; } catch { return null; }
}
function persist(s: State) {
  holder.__handlers = s;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `handlers-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): State {
  if (holder.__handlers) return holder.__handlers;
  holder.__handlers = loadFromDisk() ?? { handlers: [], activity: [] };
  return holder.__handlers;
}

export function listHandlers(): Handler[] { return state().handlers.map((h) => ({ ...h, grantedCapabilities: [...h.grantedCapabilities] })); }
export function getHandler(id: string): Handler | null { const h = state().handlers.find((x) => x.id === id); return h ? { ...h, grantedCapabilities: [...h.grantedCapabilities] } : null; }

/** Create a handler from a template. Starts in "ask" — approval required, never live. */
export function createHandler(templateId: string, grantedCapabilities?: string[]): Handler {
  const t = templateById(templateId);
  if (!t) throw new Error("Unknown handler template.");
  const s = state();
  const handler: Handler = {
    id: randomUUID(), templateId, name: t.name, mode: "ask",
    grantedCapabilities: grantedCapabilities ?? [...t.capabilities], createdAt: new Date().toISOString(),
  };
  persist({ ...s, handlers: [...s.handlers, handler] });
  return handler;
}

export function setMode(id: string, mode: HandlerMode): Handler {
  const s = state();
  const h = s.handlers.find((x) => x.id === id);
  if (!h) throw new Error("Handler not found.");
  const next = { ...h, mode };
  persist({ ...s, handlers: s.handlers.map((x) => (x.id === id ? next : x)) });
  return next;
}

export function setGrantedCapabilities(id: string, caps: string[]): Handler {
  const s = state();
  const h = s.handlers.find((x) => x.id === id);
  if (!h) throw new Error("Handler not found.");
  const t = templateById(h.templateId);
  const allowed = new Set(t?.capabilities ?? []);
  const next = { ...h, grantedCapabilities: caps.filter((c) => allowed.has(c)) };
  persist({ ...s, handlers: s.handlers.map((x) => (x.id === id ? next : x)) });
  return next;
}

export function removeHandler(id: string): void {
  const s = state();
  persist({ handlers: s.handlers.filter((h) => h.id !== id), activity: s.activity.filter((a) => a.handlerId !== id) });
}

export function logActivity(handlerId: string, outcome: ActivityOutcome, summary: string): HandlerActivity {
  const s = state();
  const entry: HandlerActivity = { id: randomUUID(), handlerId, at: new Date().toISOString(), outcome, summary: summary.slice(0, 300) };
  persist({ ...s, activity: [...s.activity, entry].slice(-2000) });
  return entry;
}

export function listActivity(handlerId?: string): HandlerActivity[] {
  return state().activity.filter((a) => !handlerId || a.handlerId === handlerId).slice().reverse();
}
