import type { ClientTaxSummary } from "../customer-access/tax";
import type { CoachAnalysis, CoachGroup, CoachJob } from "./analysis";
import { coachSources, evidenceIds, type CoachIntake, type CoachMilestone, type CoachPreferences, type CoachSource } from "./model";

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const count = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
function jobLine(job: CoachJob) {
  return `${job.title} · ${job.platform} · ${job.date}: ${usd(job.netCents!)} estimated net = ${usd(job.grossCents!)} earnings/tips − ${usd(job.feesCents!)} fees − ${usd(job.vehicleCents!)} vehicle cost; ${count(job.miles)} mi, ${count(job.minutes)} min${job.hourlyCents !== undefined ? `, ${usd(job.hourlyCents)}/recorded hr` : ", hourly rate unavailable (under one recorded minute)"}${job.hasGaps ? ". Mileage has gaps; review this estimate" : ""}.`;
}
function groupLines(title: string, groups: CoachGroup[]) {
  const complete = groups.filter(row => row.isComplete);
  const top = groups.slice(0, 3), worst = [...(complete.length ? complete : groups)].sort((a, b) => a.netCents - b.netCents)[0];
  const rows = worst && !top.includes(worst) ? [...top, worst] : top;
  return `${title} — complete groups first; incomplete groups show only their known portion:\n${rows.map(row => row.isComplete
    ? `${row.label}: ${usd(row.netCents)} estimated net across ${row.count} priced jobs${row.hourlyCents !== undefined ? ` · ${usd(row.hourlyCents)}/recorded hr` : " · hourly rate unavailable because a job has under one recorded minute"}.`
    : `${row.label}: ${usd(row.netCents)} known portion across ${row.pricedCount} of ${row.count} jobs; full-group profit and hourly rate unavailable.`).join("\n")}`;
}
function goalLines(analysis: CoachAnalysis, preferences: CoachPreferences) {
  const goals: string[] = [];
  if (preferences.targetHourlyCents) {
    const minutes = analysis.priced.reduce((sum, row) => sum + row.minutes, 0);
    goals.push(analysis.priced.length > 0 && analysis.priced.every(row => row.minutes >= 1)
      ? `This period's priced jobs average ${usd(analysis.netCents * 60 / minutes)}/recorded hr against your ${usd(preferences.targetHourlyCents)}/hr goal.`
      : "Hourly goal progress is unavailable until every contributing priced job has at least one recorded minute.");
  }
  const mostRecentDay = analysis.jobs.map(row => row.date).sort().at(-1);
  if (preferences.dailyNetCents && mostRecentDay) {
    const daily = analysis.priced.filter(row => row.date === mostRecentDay), allDaily = analysis.jobs.filter(row => row.date === mostRecentDay);
    const net = daily.reduce((sum, row) => sum + row.netCents!, 0);
    goals.push(daily.length === 0 ? `Daily goal progress for ${mostRecentDay} is unavailable: no completed business jobs have complete profit inputs and reviewed mileage.`
      : daily.length < allDaily.length ? `Latest recorded work day, ${mostRecentDay}: ${usd(net)} known estimated net from ${daily.length} of ${allDaily.length} jobs. Full daily goal progress is unavailable until the other jobs are reviewed.`
      : `Latest recorded work day, ${mostRecentDay}: ${usd(net)} estimated net of ${usd(preferences.dailyNetCents)} daily goal (${usd(Math.max(0, preferences.dailyNetCents - net))} remaining).`);
  }
  if (preferences.dailyNetCents && !mostRecentDay) goals.push("Daily goal progress is unavailable: no completed business jobs are recorded in this period.");
  if (preferences.weeklyNetCents) goals.push(`Your saved weekly net goal is ${usd(preferences.weeklyNetCents)}. The selected period is ${analysis.period.from} through ${analysis.period.through}; it is not assumed to be a calendar week.`);
  return goals.length ? goals.join("\n") : "Set a daily, weekly or hourly net goal and any applicable vehicle cost to track progress from completed business jobs.";
}
export type CoachAnswer = { text: string; sources: CoachSource[]; recordIds: string[] };
/** Deterministic supported questions; an unsupported question never becomes invented advice. */
export function answerCoach(question: string, analysis: CoachAnalysis, preferences: CoachPreferences, intake: CoachIntake,
  milestones: CoachMilestone[], tax: ClientTaxSummary | null): CoachAnswer {
  const q = question.toLowerCase();
  const period = `Records received for ${analysis.period.from} through ${analysis.period.through}.`;
  const coverage = `${analysis.priced.length} of ${analysis.jobs.length} completed business jobs have all profit inputs and no flagged mileage gaps. ${analysis.incompleteIds.length} incomplete jobs and ${analysis.unclassifiedIds.length} unclassified job/expense records need review.`;
  const assumption = preferences.vehicleCostCentsPerMile === undefined
    ? analysis.jobs.some(job => job.vehicleCents === undefined) ? "Vehicle cost is missing for driving jobs; I cannot rank net profit for those jobs until you supply your cost per mile. Exactly zero-mile shopping jobs use 0 vehicle cost; other work expenses remain separate."
      : "No driving cost estimate is saved. Shopping jobs recorded with exactly 0 miles use 0 vehicle cost; other work expenses are not assumed to be zero."
    : `Vehicle cost assumption: ${usd(preferences.vehicleCostCentsPerMile)} per mile, supplied by you. This is an operating estimate, not a tax mileage rate.`;
  const limits = "Recorded trip duration may omit pickup waits and idle time. Unrecorded miles, incomplete inputs and GPS gaps can change the result. These are estimates of your recorded work, not predictions or tax deductions.";
  if (/losing|loss|worst|least|best|most|profit|which.*(job|ride)|\bjobs?\b|platform|area|\bhour/.test(q)) {
    const lines = [period, coverage, assumption];
    if (analysis.priced.length) {
      lines.push(`Priced jobs: ${usd(analysis.netCents)} estimated net = ${usd(analysis.grossCents)} earnings/tips − ${usd(analysis.feesCents)} platform fees − ${usd(analysis.vehicleCents)} vehicle cost.`);
      lines.push(analysis.losses.length ? `Where recorded jobs lose money:\n${analysis.losses.slice(0, 4).map(jobLine).join("\n")}` : "No negative estimated-net jobs were found among the priced jobs. Missing-input jobs cannot be cleared as profitable.");
      lines.push(`Jobs with the highest estimated net:\n${analysis.best.slice(0, 4).map(jobLine).join("\n")}`);
      lines.push(groupLines("Platforms", analysis.platforms), groupLines("Areas", analysis.areas), groupLines("Local start hour", analysis.hours));
    } else lines.push("No completed business jobs can be ranked yet. Record earnings/tips, known fees and any applicable vehicle cost; a missing fee is not assumed to be zero.");
    if (analysis.unpaidMiles > 0) lines.push(`Explicitly marked unpaid driving: ${count(analysis.unpaidMiles)} miles${analysis.unpaidCostCents !== undefined ? `, ${usd(analysis.unpaidCostCents)} estimated operating cost` : ""}. Eligible unpaid-drive costs are included in the priced totals; gap-flagged drives need review.`);
    const missing = analysis.jobs.filter(row => row.missing.length);
    if (missing.length) lines.push(`Inputs to complete:\n${missing.slice(0, 3).map(row => `${row.title}: ${row.missing.join(", ")}.`).join("\n")}`);
    lines.push("Income entries and recorded cash expenses are reported separately; payouts are not added to trip fares and vehicle expenses are not subtracted again from this net.", limits);
    return { text: lines.join("\n\n"), sources: [coachSources.records], recordIds: evidenceIds([...analysis.losses.slice(0, 4), ...analysis.best.slice(0, 4), ...missing.slice(0, 3)].map(row => row.id)) };
  }
  if (/tax|deduct|1099|quarter|filing|\bfile\b|irs|document|receipt|business type/.test(q)) {
    const needs = [!intake.taxYear ? "Which tax year are we preparing?" : "", !intake.jurisdiction ? "Which state or country applies?" : "",
      !intake.businessType || intake.businessType === "unsure" ? "What business structure should your preparer confirm?" : ""].filter(Boolean);
    const shared = (tax?.engagements ?? []).filter(row => !intake.taxYear || !row.year || row.year === intake.taxYear);
    const status = shared.map(row => `${row.name}${row.year ? ` (${row.year})` : ""}: ${row.stage}. ${row.documents.length} shared document request(s).`).join("\n");
    const car = /mile|car|vehicle|deduct|expense/.test(q), estimated = /quarter|estimated|payment|owe/.test(q);
    return { text: [period, needs.length ? `Let's fill in the confirmed tax context first:\n${needs.join("\n")}\nUse the tax-context form to confirm those answers; chat alone does not change saved facts.`
      : `Confirmed context: tax year ${intake.taxYear}, ${intake.jurisdiction}, ${intake.businessType}. Your preparer still needs to review your situation.`,
      "Keep income statements, receipts, business purpose and mileage records. Use the private upload on each shared document request for forms; leave taxpayer and bank account numbers out of chat.",
      status || "Your firm has not shared an engagement for this tax context yet. Contact the preparer about the needed records.",
      car ? "A recorded vehicle cost is a profit assumption. Your preparer must review the applicable tax-year vehicle method, business use and supporting evidence; no deduction or mileage rate is inferred here." : "",
      estimated ? "Estimated-tax needs depend on your complete tax situation. Review the IRS guidance and your preparer's advice; this chat does not calculate a liability, schedule a statutory deadline or make a payment." : "",
      "The shared status tracks work and document receipt; it does not establish a submitted or accepted tax return."].filter(Boolean).join("\n\n"),
      sources: [coachSources.gig, coachSources.records, ...(car ? [coachSources.car, coachSources.expenses] : []), ...(estimated ? [coachSources.estimated] : [])], recordIds: [] };
  }
  if (/goal|target|milestone|next|progress/.test(q)) {
    const next = milestones.filter(row => row.status === "todo").slice(0, 4);
    return { text: [period, goalLines(analysis, preferences), coverage,
      next.length ? `Next steps:\n${next.map(row => `${row.title}: ${row.detail}`).join("\n")}` : "The current record-detail checklist is complete. Continue recording and review your firm's shared updates.",
      "Goal progress is based on recorded operating estimates, before tax. It does not confirm document approval or filing."].join("\n\n"),
      sources: [coachSources.records], recordIds: evidenceIds(next.flatMap(row => row.recordIds)) };
  }
  if (/spent|spend|cost|expense|fuel|cash.?flow|revenue|income|earn|money/.test(q)) {
    return { text: [period, `Recorded income entries: ${usd(analysis.incomeCents)}. Business-classified spending using the recorded business-use share (100% when blank): ${usd(analysis.businessExpenseCents)}. Recorded cash flow: ${usd(analysis.cashFlowCents)}. Personal and unclassified expenses are excluded.`,
      analysis.priced.length ? `Separately, ${analysis.priced.length} priced jobs have ${usd(analysis.netCents)} estimated net from ${usd(analysis.grossCents)} earnings/tips, ${usd(analysis.feesCents)} fees and ${usd(analysis.vehicleCents)} vehicle cost.`
        : "Job-level estimated net is unavailable: no completed business jobs have complete profit inputs and reviewed mileage.",
      "These are separate views of your records. Income payouts may cover the same fares; I do not add them together. Cash expenses are not subtracted again from the per-mile operating estimate.",
      coverage, assumption, "Ask 'Which jobs lose money and which make the most?' for individual jobs and platform, area and local-hour comparisons."].join("\n\n"), sources: [coachSources.records], recordIds: analysis.selectedIds };
  }
  return { text: `${period}\n\nI can compare your received job earnings and costs, find recorded losses and best jobs, rank platforms/areas/start hours, track goals, and guide the tax-record checklist. Try “Where am I losing money, on which jobs, and which jobs make the most?” or “What information is missing for my tax preparation?”\n\nOnly confirmed forms change tax context or goals. I do not calculate deductions, file returns or make payments.`, sources: [coachSources.gig], recordIds: [] };
}
