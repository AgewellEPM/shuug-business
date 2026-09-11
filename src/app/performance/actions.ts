"use server";

import { loadScorecards } from "@/lib/performance/load";
import { generateReview, type ReviewPeriod } from "@/lib/performance/review";
import { requireSectionAccess } from "@/lib/permissions/guard";

export interface ReviewResponse { ok: boolean; text?: string; source?: "ai" | "rules"; model?: string | null; error?: string }

/** Run the AI business-analyst review for one employee (daily or weekly). */
export async function generateReviewAction(memberId: string, period: ReviewPeriod): Promise<ReviewResponse> {
  try {
    await requireSectionAccess("team", "edit");
    const { scorecards } = await loadScorecards();
    const card = scorecards.find((s) => s.id === memberId);
    if (!card) return { ok: false, error: "Unknown team member" };
    const r = await generateReview(card, period === "weekly" ? "weekly" : "daily");
    return { ok: true, text: r.text, source: r.source, model: r.model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Review failed" };
  }
}
