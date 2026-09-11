/**
 * Work-benchmark model — an automation-audit lab. For each role we benchmark the
 * SAME job tasks two ways: a human baseline and an AI-workflow challenger, on one
 * locked rubric with hard gates (compliance, critical-error). The engine then
 * produces a task-substitution map + an evidence-based automation case.
 *
 * Design rules (so it's defensible, not a demo): task-for-task on the same input
 * set, deterministic scoring (no LLM grading itself), trial counts drive
 * confidence, hard gates can veto automation regardless of speed/cost.
 */

export interface TaskMetrics {
  /** correct outputs, 0–100. */
  accuracyPct: number;
  /** completed units per hour. */
  throughputPerHr: number;
  /** share of weird/nonstandard cases resolved, 0–100 (higher better). */
  exceptionResolvedPct: number;
  /** fully-loaded cost per task, cents. */
  costPerTaskCents: number;
  /** start→completion, minutes. */
  cycleTimeMin: number;
  /** corrections required, 0–100 (lower better). */
  reworkPct: number;
  /** AI only: share of tasks it can't finish alone, 0–100. Human = 0. */
  humanSupervisionPct: number;
  /** hard gate — did it clear compliance/risk. */
  compliancePass: boolean;
  /** hard gate — did it clear the critical-error test. */
  criticalErrorPass: boolean;
  /** how many trials this distribution is built from. */
  trials: number;
}

export interface BenchmarkTask {
  id: string;
  label: string;
  /** share of the role's total workload, 0–1 (weights across a role sum to ~1). */
  weight: number;
  human: TaskMetrics;
  ai: TaskMetrics;
}

export interface RoleBenchmark {
  role: string;
  /** how this benchmark data was produced — honesty about the evidence. */
  provenance: "sample" | "measured";
  tasks: BenchmarkTask[];
}

export type SubClass = "ai-ready" | "ai-assisted" | "human-better" | "human-judgment";

export const SUBCLASS_LABEL: Record<SubClass, string> = {
  "ai-ready": "AI-ready now",
  "ai-assisted": "AI-assisted",
  "human-better": "Better by human",
  "human-judgment": "Needs human judgment",
};

/** Scored dimensions and how they roll into a composite (weights sum to 1). */
export const DIMENSION_WEIGHTS = {
  accuracy: 0.28,
  exception: 0.14,
  rework: 0.12,
  throughput: 0.16,
  cost: 0.16,
  cycleTime: 0.06,
  gate: 0.08,
} as const;
