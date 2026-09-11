/**
 * Assessment template library. Keyed to the same industry ids as the industry
 * configurator, plus universal templates ("all") every business can run. This is
 * what makes "every industry can use our app for their assessments" concrete: pick
 * your trade, and the inspections you actually run are already here.
 */
import type { AssessmentTemplate, AssessmentItem, ItemType } from "./model";

const pf = (id: string, label: string, critical = false, hint?: string): AssessmentItem => ({ id, label, type: "pass-fail", critical, hint });
const rate = (id: string, label: string, max = 5): AssessmentItem => ({ id, label, type: "rating" as ItemType, max });
const measure = (id: string, label: string, unit: string): AssessmentItem => ({ id, label, type: "measure" as ItemType, unit });

export const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  // ---- Universal (every industry) ----
  {
    id: "workplace-safety", name: "Workplace safety check", industry: "all", subjectLabel: "Location", passThreshold: 0.9,
    description: "A general safety walk-through any business can run to stay compliant and protect staff.",
    sections: [
      { id: "hazards", title: "Hazards", items: [pf("exits", "Exits clear and unlocked", true), pf("extinguisher", "Fire extinguisher present & charged", true), pf("spills", "No slip/trip hazards"), pf("wiring", "No exposed/ damaged wiring", true)] },
      { id: "ppe", title: "PPE & signage", items: [pf("ppe", "Required PPE available"), pf("signage", "Safety signage posted"), pf("firstaid", "First-aid kit stocked")] },
    ],
  },
  {
    id: "quality-audit", name: "Quality audit", industry: "all", subjectLabel: "Job / order", passThreshold: 0.8,
    description: "Score the quality of a completed job or order before it goes to the customer.",
    sections: [
      { id: "delivery", title: "Delivery", items: [rate("completeness", "Completeness vs. order"), rate("accuracy", "Accuracy"), rate("timeliness", "On time"), rate("presentation", "Presentation")] },
      { id: "docs", title: "Records", items: [pf("documented", "Work documented on the record"), pf("photos", "Photos / evidence attached")] },
    ],
  },

  // ---- Auto repair ----
  {
    id: "vehicle-multipoint", name: "Multi-point vehicle inspection", industry: "auto-repair", subjectLabel: "Vehicle", passThreshold: 0.8,
    description: "The standard multi-point inspection a shop runs on every vehicle.",
    sections: [
      { id: "safety", title: "Safety systems", items: [pf("brakes", "Brakes within spec", true), pf("tires", "Tire tread & pressure ok"), pf("lights", "All lights working", true), pf("steering", "Steering & suspension ok", true), measure("brake-mm", "Front brake pad", "mm")] },
      { id: "fluids", title: "Fluids & filters", items: [pf("oil", "Engine oil level/condition"), pf("coolant", "Coolant level"), pf("brakefluid", "Brake fluid"), pf("airfilter", "Air filter")] },
      { id: "electrical", title: "Electrical", items: [measure("battery-v", "Battery voltage", "V"), pf("charging", "Charging system ok"), pf("wipers", "Wipers & washers")] },
    ],
  },

  // ---- Restaurant ----
  {
    id: "line-check", name: "Kitchen line check & food safety", industry: "restaurant", subjectLabel: "Kitchen line", passThreshold: 0.9,
    description: "Pre-service line check plus the food-safety temperatures a health inspector looks for.",
    sections: [
      { id: "food-safety", title: "Food safety", items: [measure("walkin", "Walk-in cooler temp", "°F"), pf("cold-hold", "Cold holding ≤ 41°F", true), pf("hot-hold", "Hot holding ≥ 135°F", true), pf("handwash", "Handwash station stocked", true), pf("sanitizer", "Sanitizer buckets at strength")] },
      { id: "prep", title: "Prep & stock", items: [pf("mise", "Mise en place stocked"), pf("labels", "Items dated & labeled"), pf("fifo", "FIFO rotation followed")] },
      { id: "clean", title: "Cleanliness", items: [rate("stations", "Station cleanliness"), pf("floors", "Floors clean & dry")] },
    ],
  },

  // ---- HVAC ----
  {
    id: "hvac-maintenance", name: "HVAC system maintenance check", industry: "hvac", subjectLabel: "System", passThreshold: 0.8,
    description: "A maintenance inspection of a heating/cooling system.",
    sections: [
      { id: "operation", title: "Operation", items: [measure("supply-temp", "Supply air temp", "°F"), measure("static", "Static pressure", "in wc"), pf("thermostat", "Thermostat calibrated"), pf("safeties", "Safety switches functional", true)] },
      { id: "condition", title: "Condition", items: [pf("filter", "Filter clean/replaced"), pf("coils", "Coils clean"), pf("refrigerant", "Refrigerant charge ok"), pf("electrical", "Electrical connections tight", true)] },
    ],
  },

  // ---- Construction ----
  {
    id: "site-safety", name: "Job-site safety assessment", industry: "construction", subjectLabel: "Job site", passThreshold: 0.9,
    description: "A daily site-safety assessment to keep crews safe and the project compliant.",
    sections: [
      { id: "site", title: "Site conditions", items: [pf("fall", "Fall protection in use", true), pf("scaffolding", "Scaffolding inspected & tagged", true), pf("housekeeping", "Housekeeping / debris cleared"), pf("egress", "Clear egress paths", true)] },
      { id: "crew", title: "Crew & equipment", items: [pf("ppe", "Crew wearing required PPE", true), pf("training", "Operators trained/ certified"), pf("equipment", "Equipment inspected"), rate("toolbox", "Toolbox talk quality")] },
    ],
  },

  // ---- Gym ----
  {
    id: "fitness-assessment", name: "Member fitness assessment", industry: "gym", subjectLabel: "Member", passThreshold: 0.6,
    description: "An intake fitness assessment to build a member's plan (scored as readiness, not pass/fail).",
    sections: [
      { id: "vitals", title: "Baseline", items: [measure("resting-hr", "Resting heart rate", "bpm"), measure("weight", "Weight", "lb"), measure("bodyfat", "Body fat", "%")] },
      { id: "capacity", title: "Capacity", items: [rate("mobility", "Mobility"), rate("strength", "Strength"), rate("cardio", "Cardio endurance"), pf("parq", "PAR-Q cleared / no red flags", true)] },
    ],
  },

  // ---- Salon ----
  {
    id: "salon-consultation", name: "Client consultation", industry: "salon", subjectLabel: "Client", passThreshold: 0.7,
    description: "A consultation record captured before service.",
    sections: [
      { id: "assess", title: "Assessment", items: [pf("patch-test", "Patch/allergy test done where needed", true), rate("hair-condition", "Hair/skin condition"), pf("history", "Service history reviewed")] },
      { id: "plan", title: "Plan", items: [pf("goal-agreed", "Goal agreed with client"), pf("price-quoted", "Price & time quoted")] },
    ],
  },

  // ---- Landscaping ----
  {
    id: "property-assessment", name: "Property / job assessment", industry: "landscaping", subjectLabel: "Property", passThreshold: 0.75,
    description: "Assess a property before quoting or starting recurring service.",
    sections: [
      { id: "site", title: "Site", items: [pf("access", "Access & gates confirmed"), pf("hazards", "Hazards noted (slopes, wires)", true), rate("condition", "Current condition")] },
      { id: "scope", title: "Scope", items: [pf("measured", "Areas measured"), pf("photos", "Before photos taken"), pf("scope-agreed", "Scope agreed")] },
    ],
  },

  // ---- Wholesale / warehouse ----
  {
    id: "order-qc", name: "Order QC & pack check", industry: "wholesale", subjectLabel: "Order", passThreshold: 0.85,
    description: "Quality-control an outbound order before it ships.",
    sections: [
      { id: "pick", title: "Pick accuracy", items: [pf("items-match", "Items match the order", true), pf("counts", "Quantities correct", true), pf("lot", "Lot/expiry recorded")] },
      { id: "pack", title: "Pack & ship", items: [pf("condition", "Product condition good"), pf("labeling", "Labeling & docs correct"), rate("pack-quality", "Pack quality")] },
    ],
  },

  // ---- Agency ----
  {
    id: "deliverable-review", name: "Deliverable / campaign review", industry: "agency", subjectLabel: "Deliverable", passThreshold: 0.8,
    description: "Review a client deliverable or campaign before it goes out.",
    sections: [
      { id: "quality", title: "Quality", items: [rate("brief-match", "Matches the brief"), rate("quality", "Craft/quality"), pf("proofed", "Proofed / QA'd", true), pf("brand", "On brand & compliant")] },
      { id: "results", title: "Results readiness", items: [pf("tracking", "Tracking in place"), pf("approval", "Client approval recorded")] },
    ],
  },

  // ---- Childcare / daycare ----
  {
    id: "daycare-daily", name: "Daily childcare check", industry: "childcare", subjectLabel: "Room", passThreshold: 0.9,
    description: "Opening/closing safety and readiness check for a childcare room.",
    sections: [
      { id: "safety", title: "Room safety", items: [pf("ratio", "Staff-to-child ratio met", true), pf("exits", "Exits clear", true), pf("outlets", "Outlets covered / hazards secured", true), pf("sanitized", "Surfaces & toys sanitized"), pf("firstaid", "First-aid kit stocked", true)] },
      { id: "care", title: "Care readiness", items: [pf("signin", "All children signed in with authorized guardian"), pf("allergies", "Allergy/medical notes reviewed", true), pf("supplies", "Diapers/wipes/snacks stocked"), rate("environment", "Learning environment")] },
    ],
  },
  {
    id: "child-development", name: "Child development check-in", industry: "childcare", subjectLabel: "Child", passThreshold: 0.5,
    description: "Milestone check-in shared with parents (developmental, not pass/fail).",
    sections: [
      { id: "domains", title: "Development", items: [rate("social", "Social-emotional"), rate("language", "Language & communication"), rate("motor", "Motor skills"), rate("cognitive", "Cognitive / problem-solving")] },
      { id: "notes", title: "Notes", items: [{ id: "strengths", label: "Strengths & next steps", type: "note" }, pf("parent-shared", "Shared with parent")] },
    ],
  },

  // ---- Education / classes / lessons ----
  {
    id: "swim-level", name: "Swim level assessment", industry: "education", subjectLabel: "Swimmer", passThreshold: 0.75,
    description: "Assess a swimmer's skills to advance them a level (art/swim/music lessons pattern).",
    sections: [
      { id: "water-safety", title: "Water safety", items: [pf("float-back", "Back float 10s", true), pf("submerge", "Comfortable submerging"), pf("wall", "Returns to wall", true)] },
      { id: "strokes", title: "Skills", items: [rate("freestyle", "Freestyle"), rate("kick", "Kick technique"), rate("breathing", "Breathing"), pf("distance", "Swims required distance")] },
    ],
  },
  {
    id: "student-progress", name: "Student progress report", industry: "education", subjectLabel: "Student", passThreshold: 0.6,
    description: "Term progress report for a class or lesson (art, tutoring, music).",
    sections: [
      { id: "learning", title: "Learning", items: [rate("participation", "Participation"), rate("skill-growth", "Skill growth"), rate("effort", "Effort & focus")] },
      { id: "conduct", title: "Conduct & attendance", items: [rate("behavior", "Behavior"), pf("attendance-ok", "Attendance satisfactory"), { id: "comments", label: "Teacher comments", type: "note" }] },
    ],
  },

  // ---- Nonprofit ----
  {
    id: "program-outcome", name: "Program outcome assessment", industry: "nonprofit", subjectLabel: "Participant / program", passThreshold: 0.6,
    description: "Assess participant outcomes and evidence for funder reporting.",
    sections: [
      { id: "outcomes", title: "Outcomes", items: [rate("goal-progress", "Progress toward goal"), rate("engagement", "Engagement"), pf("evidence", "Evidence documented", true)] },
      { id: "compliance", title: "Compliance", items: [pf("consent", "Consent on file", true), pf("eligibility", "Eligibility verified")] },
    ],
  },
];

const byId = new Map(ASSESSMENT_TEMPLATES.map((t) => [t.id, t]));
export function assessmentById(id: string): AssessmentTemplate | null { return byId.get(id) ?? null; }

// Education-family industry ids all share the childcare + education assessment set.
const EDUCATION_FAMILY = new Set(["home-daycare", "school", "classes", "childcare", "education"]);

/** Templates available to an industry: its own + the universal ones (+ the shared
 *  education set for any childcare/school/classes industry). */
export function templatesForIndustry(industryId: string | null): AssessmentTemplate[] {
  const educationFamily = !!industryId && EDUCATION_FAMILY.has(industryId);
  return ASSESSMENT_TEMPLATES.filter((t) =>
    t.industry === "all"
    || (industryId && t.industry === industryId)
    || (educationFamily && (t.industry === "childcare" || t.industry === "education")),
  );
}
