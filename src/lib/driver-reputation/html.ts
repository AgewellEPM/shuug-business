import { randomUUID } from "node:crypto";
import { escapeHtml } from "../auth/forms";
import { reputationGuide } from "./guide";
import type { ReputationState } from "./model";

const e = (value: unknown) => escapeHtml(String(value ?? ""));
const path = "/api/website/customer/driver/reputation";
function remove(action: "deleteRating" | "deleteReview", id: string) {
  return `<form method="post" action="${path}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="mutationId" value="${randomUUID()}"><input type="hidden" name="id" value="${e(id)}"><label><input type="checkbox" name="confirmed" value="yes" required> Remove this record from visible history and sync its deletion.</label><button>Remove record</button></form>`;
}
export function reputationHtml(state: ReputationState, notice = "") {
  const guide = reputationGuide(state);
  const ratings = state.ratings.filter(row => !row.deleted).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const reviews = state.reviews.filter(row => !row.deleted).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  return `<section id="reputation"><p class="eyebrow">YOUR RECORDED REPUTATION</p><h2>Ratings, stars &amp; personal reviews</h2>
    <p>These are the measurements and review notes you chose to record, shared with the same client account in your app and your firm's authorized team. They are not verified platform data.</p>
    ${notice ? `<p role="alert">${e(notice)}</p>` : ""}
    <p>Add a rating snapshot or personal review in the Gig Tax Pros app, then sync. Keep each app's score and scale as you actually observed them; a new measurement is a new snapshot.</p>
    <h3>Your latest snapshots</h3>${guide.snapshots.length ? `<ul>${guide.snapshots.map(text => `<li>${e(text)}</li>`).join("")}</ul>` : "<p>No rating measurements have been shared yet.</p>"}
    <h3>Strengths and improvements</h3>${guide.strengths.length ? `<p>${guide.strengths.map(e).join(" · ")}</p>` : ""}
    ${guide.suggestions.length ? `<ul>${guide.suggestions.map(row => `<li><strong>${e(row.title)}</strong><p>${e(row.detail)} Based on ${row.concernCount} mixed or negative tagged note(s).</p></li>`).join("")}</ul>` : "<p>No mixed or negative tagged notes identify a specific improvement area. Keep a routine of clear updates, order accuracy, careful handling and respectful handoffs.</p>"}
    ${guide.unreviewedCount ? `<p>${guide.unreviewedCount} note(s) are unreviewed. No criticism was inferred from them.</p>` : ""}
    <p>Snapshot changes do not predict a future or rolling score. No platform threshold, penalty or guaranteed improvement is inferred. Use the provider's official support for disputes.</p>
    <h3>Rating history</h3>${ratings.map(row => `<article><h4>${e(row.platformName)} · ${e(row.score)}/${row.scale}</h4><p><time datetime="${e(row.recordedAt)}">${e(row.recordedAt)}</time>${row.reviewCount === undefined ? "" : ` · ${row.reviewCount} reviews reported by you`}</p>${row.notes ? `<p>${e(row.notes)}</p>` : ""}${remove("deleteRating", row.id)}</article>`).join("") || "<p>No visible rating snapshots.</p>"}
    <h3>Personal review notes</h3>${reviews.map(row => `<article><h4>${e(row.platformName)}</h4><p><time datetime="${e(row.recordedAt)}">${e(row.recordedAt)}</time> · ${e(row.sentiment)}${row.topics.length ? ` · ${row.topics.map(e).join(", ")}` : ""}</p><p>${e(row.text)}</p>${remove("deleteReview", row.id)}</article>`).join("") || "<p>No visible personal reviews.</p>"}
    <p><a href="/api/website/customer/driver/coach">Ask Tax &amp; Goals about my ratings or reviews</a> · <a href="/api/website/customer">Return to my account</a></p>
  </section>`;
}
