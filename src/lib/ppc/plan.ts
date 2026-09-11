/**
 * Pure PPC plan types + campaign-structure builder. No LLM/SDK imports, so this
 * is safe to use in client components alongside ./economics.
 */
import type { CampaignEconomics, KeywordEconomics } from "./economics";
import type { Market } from "./market";

export const HEADLINE_MAX = 30;
export const DESCRIPTION_MAX = 90;

export interface CampaignPlan {
  campaignName: string;
  dailyBudgetCents: number;
  keywords: string[];
  skipKeywords: string[];
  finalUrl: string;
  maxCpcCents: number;
  market: Market;
  negativeKeywords: string[];
}

export interface AdAsset {
  text: string;
  chars: number;
  withinLimit: boolean;
}
export interface GeneratedAds {
  ok: boolean;
  headlines: AdAsset[];
  descriptions: AdAsset[];
  error?: string;
}

export function buildCampaignPlan(productName: string, econ: CampaignEconomics): CampaignPlan {
  const bid = (r: KeywordEconomics) => r.verdict === "worth" || r.verdict === "marginal";
  const budgetSource = econ.rows.filter(bid).reduce((n, r) => n + r.monthlySpendCents, 0);
  return {
    campaignName: `${productName} — Wholesale PPC`,
    dailyBudgetCents: Math.max(500, Math.round(budgetSource / 30)),
    keywords: econ.rows.filter(bid).map((r) => r.keyword),
    skipKeywords: econ.rows.filter((r) => r.verdict === "skip").map((r) => r.keyword),
    finalUrl: "https://shuug.co/collections/wholesale",
    maxCpcCents: Math.max(1, Math.min(...econ.rows.filter(bid).map(r => r.breakEvenCpcCents), 100)),
    market: "US",
    negativeKeywords: ["recipe", "recipes", "jobs", "free", "private label"],
  };
}
