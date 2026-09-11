/**
 * AI Handlers — the product idea: the owner never builds an agent. They answer one
 * question ("What do you wish AI could do for your business?"), and Shuug compiles
 * that wish into a Handler: a named worker with a defined responsibility, a set of
 * allowed actions drawn from Shuug's real capabilities, and clear approval + escalation
 * boundaries. This file holds the pure types + performance math. No I/O.
 */

/** A Handler runs in one of three modes. */
export type HandlerMode = "off" | "ask" | "on";
//  off = not running · ask = proposes actions, owner approves each · on = acts within its allowed boundaries

/** The standardized capability surface Shuug exposes to Handlers. */
export type CapabilityKind = "data" | "action" | "channel";

export interface Capability {
  id: string;
  label: string;
  kind: CapabilityKind;
  /** what makes this capability actually real (a module/feature or a connected integration). */
  requires?: { feature?: string; integration?: string };
}

/** A Handler template = a pre-built AI capability package the compiler can propose. */
export interface HandlerTemplate {
  id: string;
  name: string;          // "Appointment Handler"
  icon: string;
  /** the plain-language outcome it delivers. */
  outcome: string;
  /** words in the owner's wish that point at this handler. */
  intents: string[];
  /** capability ids it draws on. */
  capabilities: string[];
  /** what it can do (the bullets shown to the owner). */
  canDo: string[];
  /** the boundaries where it must ask a human first. */
  asksFirst: string[];
  /** when it hands off entirely to a person. */
  escalates: string[];
  /** documented human minutes per handled request — basis for the (estimated) hours-avoided figure. */
  baselineMinutesPerRequest: number;
  /** the mode a newly-created handler starts in (never "on" — approval required first). */
  defaultMode: HandlerMode;
}

/** A Handler the owner has created from a template. */
export interface Handler {
  id: string;
  templateId: string;
  name: string;
  mode: HandlerMode;
  /** capability ids the owner has explicitly granted (subset of the template's). */
  grantedCapabilities: string[];
  createdAt: string;
}

export type ActivityOutcome = "autonomous" | "escalated" | "failed" | "proposed";

export interface HandlerActivity {
  id: string;
  handlerId: string;
  at: string;
  outcome: ActivityOutcome;
  summary: string;
}

export interface HandlerPerformance {
  received: number;
  autonomous: number;
  escalated: number;
  failed: number;
  proposed: number;
  /** completed autonomously ÷ (received − proposed), 0–100. */
  autonomyPct: number;
  /** ESTIMATED, from the documented human baseline — always labeled as an estimate. */
  hoursSavedEstimate: number;
}

/**
 * Roll a handler's activity into performance. Autonomy is measured against actually
 * handled requests (autonomous + escalated + failed), not proposals awaiting approval.
 */
export function performance(activity: HandlerActivity[], baselineMinutesPerRequest: number): HandlerPerformance {
  const received = activity.length;
  const autonomous = activity.filter((a) => a.outcome === "autonomous").length;
  const escalated = activity.filter((a) => a.outcome === "escalated").length;
  const failed = activity.filter((a) => a.outcome === "failed").length;
  const proposed = activity.filter((a) => a.outcome === "proposed").length;
  const handled = autonomous + escalated + failed;
  return {
    received, autonomous, escalated, failed, proposed,
    autonomyPct: handled > 0 ? Math.round((autonomous / handled) * 1000) / 10 : 0,
    hoursSavedEstimate: Math.round((autonomous * baselineMinutesPerRequest) / 60 * 10) / 10,
  };
}
