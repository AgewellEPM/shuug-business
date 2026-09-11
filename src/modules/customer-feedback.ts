/**
 * EXAMPLE MODULE — built entirely with the public SDK, no core files touched.
 * Copy this file, change the manifest, drop it in the barrel (src/modules/index.ts)
 * and you have a new feature: nav item, permissions, API and a full records UI.
 */
import { defineModule } from "@/lib/sdk/module";

export default defineModule({
  id: "customer-feedback",
  label: "Customer feedback",
  description: "Log what customers tell you, track sentiment, and never lose a follow-up.",
  group: "Sales",
  section: "sales",
  icon: "customers",
  version: "1.0.0",
  author: "Shuug",
  fields: [
    { id: "customer", label: "Customer", type: "text", required: true, options: [] },
    { id: "rating", label: "Rating (1–5)", type: "number", required: false, options: [] },
    { id: "sentiment", label: "Sentiment", type: "select", required: true, options: ["Positive", "Neutral", "Negative"] },
    { id: "message", label: "What they said", type: "notes", required: false, options: [] },
    { id: "followed_up", label: "Followed up", type: "checkbox", required: false, options: [] },
  ],
  panels: [
    {
      id: "overview",
      label: "At a glance",
      compute: (records) => {
        const live = records.filter((r) => !r.archived);
        const ratings = live.map((r) => Number(r.values.rating)).filter((n) => Number.isFinite(n));
        const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
        const negative = live.filter((r) => r.values.sentiment === "Negative");
        const needFollowUp = negative.filter((r) => r.values.followed_up !== true).length;
        return [
          { label: "Total feedback", value: String(live.length) },
          { label: "Avg rating", value: avg, tone: ratings.length && Number(avg) < 3 ? "warn" : "good" },
          { label: "Negative — no follow-up", value: String(needFollowUp), tone: needFollowUp > 0 ? "bad" : "good" },
        ];
      },
    },
  ],
  api: (records) => {
    const live = records.filter((r) => !r.archived);
    const bySentiment = { Positive: 0, Neutral: 0, Negative: 0 } as Record<string, number>;
    for (const r of live) { const s = String(r.values.sentiment ?? ""); if (s in bySentiment) bySentiment[s]++; }
    return { count: live.length, bySentiment };
  },
});
