import { workspaceDatabase } from "../workspace/database";
import { driverAccount, driverAvailable } from "../rideshare-driver/policy";
import { initDriver } from "../rideshare-driver/store";
import { driverRecord, type DriverRecord } from "../rideshare-driver/model";

export type DriverPortalOptions = { year?: number; page?: number };
const pageSize = 25;
const recordDate = (record: DriverRecord) => record.kind === "trip"
  ? record.body.localDate ?? record.body.startedAt.slice(0, 10) : record.body.date;
type PortalRow = { record: DriverRecord; updatedAt: string; sequence: number };

/** The portal reads the same account journal used by native synchronization.
 * Staff-client linking alone never grants access to another account's journal. */
export function clientDriverSummary(token: string, options: DriverPortalOptions = {}, taxYears: number[] = []) {
  return workspaceDatabase(db => {
    if (!driverAvailable(db)) return null;
    const account = driverAccount(db, token);
    initDriver(db);
    const stored = db.prepare("SELECT body,updatedAt,sequence FROM driver_records WHERE accountId=? AND clientId=? AND json_extract(body,'$.deleted')=0 ORDER BY sequence DESC")
      .all(account.id, account.clientId) as unknown as { body: string; updatedAt: string; sequence: number }[];
    const rows: PortalRow[] = stored.map(row => ({ record: driverRecord.parse(JSON.parse(row.body)), updatedAt: row.updatedAt, sequence: row.sequence }));
    const years = [...new Set([...rows.map(row => Number(recordDate(row.record).slice(0, 4))), ...taxYears])]
      .filter(year => Number.isInteger(year) && year >= 1900 && year <= 9999).sort((a, b) => b - a);
    const currentYear = new Date().getUTCFullYear();
    const year = Number.isInteger(options.year) && options.year! >= 1900 && options.year! <= 9999 ? options.year!
      : years.includes(currentYear) ? currentYear : years[0] ?? currentYear;
    if (!years.includes(year)) years.push(year);
    years.sort((a, b) => b - a);
    const selected = rows.filter(row => recordDate(row.record).startsWith(`${year}-`));
    const totals = { incomeCents: 0, tripEarningsCents: 0, tripFeesCents: 0, businessExpenseCents: 0, personalExpenseCents: 0, unclassifiedExpenseCents: 0, businessMeters: 0, trips: 0, incomeEntries: 0, expenses: 0, receiptAttachments: 0 };
    const review = { unclassified: 0, incompleteTrips: 0, tripsWithGaps: 0, expensesWithoutReceipt: 0, businessExpensesWithoutPurpose: 0 };
    for (const { record } of selected) {
      if (record.kind === "income") { totals.incomeEntries++; totals.incomeCents += record.body.amountCents; }
      if (record.kind === "trip") {
        totals.trips++;
        if (record.body.classification === "business") totals.businessMeters += record.body.distanceMeters;
        if (record.body.classification === "unclassified") review.unclassified++;
        if (!record.body.endedAt) review.incompleteTrips++;
        if (record.body.hasGaps) review.tripsWithGaps++;
        totals.tripEarningsCents += record.body.earningsCents ?? 0;
        totals.tripFeesCents += record.body.platformFeesCents ?? 0;
      }
      if (record.kind === "expense") {
        totals.expenses++;
        const key = record.body.classification === "business" ? "businessExpenseCents" : record.body.classification === "personal" ? "personalExpenseCents" : "unclassifiedExpenseCents";
        totals[key] += record.body.amountCents;
        if (record.body.classification === "unclassified") review.unclassified++;
        if (record.body.receiptId) totals.receiptAttachments++; else review.expensesWithoutReceipt++;
        if (record.body.classification === "business" && !record.body.businessPurpose?.trim()) review.businessExpensesWithoutPurpose++;
      }
    }
    const pages = Math.max(1, Math.ceil(selected.length / pageSize));
    const page = Math.min(pages, Number.isSafeInteger(options.page) && options.page! > 0 ? options.page! : 1);
    return { year, years, page, pages, pageSize, count: selected.length, totals, review,
      latestReceivedAt: rows[0]?.updatedAt ?? null,
      rows: selected.slice((page - 1) * pageSize, page * pageSize).map(row => ({ ...row, date: recordDate(row.record) })),
    };
  });
}
export type ClientDriverSummary = NonNullable<ReturnType<typeof clientDriverSummary>>;
