import { escapeHtml } from "../auth/forms";
import type { ClientTaxSummary } from "./tax";
import { taxDocumentUploadHtml } from "./tax-document-html";

const e = (value: unknown) => escapeHtml(String(value ?? ""));
const message = (value: string) => value ? `<p class="client-message">${e(value)}</p>` : "";
const dateLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : value;
};
export function taxSummaryHtml(data: ClientTaxSummary | null, year?: number) {
  if (!data) return "";
  const engagements = data.engagements.filter(item => year === undefined || item.year === null || item.year === year);
  const quarterly = data.quarterly.filter(item => year === undefined || item.year === null || item.year === year);
  return `<section id="tax-work" aria-labelledby="tax-work-title"><p class="eyebrow">YOUR TAX WORKSPACE</p><h2 id="tax-work-title">Your tax work</h2><p>See the updates your firm has chosen to share with you. Contact your preparer about questions or changes.</p>
    ${engagements.map(engagement => `<article class="tax-engagement"><div class="tax-heading"><h3>${e(engagement.name)}</h3><span class="status">${e(engagement.stage)}</span></div>${engagement.year ? `<p class="tax-year">Tax year ${engagement.year}</p>` : ""}${message(engagement.message)}
      <h4>Document requests</h4>${engagement.documents.length ? `<ul class="tax-requests">${engagement.documents.map(item => `<li><div><strong>${e(item.name)}</strong><span class="status">${e(item.status)}</span></div>${item.requestedBy ? `<p>Requested by <time datetime="${e(item.requestedBy)}">${e(dateLabel(item.requestedBy))}</time></p>` : ""}${message(item.message)}${item.uploadAvailable ? taxDocumentUploadHtml(item.id, item.submissions, item.name) : ""}</li>`).join("")}</ul>` : "<p>No document requests have been shared for this engagement.</p>"}
      ${engagement.records.map(item => `<div class="tax-records"><h4>${e(item.name)}</h4><p>${e(item.platform)}</p><dl class="record-status"><div><dt>Income records</dt><dd>${e(item.income)}</dd></div><div><dt>Mileage records</dt><dd>${e(item.mileage)}</dd></div><div><dt>Expense records</dt><dd>${e(item.expenses)}</dd></div></dl>${message(item.message)}</div>`).join("")}</article>`).join("") || "<p>No engagement updates have been shared yet. Your firm will share them here when available.</p>"}
    ${quarterly.length ? `<h3>Quarterly reviews</h3><div class="tax-review-grid">${quarterly.map(item => `<article><div class="tax-heading"><h4>${e(item.name)}</h4><span class="status">${e(item.status)}</span></div><p>${e(item.quarter)}${item.year ? ` · ${item.year}` : ""}${item.reviewOn ? ` · Staff review: <time datetime="${e(item.reviewOn)}">${e(dateLabel(item.reviewOn))}</time>` : ""}</p>${message(item.message)}</article>`).join("")}</div><p><small>These are staff review dates. Confirm any tax payment or filing deadlines with your preparer.</small></p>` : ""}
    <p class="tax-channel-note">Use the private upload within the relevant document request. These updates track staff progress; they do not calculate taxes or confirm that a return was filed.</p>
  </section>`;
}
