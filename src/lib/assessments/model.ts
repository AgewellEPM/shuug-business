/**
 * Assessments — the industry-specific inspections, checklists and evaluations a
 * business runs on its actual work: a mechanic's multi-point vehicle inspection, a
 * restaurant line check, a construction site-safety audit, a gym fitness assessment.
 *
 * A template has sections of items; a completed assessment scores them. Pure +
 * cents-free. A failed CRITICAL item fails the whole assessment regardless of score
 * (you can't pass a safety audit with the brakes marked bad, however high the total).
 */

export type ItemType = "pass-fail" | "rating" | "measure" | "note";

export interface AssessmentItem {
  id: string;
  label: string;
  type: ItemType;
  /** a failed critical item fails the whole assessment. */
  critical?: boolean;
  /** rating scale max (default 5). */
  max?: number;
  /** measure unit (e.g. "psi", "°F", "mm"). */
  unit?: string;
  /** guidance shown to the assessor. */
  hint?: string;
}

export interface AssessmentSection { id: string; title: string; items: AssessmentItem[] }

export interface AssessmentTemplate {
  id: string;
  name: string;
  /** industry id it belongs to, or "all" for universal (safety, quality). */
  industry: string;
  /** what's being assessed — "Vehicle", "Kitchen line", "Job site", "Member". */
  subjectLabel: string;
  description: string;
  /** score at or above this fraction passes (default 0.8). */
  passThreshold: number;
  sections: AssessmentSection[];
}

export interface ItemResponse {
  /** for pass-fail: true=pass, false=fail, undefined=not applicable/skipped. */
  pass?: boolean;
  /** for rating items. */
  rating?: number;
  /** for measure items (informational, not scored). */
  value?: number;
  note?: string;
}

export type Responses = Record<string, ItemResponse>;

export interface FlaggedItem { itemId: string; label: string; reason: string; critical: boolean }

export interface SectionScore { id: string; title: string; pct: number | null; scoredItems: number }

export interface AssessmentResult {
  overallPct: number | null;
  sections: SectionScore[];
  result: "pass" | "fail" | "incomplete";
  criticalFails: number;
  flagged: FlaggedItem[];
  answered: number;
  total: number;
}

/** Score one scorable item to 0..1, or null if it isn't scored / not answered. */
function itemScore(item: AssessmentItem, r: ItemResponse | undefined): number | null {
  if (!r) return null;
  if (item.type === "pass-fail") return r.pass === undefined ? null : r.pass ? 1 : 0;
  if (item.type === "rating") return typeof r.rating === "number" ? clamp01(r.rating / (item.max ?? 5)) : null;
  return null; // measure + note are informational
}

/** Roll a completed assessment into section + overall scores, result, and flags. */
export function scoreAssessment(template: AssessmentTemplate, responses: Responses): AssessmentResult {
  const flagged: FlaggedItem[] = [];
  let criticalFails = 0;
  let scoredTotal = 0, scoredSum = 0, answered = 0, total = 0;

  const sections: SectionScore[] = template.sections.map((section) => {
    let sSum = 0, sCount = 0;
    for (const item of section.items) {
      total++;
      const r = responses[item.id];
      if (r && (r.pass !== undefined || r.rating !== undefined || r.value !== undefined || (r.note ?? "") !== "")) answered++;
      const s = itemScore(item, r);
      if (s !== null) {
        sSum += s; sCount++; scoredSum += s; scoredTotal++;
        const failed = (item.type === "pass-fail" && r?.pass === false) || (item.type === "rating" && s <= 0.4);
        if (failed) {
          if (item.critical) criticalFails++;
          flagged.push({ itemId: item.id, label: item.label, reason: item.type === "pass-fail" ? "Marked fail" : `Low rating (${r?.rating}/${item.max ?? 5})`, critical: !!item.critical });
        }
      }
    }
    return { id: section.id, title: section.title, pct: sCount ? Math.round((sSum / sCount) * 100) : null, scoredItems: sCount };
  });

  const overallPct = scoredTotal ? Math.round((scoredSum / scoredTotal) * 100) : null;
  const result: AssessmentResult["result"] =
    scoredTotal === 0 ? "incomplete"
      : criticalFails > 0 ? "fail"
        : (overallPct ?? 0) >= template.passThreshold * 100 ? "pass" : "fail";

  return { overallPct, sections, result, criticalFails, flagged, answered, total };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
