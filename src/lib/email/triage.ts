/**
 * Email triage — when mail comes in, decide what it is, who it should go to, and
 * whether the AI can just handle it or needs to route it back to a human. Pure,
 * rule-based, deterministic (an AI draft is layered on top in the store). This is
 * what lets the inbox mostly run itself and only surface what needs you.
 */
export type EmailCategory =
  | "order"
  | "sample_request"
  | "support"
  | "invoice_ap"
  | "partnership"
  | "spam"
  | "other";

export interface Triage {
  category: EmailCategory;
  /** which team role this should route to. */
  suggestedRole: string;
  /** true when the AI can handle it end-to-end (ack/auto-reply/archive). */
  autoHandle: boolean;
  reason: string;
}

interface Rule {
  category: EmailCategory;
  role: string;
  autoHandle: boolean;
  patterns: RegExp[];
}

// Order matters — first matching rule wins (spam checked early to short-circuit).
const RULES: Rule[] = [
  { category: "spam", role: "—", autoHandle: true, patterns: [/unsubscribe/i, /\bSEO\b/i, /rank your (website|site)/i, /crypto|bitcoin/i, /viagra/i, /guest post/i, /increase your (traffic|sales) guaranteed/i] },
  { category: "sample_request", role: "Sales", autoHandle: true, patterns: [/\bsamples?\b/i, /try (it|them|your)/i, /taste/i, /before (we|i) (buy|order|commit)/i] },
  { category: "order", role: "Sales", autoHandle: false, patterns: [/purchase order|\bP\.?O\.?\b/i, /place an order/i, /re-?order/i, /want to (buy|order|stock)/i, /wholesale order/i] },
  { category: "partnership", role: "Sales", autoHandle: false, patterns: [/carry your|stock your (product|sauce)/i, /distributor|distribution/i, /wholesale (inquiry|pricing|account)/i, /become a (retailer|stockist)/i] },
  { category: "invoice_ap", role: "Money", autoHandle: false, patterns: [/\binvoice\b/i, /payment (due|reminder)/i, /statement of account/i, /remittance/i, /past due/i, /\bbill\b/i] },
  { category: "support", role: "Owner", autoHandle: false, patterns: [/broke|broken|leak(ed|ing)?|damaged|spoiled/i, /refund|complaint|unhappy|disappointed/i, /wrong (item|order|product)/i, /never (arrived|received)/i] },
];

export function triageEmail(email: { subject: string; body: string; from: string }): Triage {
  const haystack = `${email.subject}\n${email.body}\n${email.from}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      return {
        category: rule.category,
        suggestedRole: rule.role,
        autoHandle: rule.autoHandle,
        reason: `Matched ${rule.category} keywords`,
      };
    }
  }
  return { category: "other", suggestedRole: "Owner", autoHandle: false, reason: "No rule matched — routed to owner" };
}
