/**
 * The guarded state-transition engine — what makes Shuug a business ENGINE, not a
 * dashboard. A workflow is a set of states and the transitions between them; every
 * transition has GUARDS (preconditions). Evaluating a transition is pure: it returns
 * whether the move is allowed and exactly which checks passed or failed — the same
 * decision whether the actor is a person clicking a button, a website posting a form,
 * or an AI handler. Nobody advances a status by poking a field; they go through here.
 *
 * The executor (see ./workorder) then applies the change atomically, writes an audit
 * record (who → what was checked → what changed → when), and is idempotent on retry.
 */

/** A guard returns true to pass, or a human reason string to block. */
export type GuardResult = true | string;
export interface Guard<C> { id: string; label: string; check: (ctx: C) => GuardResult }

export interface Transition<C> {
  id: string;
  label: string;
  from: string;
  to: string;
  requires: Guard<C>[];
}

export interface Workflow<C> {
  entity: string;
  states: readonly string[];
  initial: string;
  transitions: Transition<C>[];
}

export interface CheckOutcome { guardId: string; label: string; passed: boolean; reason?: string }

export interface TransitionDecision {
  transitionId: string;
  label: string;
  from: string;
  to: string;
  allowed: boolean;
  checks: CheckOutcome[];
  blockedReason?: string;
}

/** Pure gate: can we make this transition from this state, given the context? */
export function evaluateTransition<C>(wf: Workflow<C>, currentState: string, transitionId: string, ctx: C): TransitionDecision {
  const t = wf.transitions.find((x) => x.id === transitionId);
  if (!t) return { transitionId, label: transitionId, from: currentState, to: currentState, allowed: false, checks: [], blockedReason: "Unknown transition." };
  if (t.from !== currentState) {
    return { transitionId, label: t.label, from: currentState, to: t.to, allowed: false, checks: [], blockedReason: `Can't ${t.label.toLowerCase()} from "${currentState}".` };
  }
  const checks: CheckOutcome[] = t.requires.map((g) => {
    const r = g.check(ctx);
    return { guardId: g.id, label: g.label, passed: r === true, reason: r === true ? undefined : r };
  });
  const failed = checks.find((c) => !c.passed);
  return { transitionId, label: t.label, from: currentState, to: t.to, allowed: !failed, checks, blockedReason: failed?.reason };
}

/** Every transition reachable from the current state, each with its live decision. */
export function availableTransitions<C>(wf: Workflow<C>, currentState: string, ctx: C): TransitionDecision[] {
  return wf.transitions.filter((t) => t.from === currentState).map((t) => evaluateTransition(wf, currentState, t.id, ctx));
}

export function isTerminal<C>(wf: Workflow<C>, state: string): boolean {
  return !wf.transitions.some((t) => t.from === state);
}
