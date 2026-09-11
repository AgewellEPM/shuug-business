/**
 * Benchmark suites per role — representative sample distributions (provenance:
 * "sample") until real task runs feed the lab. The engine treats these exactly
 * like measured data; swapping in real trials just changes the inputs.
 */
import type { RoleBenchmark, TaskMetrics } from "./model";

const h = (accuracyPct: number, throughputPerHr: number, exceptionResolvedPct: number, costPerTaskCents: number, cycleTimeMin: number, reworkPct: number, trials: number): TaskMetrics =>
  ({ accuracyPct, throughputPerHr, exceptionResolvedPct, costPerTaskCents, cycleTimeMin, reworkPct, humanSupervisionPct: 0, compliancePass: true, criticalErrorPass: true, trials });

const ai = (accuracyPct: number, throughputPerHr: number, exceptionResolvedPct: number, costPerTaskCents: number, cycleTimeMin: number, reworkPct: number, humanSupervisionPct: number, compliancePass: boolean, criticalErrorPass: boolean, trials: number): TaskMetrics =>
  ({ accuracyPct, throughputPerHr, exceptionResolvedPct, costPerTaskCents, cycleTimeMin, reworkPct, humanSupervisionPct, compliancePass, criticalErrorPass, trials });

export const BENCHMARKS: RoleBenchmark[] = [
  {
    role: "Fulfillment",
    provenance: "sample",
    tasks: [
      { id: "invoice", label: "Invoice processing", weight: 0.3, human: h(96.1, 21, 97, 384, 11, 6, 500), ai: ai(99.0, 143, 91, 31, 2, 2, 6, true, true, 500) },
      { id: "reconcile", label: "Reconciliation", weight: 0.25, human: h(95.0, 14, 96, 520, 16, 7, 400), ai: ai(98.2, 90, 88, 40, 3, 3, 9, true, true, 400) },
      { id: "data-entry", label: "Order data entry", weight: 0.2, human: h(94.0, 18, 90, 420, 12, 8, 500), ai: ai(98.5, 220, 85, 20, 1, 2, 4, true, true, 500) },
      { id: "disputes", label: "Customer disputes / exceptions", weight: 0.15, human: h(97.5, 9, 98, 700, 24, 4, 300), ai: ai(88.0, 40, 63, 55, 6, 9, 41, true, true, 300) },
      { id: "compliance", label: "Tax/compliance filing", weight: 0.1, human: h(98.8, 6, 99, 900, 30, 2, 200), ai: ai(95.0, 30, 80, 60, 5, 5, 22, false, true, 200) },
    ],
  },
  {
    role: "Sales",
    provenance: "sample",
    tasks: [
      { id: "order-entry", label: "Order entry", weight: 0.2, human: h(95, 16, 92, 410, 12, 6, 400), ai: ai(98.6, 180, 86, 22, 1, 2, 5, true, true, 400) },
      { id: "followup", label: "Customer follow-up", weight: 0.25, human: h(93, 12, 95, 480, 15, 5, 300), ai: ai(90, 120, 74, 30, 2, 6, 18, true, true, 300) },
      { id: "reporting", label: "Sales reporting", weight: 0.15, human: h(94, 8, 90, 560, 20, 7, 250), ai: ai(99, 200, 92, 18, 1, 1, 3, true, true, 250) },
      { id: "negotiation", label: "Deal negotiation", weight: 0.25, human: h(97, 5, 98, 1200, 40, 3, 150), ai: ai(78, 20, 55, 90, 8, 12, 62, true, true, 150) },
      { id: "prospecting", label: "Prospect research", weight: 0.15, human: h(90, 10, 88, 520, 18, 9, 200), ai: ai(93, 150, 80, 25, 2, 4, 12, true, true, 200) },
    ],
  },
  {
    role: "Production",
    provenance: "sample",
    tasks: [
      { id: "scheduling", label: "Production scheduling", weight: 0.25, human: h(93, 7, 92, 600, 22, 8, 180), ai: ai(97, 60, 84, 35, 3, 3, 10, true, true, 180) },
      { id: "qc-log", label: "QC logging", weight: 0.2, human: h(96, 20, 94, 300, 8, 5, 400), ai: ai(98.5, 160, 86, 18, 1, 2, 6, true, true, 400) },
      { id: "bom", label: "Recipe / BOM cost calc", weight: 0.2, human: h(94, 9, 90, 520, 16, 7, 200), ai: ai(99, 120, 88, 20, 1, 1, 4, true, true, 200) },
      { id: "safety", label: "Food-safety (HACCP) sign-off", weight: 0.2, human: h(99, 8, 99, 700, 20, 1, 150), ai: ai(96, 40, 78, 40, 4, 4, 30, false, false, 150) },
      { id: "reporting", label: "Ops reporting", weight: 0.15, human: h(93, 8, 90, 540, 18, 8, 200), ai: ai(98.5, 180, 90, 18, 1, 2, 3, true, true, 200) },
    ],
  },
];

export function getBenchmark(role: string): RoleBenchmark | null {
  return BENCHMARKS.find((b) => b.role.toLowerCase() === role.toLowerCase()) ?? null;
}
export function benchmarkRoles(): string[] {
  return BENCHMARKS.map((b) => b.role);
}
