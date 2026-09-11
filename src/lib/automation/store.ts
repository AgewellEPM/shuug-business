/**
 * Automation rules store — durable (automation-rules.json). Ships with a sensible
 * default rule set the owner can edit, toggle, or delete. Cents-free.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { SIGNAL_KINDS, type AutomationRule, type SignalKind, type RuleAction, type RuleOperator } from "./model";

const holder = globalThis as unknown as { __automationRules?: AutomationRule[] };
const file = () => path.join(dataDirectory(), "automation-rules.json");

/** Starter rules — every small business wants these on day one. */
function defaults(): AutomationRule[] {
  const at = new Date().toISOString();
  const rule = (name: string, trigger: SignalKind, operator: RuleOperator, threshold: number, action: RuleAction): AutomationRule => ({
    id: randomUUID(), name, enabled: true, trigger, operator, threshold, action, channel: null, createdAt: at,
  });
  return [
    rule("Warn me 30 days before a license or insurance lapses", "document-expiring", "lte", 30, "notify"),
    rule("Follow up when an invoice is 15+ days overdue", "invoice-overdue", "gte", 15, "create-task"),
    rule("Chase quotes still open after 7 days", "quote-pending", "gte", 7, "create-task"),
    rule("Flag orders over $10,000 for a second look", "large-order", "gte", 10000, "flag"),
    rule("Reach out when a customer goes quiet for 60 days", "customer-dormant", "gte", 60, "notify"),
  ];
}

function loadFromDisk(): AutomationRule[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: AutomationRule[]) {
  holder.__automationRules = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `automation-rules-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): AutomationRule[] {
  if (holder.__automationRules) return holder.__automationRules;
  const disk = loadFromDisk();
  holder.__automationRules = disk ?? defaults();
  if (!disk) persist(holder.__automationRules); // seed defaults on first run
  return holder.__automationRules;
}

export function listRules(): AutomationRule[] {
  return state().slice().map((r) => ({ ...r }));
}

export interface NewRule {
  name: string; trigger: SignalKind; operator?: RuleOperator; threshold: number; action: RuleAction; channel?: string | null;
}
export function addRule(input: NewRule): AutomationRule {
  if (!(input.trigger in SIGNAL_KINDS)) throw new Error(`Unknown trigger ${input.trigger}`);
  const rule: AutomationRule = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 160) || "Untitled rule",
    enabled: true,
    trigger: input.trigger,
    operator: input.operator ?? SIGNAL_KINDS[input.trigger].defaultOperator,
    threshold: Number.isFinite(input.threshold) ? Math.round(input.threshold) : 0,
    action: input.action,
    channel: input.channel ?? null,
    createdAt: new Date().toISOString(),
  };
  persist([...state(), rule]);
  return rule;
}

export function setRuleEnabled(id: string, enabled: boolean): AutomationRule {
  const list = state();
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown rule ${id}`);
  const next = { ...r, enabled };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}

export function updateRule(id: string, patch: Partial<Pick<AutomationRule, "name" | "operator" | "threshold" | "action" | "channel">>): AutomationRule {
  const list = state();
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown rule ${id}`);
  const next: AutomationRule = {
    ...r,
    name: patch.name !== undefined ? patch.name.trim().slice(0, 160) || r.name : r.name,
    operator: patch.operator ?? r.operator,
    threshold: patch.threshold !== undefined && Number.isFinite(patch.threshold) ? Math.round(patch.threshold) : r.threshold,
    action: patch.action ?? r.action,
    channel: patch.channel !== undefined ? patch.channel : r.channel,
  };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}

export function removeRule(id: string): void {
  persist(state().filter((r) => r.id !== id));
}
