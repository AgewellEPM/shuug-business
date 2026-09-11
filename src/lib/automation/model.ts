/**
 * Owner-controlled automation rules (#25) — "when THIS is true, do THAT".
 *
 * The business continuously emits Signals (a license is 20 days from expiring,
 * an invoice is 45 days overdue, an order is $12k, a customer has gone quiet).
 * A Rule watches one signal kind and fires when the signal's magnitude crosses
 * the owner's threshold. Pure evaluation — no I/O, fully testable. The loader
 * gathers the signals; the page renders what would fire and runs the actions.
 */

export type SignalKind = "document-expiring" | "invoice-overdue" | "quote-pending" | "large-order" | "customer-dormant";
export type RuleOperator = "gte" | "lte";
export type RuleAction = "notify" | "create-task" | "flag";

export interface Signal {
  kind: SignalKind;
  entityId: string;
  entityLabel: string;
  /** magnitude compared against the threshold — see UNIT below for what it means per kind. */
  value: number;
  detail: string;
  href?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: SignalKind;
  operator: RuleOperator;
  threshold: number;
  action: RuleAction;
  /** delivery target for `notify` (e.g. "email", "slack") — fail-closed until connected. */
  channel: string | null;
  createdAt: string;
}

/** Per-kind metadata: the unit of `value`, the natural operator, and copy. */
export const SIGNAL_KINDS: Record<SignalKind, { label: string; unit: string; defaultOperator: RuleOperator; help: string }> = {
  "document-expiring": { label: "Document expiring", unit: "days until expiry", defaultOperator: "lte", help: "License / insurance / permit nearing its renewal date" },
  "invoice-overdue": { label: "Invoice overdue", unit: "days overdue", defaultOperator: "gte", help: "An invoice past its due date" },
  "quote-pending": { label: "Quote pending", unit: "days open", defaultOperator: "gte", help: "A sent quote not yet accepted or declined" },
  "large-order": { label: "Large order", unit: "dollars", defaultOperator: "gte", help: "An order above a dollar amount" },
  "customer-dormant": { label: "Customer went quiet", unit: "days since last order", defaultOperator: "gte", help: "A customer with no recent orders" },
};

export const RULE_ACTIONS: Record<RuleAction, { label: string; help: string }> = {
  notify: { label: "Notify", help: "Raise an alert (and send to a channel once connected)" },
  "create-task": { label: "Create a task", help: "Queue a follow-up task for the team" },
  flag: { label: "Flag it", help: "Mark the record so it stands out" },
};

export function passes(operator: RuleOperator, value: number, threshold: number): boolean {
  return operator === "gte" ? value >= threshold : value <= threshold;
}

export interface FiredRule {
  rule: AutomationRule;
  matches: Signal[];
}

/**
 * Evaluate every enabled rule against the current signals. A rule fires for each
 * signal of its trigger kind whose value crosses the threshold. Disabled rules
 * and non-matching kinds are skipped. Deterministic: matches keep signal order.
 */
export function evaluate(rules: AutomationRule[], signals: Signal[]): FiredRule[] {
  const fired: FiredRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matches = signals.filter((s) => s.kind === rule.trigger && passes(rule.operator, s.value, rule.threshold));
    if (matches.length > 0) fired.push({ rule, matches });
  }
  return fired;
}

export interface AutomationSummary {
  totalRules: number;
  enabledRules: number;
  firedRules: number;
  actionsQueued: number;
}

export function summarize(rules: AutomationRule[], fired: FiredRule[]): AutomationSummary {
  return {
    totalRules: rules.length,
    enabledRules: rules.filter((r) => r.enabled).length,
    firedRules: fired.length,
    actionsQueued: fired.reduce((n, f) => n + f.matches.length, 0),
  };
}
