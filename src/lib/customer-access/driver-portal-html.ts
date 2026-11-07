import { escapeHtml } from "../auth/forms";
import { appBaseUrl } from "../connections/vault";
import { expenseCategoryLabels, type DriverRecord } from "../rideshare-driver/model";
import { CUSTOMER_PATH } from "./accounts";
import type { ClientDriverSummary } from "./driver-portal";

const e = (value: unknown) => escapeHtml(String(value ?? ""));
const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const miles = (meters: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(meters / 1609.344);
const stamp = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" });
const classification = (record: DriverRecord) => record.kind === "income" ? "Income entry" : record.body.classification === "unclassified" ? "Classification needed" : `${record.body.classification} record`;
function recordLabel(record: DriverRecord) {
  if (record.kind === "trip") return record.body.purpose || "Recorded drive";
  if (record.kind === "expense") return record.body.merchant;
  return record.body.description;
}
function detail(record: DriverRecord) {
  if (record.kind === "income") return `${record.body.platform} · ${usd(record.body.amountCents)}`;
  if (record.kind === "expense") return `${expenseCategoryLabels[record.body.category]} · ${usd(record.body.amountCents)}`;
  return `${miles(record.body.distanceMeters)} mi${!record.body.endedAt ? " · End time needed" : ""}${record.body.hasGaps ? " · GPS gaps recorded" : ""}${record.body.earningsCents != null ? ` · Fare and tips ${usd(record.body.earningsCents)}` : ""}`;
}
export function driverPortalHtml(data: ClientDriverSummary | null) {
  if (!data) return "";
  const { review, totals } = data;
  const prompts = [
    [review.unclassified, "trip or expense records need business/personal classification"],
    [review.incompleteTrips, "trips have no saved end time"],
    [review.tripsWithGaps, "trips have recorded GPS gaps"],
    [review.expensesWithoutReceipt, "expenses have no receipt attachment"],
    [review.businessExpensesWithoutPurpose, "business-classified expenses have no business purpose entered"],
  ].filter(([count]) => Number(count) > 0);
  const href = (page: number) => `${CUSTOMER_PATH}?year=${data.year}&page=${page}#driver-records`;
  return `<section id="your-records" aria-labelledby="your-records-title"><p class="eyebrow">YOUR APP AND CLIENT ACCOUNT</p><h2 id="your-records-title">Your records, together.</h2>
    <ol class="portal-steps"><li><strong>One client account.</strong><span>Your email and password work in this portal and the Gig Tax Pros app.</span></li><li><strong>Record and sync.</strong><span>Sign in to the app with the same account. Received records appear here and in your firm's review workspace.</span></li><li><strong>Follow your tax work.</strong><span>Review your records here and your firm's shared updates below.</span></li></ol>
    <details class="connection-details"><summary>Connect your app</summary><p>In the app, open Account and find your firm's workspace. Use the same email you used here.</p><p>Workspace address: <strong>${e(new URL(appBaseUrl()).origin)}</strong></p><p>Records saved only on your phone will appear here after you connect and sync. Review any choice to copy your existing phone records into this account.</p></details>
    <form class="year-filter" method="get" action="${CUSTOMER_PATH}"><label for="driver-year">Record and tax year<select id="driver-year" name="year">${data.years.map(year => `<option value="${year}"${year === data.year ? " selected" : ""}>${year}</option>`).join("")}</select></label><button>View year</button></form>
    <dl class="portal-totals"><div><dt>Recorded income entries</dt><dd>${e(usd(totals.incomeCents))}</dd><small>${totals.incomeEntries} entries</small></div><div><dt>Business-classified expenses</dt><dd>${e(usd(totals.businessExpenseCents))}</dd><small>Full recorded amounts before any tax treatment</small></div><div><dt>Recorded business miles</dt><dd>${e(miles(totals.businessMeters))} mi</dd><small>${totals.trips} total trips</small></div><div><dt>Receipt attachments</dt><dd>${totals.receiptAttachments}</dd><small>${totals.expenses} expense records</small></div></dl>
    ${totals.tripEarningsCents || totals.tripFeesCents ? `<p>Trip-level fare and tips: <strong>${e(usd(totals.tripEarningsCents))}</strong> · Trip-level platform fees: <strong>${e(usd(totals.tripFeesCents))}</strong>. These are shown separately from income entries because they may describe the same earnings.</p>` : ""}
    ${totals.personalExpenseCents || totals.unclassifiedExpenseCents ? `<p>Other recorded spending: ${e(usd(totals.personalExpenseCents))} personal · ${e(usd(totals.unclassifiedExpenseCents))} awaiting classification.</p>` : ""}
    <p class="sync-receipt">${data.latestReceivedAt ? `Most recent record received: <time datetime="${e(data.latestReceivedAt)}">${e(stamp(data.latestReceivedAt))}</time>. Refresh this page after syncing to see new records.` : "No app records have been received yet. Your phone keeps its local records until you connect and sync."}</p>
    <div class="records-review"><h3>Record details to check</h3>${prompts.length ? `<ul>${prompts.map(([count, label]) => `<li><strong>${count}</strong> ${e(label)}.</li>`).join("")}</ul><p>Review these details in the app. An attachment or missing field alone does not determine whether an expense is deductible.</p>` : `<p>${data.count ? "No classification, trip-gap, or attachment prompts were found in this year's received records." : "Your review prompts will appear when records are received."}</p>`}</div>
    <h3 id="driver-records">Received records · ${data.year}</h3>${data.rows.length ? `<div class="scroll"><table><caption>${data.count} records · Page ${data.page} of ${data.pages}. Ordered by the latest received change.</caption><thead><tr><th scope="col">Date</th><th scope="col">Record</th><th scope="col">Details</th><th scope="col">Receipt</th></tr></thead><tbody>${data.rows.map(({ record, date }) => `<tr><td><time datetime="${e(date)}">${e(date)}</time></td><td><strong>${e(recordLabel(record))}</strong><br><small>${e(classification(record))}</small></td><td>${e(detail(record))}</td><td>${record.kind === "expense" && record.body.receiptId ? `<a href="${CUSTOMER_PATH}/driver/receipts/${e(record.body.receiptId)}">Download receipt</a>` : "—"}</td></tr>`).join("")}</tbody></table></div><nav class="record-pages" aria-label="Record pages">${data.page > 1 ? `<a href="${href(data.page - 1)}">← Previous records</a>` : ""}${data.page < data.pages ? `<a href="${href(data.page + 1)}">More records →</a>` : ""}</nav>` : `<p>No received records for ${data.year}. Choose another year or sync your app.</p>`}
    <p class="tax-channel-note">These are your recorded amounts and mileage, not a tax calculation or an approved deduction. A synced record does not itself establish staff review, a filed return, or a refund. Your firm's updates below describe its shared progress.</p>
  </section>`;
}
