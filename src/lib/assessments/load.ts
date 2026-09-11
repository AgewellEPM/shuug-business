/**
 * Assemble the Assessments view for THIS business: the templates for its configured
 * industry (plus universal ones), each with how many times it's been run and its
 * pass rate, and the most recent completed assessments. Reads the active industry
 * from branding defensively — if that isn't set yet, every template is offered.
 */
import { getBranding } from "../branding/store";
import { templatesForIndustry } from "./catalog";
import { listCompleted, type CompletedAssessment } from "./store";
import type { AssessmentTemplate } from "./model";

export function activeIndustryId(): string | null {
  try {
    const b = getBranding() as { industrySetup?: { industryId?: string } | null };
    return b.industrySetup?.industryId ?? null;
  } catch { return null; }
}

export interface TemplateCard {
  template: AssessmentTemplate;
  runs: number;
  passRate: number | null;   // % passed of scored runs, null if never run
  lastRunISO: string | null;
}

export interface AssessmentsOverview {
  industryId: string | null;
  cards: TemplateCard[];
  recent: CompletedAssessment[];
  totalRuns: number;
}

export function loadAssessments(): AssessmentsOverview {
  const industryId = activeIndustryId();
  const templates = templatesForIndustry(industryId);
  const all = listCompleted();

  const cards: TemplateCard[] = templates.map((template) => {
    const runs = all.filter((a) => a.templateId === template.id);
    const scored = runs.filter((a) => a.result.result !== "incomplete");
    const passed = scored.filter((a) => a.result.result === "pass").length;
    return {
      template,
      runs: runs.length,
      passRate: scored.length ? Math.round((passed / scored.length) * 100) : null,
      lastRunISO: runs[0]?.createdAt ?? null,
    };
  });

  return { industryId, cards, recent: all.slice(0, 12), totalRuns: all.length };
}
