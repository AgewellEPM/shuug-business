/**
 * Label & HACCP compliance helpers — pure. Builds the FDA "Contains:" allergen
 * statement, checks a label for completeness, and summarizes HACCP critical-
 * control-point checks (what's out of limit / needs corrective action).
 */
import { MAJOR_ALLERGENS, type CcpCheck, type ProductLabel } from "./model";

/** FDA-style allergen statement: "Contains: Milk, Sesame." (empty if none). */
export function containsStatement(allergens: string[]): string {
  const clean = [...new Set(allergens.map((a) => a.trim()).filter(Boolean))];
  return clean.length ? `Contains: ${clean.join(", ")}.` : "";
}

export interface LabelCheck {
  ok: boolean;
  issues: string[];
  /** allergens declared that aren't one of the 9 FDA majors (info, not error). */
  nonMajorAllergens: string[];
}

/** Validate a product label has the legally-expected elements. */
export function checkLabel(label: ProductLabel): LabelCheck {
  const issues: string[] = [];
  if (!label.ingredientsStatement.trim()) issues.push("Missing ingredients statement.");
  if (!label.netWeight.trim()) issues.push("Missing net weight.");
  if (label.shelfLifeDays <= 0) issues.push("Set a shelf life (days) for best-by dating.");
  const majors = new Set<string>(MAJOR_ALLERGENS);
  const nonMajorAllergens = label.allergens.filter((a) => !majors.has(a));
  return { ok: issues.length === 0, issues, nonMajorAllergens };
}

export interface HaccpSummary {
  total: number;
  outOfLimit: number;
  openCorrectiveActions: number;
  failing: CcpCheck[];
}

/** Summarize HACCP checks: how many breached a critical limit, and which. */
export function haccpSummary(checks: CcpCheck[]): HaccpSummary {
  const failing = checks.filter((c) => !c.withinLimit);
  return {
    total: checks.length,
    outOfLimit: failing.length,
    openCorrectiveActions: failing.filter((c) => !c.correctiveAction.trim()).length,
    failing,
  };
}
