import { randomUUID } from "node:crypto";
import { escapeHtml } from "../auth/forms";
import { CUSTOMER_PATH } from "../customer-access/accounts";
import { DriverError } from "../rideshare-driver/model";
import { businessTypes, type CoachPeriod, type CoachState } from "./model";

const path = `${CUSTOMER_PATH}/driver/coach`;
const e = (value: unknown) => escapeHtml(String(value ?? ""));
const hidden = (name: string, value: unknown) => `<input type="hidden" name="${name}" value="${e(value)}">`;
function operation(action: string, period: CoachPeriod) {
  return hidden("action", action) + hidden("mutationId", randomUUID()) + hidden("from", period.from) + hidden("through", period.through);
}
const labels: Record<typeof businessTypes[number], string> = { "sole-proprietor": "Sole proprietor", "single-member-llc": "Single-member LLC",
  partnership: "Partnership", corporation: "Corporation", unsure: "Not sure — ask my preparer" };
export function coachPortalHtml(state: CoachState, period: CoachPeriod, notice = "", draft?: { text: string; mutationId: string; messageId: string }) {
  const preferences = state.preferences, intake = state.intake;
  const amount = (value?: number) => value === undefined ? "" : String(value / 100);
  const questions = ["Where am I losing money, on which jobs, and which jobs make the most?", "What information is missing for my tax preparation?", "How am I doing against my goals?"];
  return `<section id="tax-goals" aria-labelledby="tax-goals-title"><p class="eyebrow">YOUR RECORDS · YOUR NEXT STEP</p><h2 id="tax-goals-title">Tax &amp; Goals</h2>
    <p>Ask where your recorded jobs earn or lose money, follow your goals, and prepare your next tax-record step. This conversation is shared with your firm's authorized team and the same client account in your app.</p>
    <p><small>Answers use received records and saved assumptions. No model is needed for these calculations. A reply identifies any connected Peel arithmetic verification separately.</small></p>
    ${notice ? `<p role="alert">${e(notice)}</p>` : ""}
    <form method="get" action="${path}" class="year-filter"><label>From<input type="date" name="from" value="${e(period.from)}" required></label><label>Through<input type="date" name="through" value="${e(period.through)}" required></label><button>Use this period</button></form>
    <div class="coach-prompts">${questions.map(text => `<form method="post" action="${path}">${operation("message", period)}${hidden("messageId", randomUUID())}${hidden("text", text)}<button>${e(text)}</button></form>`).join("")}</div>
    <div class="coach-history" aria-label="Shared Tax and Goals conversation">${state.messages.map(message => `<article class="coach-message"><strong>${message.role === "user" ? "You" : message.role === "staff" ? "Your tax team" : "Records coach"}</strong><small> · <time datetime="${e(message.createdAt)}">${e(new Date(message.createdAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" }))}</time></small><p>${e(message.text)}</p>${message.engine ? `<small>${e(message.engine)}</small>` : ""}${message.sources?.length ? `<ul aria-label="Sources">${message.sources.map(source => `<li><a href="${e(source.url)}" rel="noreferrer">${e(source.title)}</a></li>`).join("")}</ul>` : ""}${message.recordIds?.length ? `<details><summary>Recorded evidence · ${message.recordIds.length} referenced records</summary><p>${message.recordIds.map(e).join("\n")}</p><a href="${CUSTOMER_PATH}#driver-records">Review your received records</a></details>` : ""}</article>`).join("") || "<p>Your shared conversation starts here. Records saved only on your phone must sync before the workspace can use them.</p>"}</div>
    ${state.messages.length === 100 ? "<p><small>Showing the latest 100 messages. Earlier saved history is retained.</small></p>" : ""}
    <form method="post" action="${path}">${draft ? hidden("action", "message") + hidden("mutationId", draft.mutationId) + hidden("from", period.from) + hidden("through", period.through) + hidden("messageId", draft.messageId) : operation("message", period) + hidden("messageId", randomUUID())}<label>Your question<textarea name="text" maxlength="2000" rows="3" required>${e(draft?.text ?? "")}</textarea></label><p><small>Leave taxpayer and bank account numbers out of chat. Use the private upload on your firm's document request for tax forms.</small></p><button>Ask about my records</button></form>
    <details><summary>Operating cost &amp; net goals</summary><p>Saving shares this explicit snapshot with your client account. The cost estimate is used for operating profit, not tax deductions.</p><form method="post" action="${path}">${operation("preferences", period)}
      <label>Vehicle operating cost · USD per mile<input type="number" name="costPerMile" step="0.0001" min="0" max="100" value="${e(amount(preferences.vehicleCostCentsPerMile))}"></label>
      <label>Daily net goal · USD<input type="number" name="dailyNet" step="0.01" min="0" value="${e(amount(preferences.dailyNetCents))}"></label>
      <label>Weekly net goal · USD<input type="number" name="weeklyNet" step="0.01" min="0" value="${e(amount(preferences.weeklyNetCents))}"></label>
      <label>Net per recorded hour goal · USD<input type="number" name="targetHourly" step="0.01" min="0" value="${e(amount(preferences.targetHourlyCents))}"></label><button>Save my cost &amp; goals</button></form></details>
    <details><summary>Confirmed tax context</summary><p>Confirm only these preparation facts. Your firm reviews their tax treatment.</p><form method="post" action="${path}">${operation("intake", period)}
      <label>Tax year<input type="number" name="taxYear" min="1900" max="9999" step="1" value="${e(intake.taxYear)}"></label>
      <label>State or country<input name="jurisdiction" maxlength="80" value="${e(intake.jurisdiction)}"></label>
      <label>Business structure<select name="businessType"><option value="">Choose or leave unknown</option>${businessTypes.map(value => `<option value="${value}"${intake.businessType === value ? " selected" : ""}>${e(labels[value])}</option>`).join("")}</select></label>
      <label><input type="checkbox" name="confirmed" value="yes" required> I confirm these preparation facts for my account.</label><button>Confirm tax context</button></form></details>
    <h3>Your next steps</h3><ul>${state.milestones.map(item => `<li><strong>${item.status === "done" ? "Complete" : "To do"} · ${e(item.title)}</strong><p>${e(item.detail)}</p></li>`).join("")}</ul><p><a href="${CUSTOMER_PATH}#tax-work">Open shared tax work and private document requests</a></p>
  </section>`;
}
export function coachFormMutation(form: URLSearchParams) {
  const action = form.get("action"), common = { action, mutationId: form.get("mutationId"),
    ...(form.get("from") ? { from: form.get("from") } : {}), ...(form.get("through") ? { through: form.get("through") } : {}) };
  const commonKeys = ["action", "mutationId", "from", "through"];
  const allowed = [...commonKeys, ...(action === "message" ? ["messageId", "text"] : action === "intake" ? ["taxYear", "jurisdiction", "businessType", "confirmed"]
    : action === "preferences" ? ["costPerMile", "dailyNet", "weeklyNet", "targetHourly"] : [])];
  if ([...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) throw new DriverError(400, "Use one value for each coach form field.");
  if (action === "message") return { ...common, messageId: form.get("messageId"), text: form.get("text") };
  if (action === "intake") return { ...common, confirmed: form.get("confirmed") === "yes", answers: {
    ...(form.get("taxYear") ? { taxYear: Number(form.get("taxYear")) } : {}), ...(form.get("jurisdiction") ? { jurisdiction: form.get("jurisdiction") } : {}),
    ...(form.get("businessType") ? { businessType: form.get("businessType") } : {}) } };
  const dollars = (key: string, fractional = false) => {
    const text = form.get(key)?.trim(); if (!text) return undefined;
    if (!(fractional ? /^\d{1,7}(\.\d{1,4})?$/ : /^\d{1,7}(\.\d{1,2})?$/).test(text)) throw new DriverError(400, "Use nonnegative USD amounts for your goals and cost estimate.");
    return fractional ? Number(text) * 100 : Math.round(Number(text) * 100);
  };
  return { ...common, preferences: { vehicleCostCentsPerMile: dollars("costPerMile", true), dailyNetCents: dollars("dailyNet"),
    weeklyNetCents: dollars("weeklyNet"), targetHourlyCents: dollars("targetHourly") } };
}
