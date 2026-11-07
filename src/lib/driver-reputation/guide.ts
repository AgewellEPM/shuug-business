import type { ReputationState, ReputationTopic } from "./model";

const steps: Record<ReputationTopic, { title: string; detail: string }> = {
  communication: { title: "Make updates clear", detail: "Send concise, relevant updates through the app when there is a delay, substitution or handoff question. Avoid unnecessary messages and protect customer details." },
  timing: { title: "Review timing you can control", detail: "Check preparation time, route and handoff requirements before committing. Give a realistic update about delays; never rush or drive unsafely to protect a score." },
  accuracy: { title: "Use a final accuracy check", detail: "Compare items, quantities, instructions and substitutions with the actual order before handoff. Follow the app's substitution and verification process." },
  handling: { title: "Protect the order during handling", detail: "Use suitable bags, separate items as needed, and check packaging and safe handoff instructions. Follow food-safety and platform requirements." },
  professionalism: { title: "Keep interactions professional", detail: "Use respectful communication, follow access and delivery instructions, and use official support for disputes. Do not pressure customers for ratings." },
  other: { title: "Review the specific feedback", detail: "Identify one concrete action from the recorded comment and compare it with the job facts. Use official support to question an inaccurate review." },
};
export function isReputationQuestion(text: string) {
  const query = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (/\bratings?\b|\brated\b|\bstars?\b|\breputation\b|\bfeedback\b/.test(query)) return true;
  return /\b(?:customer scores?|customer reviews?|my reviews?|personal reviews?|app reviews?)\b/.test(query);
}
export function reputationGuide(state: ReputationState) {
  const ratings = state.ratings.filter(row => !row.deleted).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || b.id.localeCompare(a.id));
  const reviews = state.reviews.filter(row => !row.deleted);
  const groups = new Map<string, typeof ratings>();
  for (const row of ratings) { const values = groups.get(row.platformID) ?? []; values.push(row); groups.set(row.platformID, values); }
  const snapshots = [...groups.values()].map(rows => {
    const current = rows[0], previous = rows.find(row => row.scale === current.scale && Date.parse(row.recordedAt) < Date.parse(current.recordedAt));
    return `${current.platformName}: ${current.score}/${current.scale} recorded ${current.recordedAt.slice(0, 10)}${current.reviewCount !== undefined ? ` with ${current.reviewCount} reviews reported by you` : ""}${previous ? `; previous same-scale snapshot ${previous.score}/${previous.scale} on ${previous.recordedAt.slice(0, 10)}` : "; no previous same-scale snapshot"}.`;
  });
  const suggestions = (Object.keys(steps) as ReputationTopic[]).map(topic => {
    const concerns = reviews.filter(row => ["mixed", "negative"].includes(row.sentiment) && (row.topics.length ? row.topics : ["other"]).includes(topic));
    const strengths = reviews.filter(row => row.sentiment === "positive" && (row.topics.length ? row.topics : ["other"]).includes(topic));
    return { topic, ...steps[topic], concernCount: concerns.length, strengthCount: strengths.length, reviewIDs: concerns.map(row => row.id) };
  }).filter(row => row.concernCount > 0).sort((a, b) => b.concernCount - a.concernCount || a.topic.localeCompare(b.topic));
  const strengths = (Object.keys(steps) as ReputationTopic[]).flatMap(topic => {
    const count = reviews.filter(row => row.sentiment === "positive" && (row.topics.length ? row.topics : ["other"]).includes(topic)).length;
    return count ? [`${topic}: ${count} positive tagged review(s)`] : [];
  });
  return { snapshots, suggestions, strengths, unreviewedCount: reviews.filter(row => row.sentiment === "unreviewed").length,
    ratingIDs: ratings.map(row => row.id), reviewIDs: reviews.map(row => row.id), ratingCount: ratings.length, reviewCount: reviews.length };
}
export function reputationAnswer(state: ReputationState, query = "") {
  const normalized = (text: string) => " " + text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  const question = normalized(query), platforms = new Map([...state.ratings, ...state.reviews].filter(row => !row.deleted).map(row => [row.platformID, row.platformName]));
  const matches = [...platforms].filter(([id, name]) => question.includes(normalized(id)) || question.includes(normalized(name)));
  const selected = matches.length === 1 ? { ...state, ratings: state.ratings.filter(row => row.platformID === matches[0][0]), reviews: state.reviews.filter(row => row.platformID === matches[0][0]) } : state;
  const guide = reputationGuide(selected);
  return { text: [`Based on all saved manual reputation history${matches.length === 1 ? ` for ${matches[0][1]}` : ""}, independent of the selected financial date range. ${guide.ratingCount} rating snapshots and ${guide.reviewCount} personal review notes. These are not verified provider data.`,
    guide.snapshots.join("\n") || "Add the score, scale and observation date you actually saw in the work app. Five-star and percentage scores are kept separate.",
    guide.strengths.length ? `Recorded strengths:\n${guide.strengths.join("\n")}` : "No positive tagged review notes are recorded yet.",
    guide.suggestions.length ? `Improvements based on your mixed or negative tagged notes:\n${guide.suggestions.slice(0, 6).map(row => `${row.title} (${row.concernCount} note(s)): ${row.detail}`).join("\n")}`
      : "No mixed or negative tagged notes identify a specific improvement area. For a general routine, check order accuracy, clear updates, careful handling and respectful handoffs.",
    guide.unreviewedCount ? `${guide.unreviewedCount} note(s) still have unreviewed sentiment; no criticism was inferred from them.` : "",
    "Snapshot changes do not predict a future or rolling platform score. No platform thresholds, ranking penalties or guaranteed improvement are inferred. Check the provider's current official guidance and use its support channel for disputes."].filter(Boolean).join("\n\n"),
    sources: [], recordIds: [...guide.ratingIDs, ...guide.reviewIDs].slice(0, 100) };
}
