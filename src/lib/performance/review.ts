/**
 * AI business-analyst reviews of an employee scorecard. The AI is grounded ONLY
 * in the deterministic metrics (never invents numbers), and judges honestly:
 * asset vs. expense, what they're doing, and what to do about it. Fail-closed —
 * with no LLM configured it returns a solid rule-based review so the feature
 * always works, day-to-day and weekly.
 */
import { llmChat, llmConfigured, llmLabel } from "../llm";
import type { Scorecard } from "./scorecard";

const usd = (c: number | null) => (c === null ? "—" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

export type ReviewPeriod = "daily" | "weekly";

export function reviewGrounding(s: Scorecard): string {
  return [
    `Name: ${s.name}`,
    `Role: ${s.role} (${s.isRevenueRole ? "revenue-generating" : "support / enablement"})`,
    `Annual salary/cost: ${usd(s.salaryCents)}`,
    `Revenue attributed: ${usd(s.revenueAttributedCents)} across ${s.accountsOwned} accounts, ${s.ordersCount} orders`,
    s.valueMultiple !== null ? `Value multiple (revenue ÷ salary): ${s.valueMultiple.toFixed(2)}×` : `Value multiple: n/a (support role or no salary)`,
    s.roiPct !== null ? `ROI on their cost: ${s.roiPct}%` : `ROI: n/a`,
    s.profitContributionCents !== null ? `Net dollars made after their cost: ${usd(s.profitContributionCents)}` : ``,
    `Work done: ${s.tasksDone} tasks (${s.storyPointsDone} story points, ${s.xp} XP), ${s.tasksOpen} open`,
    s.supportScore !== null ? `Support throughput score: ${s.supportScore}/100` : ``,
    `System verdict: ${s.verdict.tier} — ${s.verdict.rationale}`,
  ].filter(Boolean).join("\n");
}

const SYSTEM = `You are a sharp, fair business analyst reviewing an employee for a small food business owner.
Judge honestly whether this person is an asset or an expense to the organization, based ONLY on the metrics given.
Never invent numbers. For revenue roles, weigh money brought in against their salary (aim: 5×+ salary = clear asset).
For support roles, value is throughput and reliability — do NOT call them an expense just because they don't sell.
Write 3-4 tight sentences: what they're doing, their worth to the org, and one concrete action. No preamble.`;

export function deterministicReview(s: Scorecard, period: ReviewPeriod): string {
  const when = period === "weekly" ? "This week" : "Today";
  if (s.isRevenueRole) {
    if (s.valueMultiple === null) return `${when}: ${s.name} owns ${s.accountsOwned} accounts and closed ${s.ordersCount} orders (${usd(s.revenueAttributedCents)}). Add their salary to judge ROI and whether they're carrying their cost.`;
    const worth = s.valueMultiple >= 5 ? "a clear asset — well above the 5× bar" : s.valueMultiple >= 1 ? "paying for themselves" : "below their cost right now";
    return `${when}: ${s.name} brought in ${usd(s.revenueAttributedCents)} across ${s.accountsOwned} accounts — ${s.valueMultiple.toFixed(1)}× their salary (ROI ${s.roiPct}%), net ${usd(s.profitContributionCents)}. That makes them ${worth}. ${s.valueMultiple < 3 ? "Coach on larger deals or hand them higher-value accounts." : "Protect this relationship and give them more accounts."}`;
  }
  const rel = s.supportScore! >= 75 ? "the backbone of the support team" : s.supportScore! >= 50 ? "a reliable contributor" : s.supportScore! >= 25 ? "contributing but underused" : "under-utilized";
  return `${when}: ${s.name} (${s.role}) shipped ${s.tasksDone} tasks / ${s.storyPointsDone} story points — throughput ${s.supportScore}/100, making them ${rel}. They don't sell, but they enable the revenue team. ${s.supportScore! < 50 ? "Check their workload and assignments." : "Keep the pipeline of work flowing to them."}`;
}

export interface ReviewResult { text: string; source: "ai" | "rules"; model: string | null }

export async function generateReview(s: Scorecard, period: ReviewPeriod): Promise<ReviewResult> {
  const fallback = deterministicReview(s, period);
  if (!llmConfigured()) return { text: fallback, source: "rules", model: null };
  try {
    const res = await llmChat({
      system: SYSTEM,
      messages: [{ role: "user", content: `Write a ${period} performance review for this employee.\n\n${reviewGrounding(s)}` }],
      maxTokens: 300,
      temperature: 0.4,
    });
    if (res.ok && res.text?.trim()) return { text: res.text.trim(), source: "ai", model: llmLabel() };
    return { text: fallback, source: "rules", model: null };
  } catch {
    return { text: fallback, source: "rules", model: null };
  }
}
