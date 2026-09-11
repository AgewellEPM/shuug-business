/**
 * Sales pipeline / CRM (#4) — inquiry → qualified → proposal → won/lost, with an
 * assigned rep, expected value, probability, next action, and a lost reason. This
 * is the monday-CRM-style board for sales. Pure model + a weighted-forecast
 * summary (value × probability) so the owner sees real expected revenue, not a
 * hopeful total. Cents-only, deterministic.
 */
export type Stage = "new" | "qualified" | "proposal" | "won" | "lost";

export const STAGES: { key: Stage; label: string; defaultProbability: number }[] = [
  { key: "new", label: "New inquiry", defaultProbability: 10 },
  { key: "qualified", label: "Qualified", defaultProbability: 30 },
  { key: "proposal", label: "Proposal / quote", defaultProbability: 60 },
  { key: "won", label: "Won", defaultProbability: 100 },
  { key: "lost", label: "Lost", defaultProbability: 0 },
];
export const OPEN_STAGES: Stage[] = ["new", "qualified", "proposal"];
export const defaultProbability = (s: Stage) => STAGES.find((x) => x.key === s)?.defaultProbability ?? 0;

export interface Deal {
  id: string;
  title: string;
  company: string;
  contact: string;
  customerId: string | null;
  stage: Stage;
  assignedTo: string | null;
  expectedValueCents: number;
  probability: number; // 0–100
  source: string;
  nextAction: string;
  nextActionDate: string | null;
  lostReason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stageEnteredAt: string;
}

export interface StageRollup { stage: Stage; label: string; count: number; valueCents: number }
export interface PipelineSummary {
  byStage: StageRollup[];
  openCount: number;
  openValueCents: number;
  /** value × probability across open deals — the honest forecast. */
  weightedForecastCents: number;
  wonCount: number;
  lostCount: number;
  winRatePct: number | null;
  wonValueCents: number;
  /** open deals sitting in a stage too long. */
  stalled: { id: string; title: string; daysInStage: number; stage: Stage }[];
}

const DAY = 86_400_000;
const daysSince = (iso: string, nowMs: number) => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY));

export function pipelineSummary(deals: Deal[], nowMs = Date.now(), stalledDays = 14): PipelineSummary {
  const byStage: StageRollup[] = STAGES.map((s) => {
    const inStage = deals.filter((d) => d.stage === s.key);
    return { stage: s.key, label: s.label, count: inStage.length, valueCents: inStage.reduce((n, d) => n + d.expectedValueCents, 0) };
  });
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const won = deals.filter((d) => d.stage === "won");
  const lost = deals.filter((d) => d.stage === "lost");
  const closed = won.length + lost.length;

  return {
    byStage,
    openCount: open.length,
    openValueCents: open.reduce((n, d) => n + d.expectedValueCents, 0),
    weightedForecastCents: Math.round(open.reduce((n, d) => n + (d.expectedValueCents * d.probability) / 100, 0)),
    wonCount: won.length,
    lostCount: lost.length,
    winRatePct: closed > 0 ? Math.round((won.length / closed) * 100) : null,
    wonValueCents: won.reduce((n, d) => n + d.expectedValueCents, 0),
    stalled: open
      .map((d) => ({ id: d.id, title: d.title, daysInStage: daysSince(d.stageEnteredAt, nowMs), stage: d.stage }))
      .filter((d) => d.daysInStage >= stalledDays)
      .sort((a, b) => b.daysInStage - a.daysInStage),
  };
}
