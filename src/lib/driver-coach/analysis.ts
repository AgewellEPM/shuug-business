import type { ClientTaxSummary } from "../customer-access/tax";
import type { DriverRecord } from "../rideshare-driver/model";
import { evidenceIds, type CoachIntake, type CoachMilestone, type CoachPeriod, type CoachPreferences } from "./model";

export type CoachJob = { id: string; title: string; date: string; miles: number; minutes: number; platform: string; area: string;
  hour: string; role: string; grossCents?: number; feesCents?: number; vehicleCents?: number; netCents?: number;
  hourlyCents?: number; netCentsPerMile?: number; hasGaps: boolean; missing: string[] };
export type CoachGroup = { label: string; count: number; pricedCount: number; isComplete: boolean; netCents: number; minutes: number; miles: number;
  hourlyCents?: number; recordIds: string[] };
export type CoachAnalysis = { period: CoachPeriod; jobs: CoachJob[]; priced: CoachJob[]; losses: CoachJob[]; best: CoachJob[];
  platforms: CoachGroup[]; areas: CoachGroup[]; hours: CoachGroup[]; grossCents: number; feesCents: number; vehicleCents: number;
  netCents: number; incomeCents: number; businessExpenseCents: number; cashFlowCents: number; unpaidMiles: number;
  unpaidCostCents?: number; incompleteIds: string[]; unclassifiedIds: string[]; missingPurposeIds: string[];
  mileageReviewIds: string[]; businessExpenseIds: string[]; selectedIds: string[] };
export const recordDate = (record: DriverRecord) => record.kind === "trip"
  ? record.body.localDate ?? record.body.startedAt.slice(0, 10) : record.body.date;
function localHour(start: string, zone?: string) {
  try { return new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: zone ?? "UTC" }).format(new Date(start)) + ":00"; }
  catch { return "Unknown time zone"; }
}
function groups(jobs: CoachJob[], key: "platform" | "area" | "hour"): CoachGroup[] {
  const grouped = new Map<string, CoachJob[]>();
  for (const job of jobs) { const rows = grouped.get(job[key]) ?? []; rows.push(job); grouped.set(job[key], rows); }
  return [...grouped].map(([label, rows]) => {
    const priced = rows.filter(row => row.netCents !== undefined && !row.hasGaps), isComplete = priced.length === rows.length;
    const netCents = priced.reduce((sum, row) => sum + row.netCents!, 0), minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
    return { label, count: rows.length, pricedCount: priced.length, isComplete, netCents, minutes, miles: rows.reduce((sum, row) => sum + row.miles, 0),
      ...(isComplete && rows.every(row => row.minutes >= 1) ? { hourlyCents: netCents * 60 / minutes } : {}), recordIds: evidenceIds(rows.map(row => row.id)) };
  }).sort((a, b) => Number(b.isComplete) - Number(a.isComplete) || b.netCents - a.netCents || a.label.localeCompare(b.label));
}
/** Same arithmetic and missing-input policy as native DriverCore/RideProfit.
 * Recorded payouts/cash expenses remain separate from trip-level operating estimates. */
export function analyzeCoach(records: DriverRecord[], preferences: CoachPreferences, period: CoachPeriod): CoachAnalysis {
  const selected = records.filter(record => !record.deleted && recordDate(record) >= period.from && recordDate(record) <= period.through);
  const jobs: CoachJob[] = [], incompleteIds: string[] = [], unclassifiedIds: string[] = [], missingPurposeIds: string[] = [];
  const mileageReviewIds: string[] = [], businessExpenseIds: string[] = [];
  let incomeCents = 0, businessExpenseCents = 0;
  for (const record of selected) {
    if (record.kind === "income") { incomeCents += record.body.amountCents; continue; }
    const body = record.body;
    if (body.classification === "unclassified") unclassifiedIds.push(record.id);
    if (record.kind === "expense") {
      if (record.body.classification === "business") {
        businessExpenseIds.push(record.id);
        businessExpenseCents += Math.round(record.body.amountCents * (record.body.businessUsePercent ?? 100) / 100);
        if (!record.body.businessPurpose?.trim()) missingPurposeIds.push(record.id);
      }
      continue;
    }
    const trip = record.body;
    if (!trip.endedAt) { incompleteIds.push(record.id); continue; }
    if (trip.classification !== "business") continue;
    const reposition = trip.rideRole === "reposition", miles = Math.max(0, trip.distanceMeters / 1609.344);
    const minutes = Math.max(0, (Date.parse(trip.endedAt) - Date.parse(trip.startedAt)) / 60000);
    const grossCents = reposition ? 0 : trip.earningsCents;
    const feesCents = trip.platformFeesCents ?? (reposition ? 0 : undefined);
    const rate = preferences.vehicleCostCentsPerMile;
    const vehicleCents = trip.rideRole === "shopping" && trip.distanceMeters === 0 ? 0 : rate === undefined ? undefined : Math.round(miles * rate);
    const netCents = grossCents !== undefined && feesCents !== undefined && vehicleCents !== undefined ? grossCents - feesCents - vehicleCents : undefined;
    const missing = [grossCents === undefined ? "fare and tips" : "", feesCents === undefined ? "known platform fees (including a confirmed zero)" : "",
      vehicleCents === undefined ? "your operating cost per mile" : ""].filter(Boolean);
    if (trip.hasGaps) mileageReviewIds.push(record.id);
    jobs.push({ id: record.id, title: trip.purpose || "Recorded job", date: recordDate(record), miles, minutes,
      platform: trip.platform?.trim() || "Unspecified platform", area: trip.workArea?.trim() || "Unspecified area",
      hour: localHour(trip.startedAt, trip.timeZoneId), role: trip.rideRole ?? "other", grossCents, feesCents, vehicleCents, netCents,
      ...(netCents !== undefined && minutes >= 1 ? { hourlyCents: netCents * 60 / minutes } : {}),
      ...(netCents !== undefined && miles > 0 ? { netCentsPerMile: netCents / miles } : {}), hasGaps: trip.hasGaps, missing });
  }
  const priced = jobs.filter(job => job.netCents !== undefined && !job.hasGaps);
  const byNet = (a: CoachJob, b: CoachJob) => a.netCents! - b.netCents! || a.id.localeCompare(b.id);
  const unpaidMiles = jobs.filter(job => job.role === "reposition").reduce((sum, job) => sum + job.miles, 0);
  const sum = (key: "grossCents" | "feesCents" | "vehicleCents" | "netCents") => priced.reduce((total, job) => total + job[key]!, 0);
  return { period, jobs, priced, losses: priced.filter(job => job.netCents! < 0).sort(byNet), best: [...priced].sort((a, b) => byNet(b, a)),
    platforms: groups(jobs, "platform"), areas: groups(jobs, "area"), hours: groups(jobs, "hour"), grossCents: sum("grossCents"),
    feesCents: sum("feesCents"), vehicleCents: sum("vehicleCents"), netCents: sum("netCents"), incomeCents, businessExpenseCents,
    cashFlowCents: incomeCents - businessExpenseCents, unpaidMiles,
    ...(preferences.vehicleCostCentsPerMile !== undefined ? { unpaidCostCents: Math.round(unpaidMiles * preferences.vehicleCostCentsPerMile) } : {}),
    incompleteIds, unclassifiedIds, missingPurposeIds, mileageReviewIds, businessExpenseIds, selectedIds: evidenceIds(selected.map(row => row.id)) };
}
export function coachMilestones(analysis: CoachAnalysis, preferences: CoachPreferences, intake: CoachIntake, tax: ClientTaxSummary | null): CoachMilestone[] {
  const unpriced = analysis.jobs.filter(job => job.netCents === undefined || job.hasGaps);
  const item = (id: string, title: string, detail: string, done: boolean, ids: string[] = []): CoachMilestone => ({ id, title, detail, status: done ? "done" : "todo", recordIds: evidenceIds(ids) });
  const result = [
    item("tax-context", "Confirm your tax context", "Confirm tax year, state or country, and business structure with your preparer. Do not enter taxpayer IDs in chat.", Boolean(intake.taxYear && intake.jurisdiction && intake.businessType && intake.businessType !== "unsure")),
    item("operating-cost", "Set vehicle cost for jobs with driving", "Use your own vehicle-cost estimate for driving. Shopping jobs with exactly 0 recorded miles have 0 vehicle cost; other work expenses remain separate. This is not a tax mileage rate.", preferences.vehicleCostCentsPerMile !== undefined || (analysis.jobs.length > 0 && analysis.jobs.every(job => job.role === "shopping" && job.miles === 0))),
    item("goals", "Set a net earnings goal", "Choose a daily, weekly or hourly goal to compare with recorded job estimates.", [preferences.dailyNetCents, preferences.weeklyNetCents, preferences.targetHourlyCents].some(value => value !== undefined && value > 0)),
    item("classifications", "Review business and personal records", `${analysis.unclassifiedIds.length} records in this period still need classification.`, analysis.unclassifiedIds.length === 0, analysis.unclassifiedIds),
    item("trip-ends", "Finish incomplete job records", `${analysis.incompleteIds.length} jobs have no saved end time and cannot be ranked as completed jobs.`, analysis.incompleteIds.length === 0, analysis.incompleteIds),
    item("profit-details", "Complete each job's profit details", `${unpriced.length} of ${analysis.jobs.length} completed business jobs need earnings, known fees, any applicable vehicle-cost estimate or mileage-gap review. No missing amounts are assumed.`, analysis.jobs.length > 0 && unpriced.length === 0, unpriced.map(row => row.id)),
    item("mileage-review", "Review recorded mileage gaps", `${analysis.mileageReviewIds.length} completed business jobs have GPS gaps; profit per mile needs review.`, analysis.mileageReviewIds.length === 0, analysis.mileageReviewIds),
    item("expense-purpose", "Add business expense purposes", `${analysis.missingPurposeIds.length} business-classified expenses lack a recorded purpose. Classification alone does not establish a deduction.`, analysis.missingPurposeIds.length === 0, analysis.missingPurposeIds),
  ];
  const engagements = (tax?.engagements ?? []).filter(row => !intake.taxYear || !row.year || row.year === intake.taxYear);
  const requests = engagements.flatMap(row => row.documents);
  if (!requests.length) result.push(item("shared-tax-work", "Review your firm's shared tax work", "No document requests for this tax context have been shared. Ask your preparer which records are needed.", false));
  for (const document of requests.slice(0, 20)) {
    const received = ["Received externally", "Staff reviewed", "Not applicable"].includes(document.status) || document.submissions.some(row => row.status === "received" || row.status === "reviewed");
    const replacement = document.status === "Needs replacement" || document.submissions.some(row => row.status === "replacement_requested");
    result.push(item(`document-${document.id}`, document.name, replacement ? "A replacement was requested. Review this request in your private tax workspace."
      : received ? "Receipt or staff status is recorded. This does not establish a filed return." : "Your firm requested this record. Use this request's private upload in your tax workspace.", received && !replacement));
  }
  return result;
}
