/**
 * Benchmark engine — deterministic, no LLM grading. Scores human vs AI on the
 * same locked rubric, classifies each task, and produces the role automation
 * case. Hard gates (compliance, critical-error) can veto automation no matter how
 * fast/cheap the AI is — a cheap AI that misses expensive edge cases must not win.
 */
import { DIMENSION_WEIGHTS, type BenchmarkTask, type RoleBenchmark, type SubClass, type TaskMetrics } from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** 0–100 composite for one side, normalizing throughput/cost/cycle against the pair. */
export function composite(m: TaskMetrics, other: TaskMetrics): number {
  const tpMax = Math.max(m.throughputPerHr, other.throughputPerHr, 1);
  const tp = (m.throughputPerHr / tpMax) * 100;
  const costMin = Math.min(m.costPerTaskCents, other.costPerTaskCents);
  const cost = m.costPerTaskCents > 0 ? (costMin / m.costPerTaskCents) * 100 : 100;
  const ctMin = Math.min(m.cycleTimeMin, other.cycleTimeMin);
  const cycle = m.cycleTimeMin > 0 ? (ctMin / m.cycleTimeMin) * 100 : 100;
  const rework = 100 - clamp(m.reworkPct);
  const gate = m.compliancePass && m.criticalErrorPass ? 100 : 0;
  const w = DIMENSION_WEIGHTS;
  return round(
    w.accuracy * clamp(m.accuracyPct) + w.exception * clamp(m.exceptionResolvedPct) + w.rework * rework +
    w.throughput * tp + w.cost * cost + w.cycleTime * cycle + w.gate * gate,
  );
}

/** Classify a single task by the locked rules. Gates come first. */
export function classifyTask(t: BenchmarkTask): SubClass {
  const gatePass = t.ai.compliancePass && t.ai.criticalErrorPass;
  if (!gatePass) return "human-judgment"; // AI can't clear the hard gate → humans own it

  const qualityOk = t.ai.accuracyPct >= t.human.accuracyPct - 0.5;
  const exceptionOk = t.ai.exceptionResolvedPct >= t.human.exceptionResolvedPct - 5;
  const cheaper = t.ai.costPerTaskCents < t.human.costPerTaskCents;
  const faster = t.ai.throughputPerHr > t.human.throughputPerHr;
  const lowSupervision = t.ai.humanSupervisionPct <= 10;

  if (qualityOk && exceptionOk && cheaper && faster && lowSupervision) return "ai-ready";
  // Human clearly better on quality or edge cases → keep human.
  if (t.human.accuracyPct > t.ai.accuracyPct + 1 || t.human.exceptionResolvedPct > t.ai.exceptionResolvedPct + 8) return "human-better";
  if (cheaper && faster && qualityOk) return "ai-assisted"; // AI does the bulk, human handles exceptions/supervision
  return "human-better";
}

export interface TaskAssessment {
  taskId: string;
  label: string;
  weight: number;
  subClass: SubClass;
  humanScore: number;
  aiScore: number;
  aiWins: boolean;
  gatePass: boolean;
  costSavingPct: number;
  throughputMultiple: number;
  accuracyDeltaPct: number;
}

export type Recommendation = "Automate" | "Augment" | "Keep Human" | "Redesign";

export interface RoleAutomationCase {
  role: string;
  provenance: "sample" | "measured";
  tasks: TaskAssessment[];
  humanBaseline: number;   // 0–100
  aiChallenger: number;    // 0–100
  substitution: Record<SubClass, number>; // % of workload
  replaceablePct: number;  // ai-ready + ai-assisted, workload-weighted
  viabilityScore: number;  // 0–100 automation viability
  economics: { costSavingPct: number; throughputMultiple: number; qualityDeltaPct: number };
  gatesPass: boolean;
  recommendation: Recommendation;
  finding: string;
  confidence: "High" | "Medium" | "Low";
}

export function assessRole(rb: RoleBenchmark): RoleAutomationCase {
  const totalWeight = rb.tasks.reduce((n, t) => n + t.weight, 0) || 1;

  const tasks: TaskAssessment[] = rb.tasks.map((t) => {
    const humanScore = composite(t.human, t.ai);
    const aiScore = composite(t.ai, t.human);
    const gatePass = t.ai.compliancePass && t.ai.criticalErrorPass;
    return {
      taskId: t.id, label: t.label, weight: t.weight, subClass: classifyTask(t),
      humanScore, aiScore, aiWins: aiScore > humanScore, gatePass,
      costSavingPct: t.human.costPerTaskCents > 0 ? round((1 - t.ai.costPerTaskCents / t.human.costPerTaskCents) * 100) : 0,
      throughputMultiple: t.human.throughputPerHr > 0 ? Math.round((t.ai.throughputPerHr / t.human.throughputPerHr) * 10) / 10 : 0,
      accuracyDeltaPct: Math.round((t.ai.accuracyPct - t.human.accuracyPct) * 10) / 10,
    };
  });

  const wpct = (predicate: (a: TaskAssessment) => boolean) =>
    round((rb.tasks.reduce((n, t, i) => n + (predicate(tasks[i]) ? t.weight : 0), 0) / totalWeight) * 100);

  const substitution: Record<SubClass, number> = {
    "ai-ready": wpct((a) => a.subClass === "ai-ready"),
    "ai-assisted": wpct((a) => a.subClass === "ai-assisted"),
    "human-better": wpct((a) => a.subClass === "human-better"),
    "human-judgment": wpct((a) => a.subClass === "human-judgment"),
  };
  const replaceablePct = substitution["ai-ready"] + substitution["ai-assisted"];

  // Workload-weighted baselines + economics.
  const wavg = (pick: (a: TaskAssessment, t: BenchmarkTask) => number) =>
    rb.tasks.reduce((n, t, i) => n + pick(tasks[i], t) * t.weight, 0) / totalWeight;
  const humanBaseline = round(wavg((a) => a.humanScore));
  const aiChallenger = round(wavg((a) => a.aiScore));
  const costSavingPct = round(wavg((a) => a.costSavingPct));
  const throughputMultiple = Math.round(wavg((a) => a.throughputMultiple) * 10) / 10;
  const qualityDeltaPct = Math.round(wavg((a) => a.accuracyDeltaPct) * 10) / 10;

  // Gates: automation is only viable if AI clears gates on the replaceable majority.
  const gatedWeight = rb.tasks.reduce((n, t, i) => n + (tasks[i].gatePass ? t.weight : 0), 0) / totalWeight;
  const gatesPass = gatedWeight >= 0.9;

  const advantage = clamp(50 + (aiChallenger - humanBaseline));
  let viabilityScore = round(0.55 * replaceablePct + 0.45 * advantage);
  if (!gatesPass) viabilityScore = Math.min(viabilityScore, 55); // gate failure caps viability

  const minTrials = Math.min(...rb.tasks.flatMap((t) => [t.human.trials, t.ai.trials]));
  const confidence = minTrials >= 200 ? "High" : minTrials >= 50 ? "Medium" : "Low";

  const recommendation: Recommendation =
    gatesPass && viabilityScore >= 80 && replaceablePct >= 80 ? "Automate" :
    viabilityScore >= 55 && replaceablePct >= 45 ? "Augment" :
    humanBaseline > aiChallenger ? "Keep Human" : "Redesign";

  const finding =
    viabilityScore >= 85 ? "HIGH AUTOMATION POTENTIAL" :
    viabilityScore >= 65 ? "MODERATE AUTOMATION POTENTIAL" :
    viabilityScore >= 45 ? "AUGMENTATION OPPORTUNITY" : "HUMAN-ADVANTAGED";

  return {
    role: rb.role, provenance: rb.provenance, tasks, humanBaseline, aiChallenger, substitution,
    replaceablePct, viabilityScore, economics: { costSavingPct, throughputMultiple, qualityDeltaPct },
    gatesPass, recommendation, finding, confidence,
  };
}
