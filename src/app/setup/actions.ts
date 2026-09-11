"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/**
 * Setup action: paste a URL, we trace the business (products, platform, online
 * presence), remember it, and add a plain-language analyst summary. No technical
 * skill needed — paste and enter.
 */
import { traceBusiness } from "@/lib/onboarding/client";
import { saveProfile } from "@/lib/onboarding/store";
import { llmChat, llmConfigured } from "@/lib/llm";
import { formatCents } from "@/lib/money";
import type { BusinessProfile } from "@/lib/onboarding/trace";

export interface AnalyzeResult {
  ok: boolean;
  profile?: BusinessProfile;
  summary?: string;
  error?: string;
}

async function analystSummary(profile: BusinessProfile): Promise<string | undefined> {
  if (!llmConfigured() || profile.products.length === 0) return undefined;
  const facts = [
    `Business: ${profile.name}`,
    `Website: ${profile.url} (platform: ${profile.platform})`,
    profile.presence.length ? `Also sells / present on: ${profile.presence.map((p) => p.label).join(", ")}` : "",
    `Products (${profile.products.length}):`,
    ...profile.products.slice(0, 30).map((p) => `  - ${p.title}: ${formatCents(p.priceCents)}`),
  ]
    .filter(Boolean)
    .join("\n");
  const res = await llmChat({
    system:
      "You are a friendly small-business analyst. Given a traced business, write 3-4 short sentences in plain language (for a non-technical owner): what the business sells, its price range, where it lives online, and 2 concrete opportunities. No jargon.",
    messages: [{ role: "user", content: facts }],
    temperature: 0.4,
  });
  return res.ok ? res.text : undefined;
}

export async function traceBusinessAction(url: string): Promise<AnalyzeResult> {
  await requireSectionAccess("admin", "edit");

  const result = await traceBusiness(url);
  if (!result.ok || !result.profile) return { ok: false, error: result.error ?? "Trace failed" };
  saveProfile(result.profile);
  const summary = await analystSummary(result.profile);
  return { ok: true, profile: result.profile, summary };
}
