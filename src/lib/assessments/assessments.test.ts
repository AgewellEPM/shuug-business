import { describe, it, expect } from "vitest";
import { scoreAssessment, type AssessmentTemplate, type Responses } from "./model";
import { ASSESSMENT_TEMPLATES, templatesForIndustry, assessmentById } from "./catalog";

const template: AssessmentTemplate = {
  id: "t", name: "Test", industry: "all", subjectLabel: "Job", description: "test", passThreshold: 0.8,
  sections: [
    { id: "s1", title: "Safety", items: [
      { id: "brakes", label: "Brakes ok", type: "pass-fail", critical: true },
      { id: "lights", label: "Lights ok", type: "pass-fail" },
    ] },
    { id: "s2", title: "Quality", items: [
      { id: "finish", label: "Finish", type: "rating", max: 5 },
      { id: "temp", label: "Temp", type: "measure", unit: "F" },
    ] },
  ],
};

describe("scoreAssessment", () => {
  it("scores pass-fail + rating, ignores measure/note, and passes above threshold", () => {
    const r: Responses = { brakes: { pass: true }, lights: { pass: true }, finish: { rating: 5 }, temp: { value: 40 } };
    const res = scoreAssessment(template, r);
    expect(res.overallPct).toBe(100); // 1 + 1 + 1 over 3 scored (temp not scored)
    expect(res.result).toBe("pass");
    expect(res.sections.find((s) => s.id === "s2")?.pct).toBe(100);
  });

  it("a failed CRITICAL item fails the whole assessment regardless of score", () => {
    const r: Responses = { brakes: { pass: false }, lights: { pass: true }, finish: { rating: 5 } };
    const res = scoreAssessment(template, r);
    expect(res.criticalFails).toBe(1);
    expect(res.result).toBe("fail");
    expect(res.flagged.some((f) => f.itemId === "brakes" && f.critical)).toBe(true);
  });

  it("below-threshold non-critical score fails; low rating is flagged", () => {
    const r: Responses = { brakes: { pass: true }, lights: { pass: false }, finish: { rating: 1 } };
    const res = scoreAssessment(template, r); // scores: 1, 0, 0.2 → 40%
    expect(res.overallPct).toBe(40);
    expect(res.result).toBe("fail");
    expect(res.flagged.some((f) => f.itemId === "finish")).toBe(true);
  });

  it("is incomplete when nothing scorable is answered", () => {
    const res = scoreAssessment(template, { temp: { value: 40 } });
    expect(res.result).toBe("incomplete");
    expect(res.overallPct).toBeNull();
  });
});

describe("template library", () => {
  it("ships a template for every configured industry plus universal ones", () => {
    for (const ind of ["auto-repair", "restaurant", "hvac", "construction", "gym", "salon", "landscaping", "wholesale", "agency", "nonprofit"]) {
      expect(ASSESSMENT_TEMPLATES.some((t) => t.industry === ind), ind).toBe(true);
    }
    expect(ASSESSMENT_TEMPLATES.some((t) => t.industry === "all")).toBe(true);
  });

  it("templatesForIndustry returns the industry's own + universal, and just universal when unknown", () => {
    const auto = templatesForIndustry("auto-repair");
    expect(auto.some((t) => t.id === "vehicle-multipoint")).toBe(true);
    expect(auto.some((t) => t.industry === "all")).toBe(true);
    expect(auto.every((t) => t.industry === "auto-repair" || t.industry === "all")).toBe(true);
    const none = templatesForIndustry(null);
    expect(none.every((t) => t.industry === "all")).toBe(true);
  });

  it("every template has unique id and at least one scorable item", () => {
    const ids = ASSESSMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of ASSESSMENT_TEMPLATES) {
      expect(t.sections.flatMap((s) => s.items).some((i) => i.type === "pass-fail" || i.type === "rating"), t.id).toBe(true);
    }
    expect(assessmentById("vehicle-multipoint")?.name).toBe("Multi-point vehicle inspection");
  });
});
