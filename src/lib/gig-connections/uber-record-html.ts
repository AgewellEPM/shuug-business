import { escapeHtml } from "../auth/forms";
import type { uberRecordPage } from "./uber";
const e = (value: unknown) => escapeHtml(String(value ?? ""));
export function uberRecordHtml(data: ReturnType<typeof uberRecordPage>, basePath: string) {
  const link = (page: number) => `${basePath}${basePath.includes("?") ? "&" : "?"}kind=${data.kind}&page=${page}`;
  return `<section><h2>Uber ${data.kind === "payments" ? "payment source records" : "trip source records"}</h2><p>${data.count} saved records · Page ${data.page} of ${data.pages}. Provider records are separate from posted tax-journal entries and bank deposits.</p><div class="scroll"><table><thead><tr><th>Date</th><th>Provider record</th><th>Amount / status</th><th>Last retrieved</th></tr></thead><tbody>${data.records.map(row => `<tr><td>${e(row.date ?? "Not supplied")}</td><td>${e(row.category)}<br><small>${e(row.id)}</small></td><td>${row.amount != null ? `${e(row.currency)} ${row.amount.toFixed(2)}` : e(row.status)}</td><td>${e(row.observedAt)}</td></tr>`).join("")}</tbody></table></div>${data.count ? "" : "<p>No provider records have been imported for this selection.</p>"}<p>${data.page > 1 ? `<a href="${e(link(data.page - 1))}">Previous page</a> ` : ""}${data.page < data.pages ? `<a href="${e(link(data.page + 1))}">Next page</a>` : ""}</p></section>`;
}
