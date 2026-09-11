"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { generateAds, type GeneratedAds } from "@/lib/ppc/generate";
import { pushCampaignToGoogleAds, pullKeywordIdeas, validateCampaign, pullAccountPerformance, type PushResult, type KeywordPullResult, type AccountResult } from "@/lib/ppc/google-ads";
import { discoverCompetitors } from "@/lib/ppc/discovery";
import type { ResearchResult } from "@/lib/ppc/research";
import type { CampaignPlan } from "@/lib/ppc/plan";
import type { Market } from "@/lib/ppc/market";
import { SKUS } from "@/lib/data/seed";

/** This app is a local merchant workspace. Remote credential-backed actions need
 * the deployment owner's access token in the standard Authorization header.
 * A production deployment must supply it through an authenticated gateway. */
async function accessAllowed(): Promise<boolean> {
  try { await requireWorkspaceAccess(); return true; } catch { return false; }
}
const denied = "Open the local merchant workspace, or sign in through your workspace’s authenticated gateway.";
export async function generateAdsAction(productName: string, keywords: string[]): Promise<GeneratedAds> {
  await requireSectionAccess("marketing", "edit");

  if (!await accessAllowed()) return { ok: false, headlines: [], descriptions: [], error: denied };
  const parsed = z.object({ productName: z.enum(SKUS.map(s => s.name) as [string, ...string[]]), keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20) }).safeParse({ productName, keywords });
  if (!parsed.success) return { ok: false, headlines: [], descriptions: [], error: "Choose a product and 1–20 keywords." };
  return generateAds(parsed.data.productName, "Shuug", parsed.data.keywords);
}
export async function validateCampaignAction(plan: CampaignPlan, ads: GeneratedAds): Promise<PushResult> {
  await requireSectionAccess("marketing", "edit");

  if (!await accessAllowed()) return { ok: false, message: denied };
  return validateCampaign(plan, ads);
}
export async function launchAction(reviewId: string): Promise<PushResult> {
  await requireSectionAccess("marketing", "edit");

  if (!await accessAllowed()) return { ok: false, message: denied };
  return pushCampaignToGoogleAds(reviewId);
}
export async function pullCpcAction(seeds: string[], market: Market = "US", website?: string, historical = false): Promise<KeywordPullResult> {
  await requireSectionAccess("marketing", "view");

  if (!await accessAllowed()) return { ok: false, keywords: [], error: denied };
  return pullKeywordIdeas(seeds, market, website, historical);
}
export async function researchAction(query: string, market: Market): Promise<ResearchResult> {
  await requireSectionAccess("marketing", "view");

  if (!await accessAllowed()) return { ok: false, competitors: [], error: denied };
  return discoverCompetitors(query, market);
}
export async function accountPerformanceAction(): Promise<AccountResult> {
  await requireSectionAccess("marketing", "view");

  if (!await accessAllowed()) return { ok: false, error: denied };
  return pullAccountPerformance();
}
