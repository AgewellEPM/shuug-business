import { escapeHtml } from "../auth/forms";
import { CUSTOMER_PATH } from "../customer-access/accounts";
import type { UberConnectionSummary } from "./uber";
const e = (value: unknown) => escapeHtml(String(value ?? ""));
const path = `${CUSTOMER_PATH}/connections/uber`;
export function uberConnectionHtml(data: UberConnectionSummary | null) {
  if (!data) return "";
  const throughDay = new Date().toISOString().slice(0, 10), fromDay = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  return `<section id="uber-connection"><p class="eyebrow">CONNECTED SOURCE RECORDS</p><h2>Uber driver account</h2><p>${e(data.availability)}</p>
    ${data.profile ? `<p>Previously verified driver: <strong>${e(data.profile.name)}</strong>${data.profile.activationStatus ? ` · Uber status: ${e(data.profile.activationStatus)}` : ""}</p>` : ""}
    <p>Connection: <strong>${e(data.connected ? "Connected through Uber" : data.status === "reauthorize" ? "Reauthorization required" : "Not connected")}</strong></p>
    ${data.lastSyncAt ? `<p>Last successful sync: <time datetime="${e(data.lastSyncAt)}">${e(data.lastSyncAt)}</time>${data.lastPeriod ? ` · ${e(data.lastPeriod.fromDay)} through ${e(data.lastPeriod.throughDay)}` : ""}</p>` : "<p>No Uber trips or payments have synced yet.</p>"}
    ${data.ready && !data.connected ? `<form method="post" action="${path}/authorize"><button>Authorize read-only access with Uber</button></form><p>Uber handles sign-in and consent. Gig Tax Pros does not collect your Uber password.</p>` : ""}
    ${data.ready && data.connected ? `<form method="post" action="${path}/sync"><label>From date<input type="date" name="fromDay" value="${fromDay}" max="${throughDay}" required></label><label>Through date<input type="date" name="throughDay" value="${throughDay}" max="${throughDay}" required></label><p>Choose up to 31 days per sync. Overlapping dates update the same provider records.</p><button>Sync Uber trips & payments</button></form>` : ""}
    ${data.connected ? `<form method="post" action="${path}/disconnect"><button>Disconnect Uber</button></form>` : ""}
    <p>${data.trips} saved provider trips · ${data.payments} saved provider payment records.</p><p>${e(data.accountingPolicy)}</p>
    ${data.trips || data.payments ? `<p><a href="${path}/records?kind=payments">Review all saved Uber payments</a> · <a href="${path}/records?kind=trips">Review all saved Uber trips</a></p>` : ""}
    ${data.recentPayments.length ? `<details><summary>Recent imported payment records</summary><ul>${data.recentPayments.map(item => `<li>${e(item.date)} · ${e(item.currency)} ${item.amount.toFixed(2)} · ${e(item.category)}</li>`).join("")}</ul></details>` : ""}
    ${data.recentTrips.length ? `<details><summary>Recent imported trip records</summary><ul>${data.recentTrips.map(item => `<li>${e(item.pickupAt ?? "Pickup time unavailable")} · ${e(item.status)}</li>`).join("")}</ul></details>` : ""}
    <p><small>Provider consent and recent source retrieval establish this connection. Offer screenshots and manually entered records do not.</small></p>
  </section>`;
}
