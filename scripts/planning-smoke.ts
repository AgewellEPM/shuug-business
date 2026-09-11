/** Read-only AI check using synthetic notes; never sends actual workspace data. */
import { askRoadmap } from "../src/lib/planning/service";
async function main() {
  if (process.argv.includes("--debug")) {
    const original = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await original(...args);
      if (response.ok) console.log("Synthetic response:", await response.clone().text());
      return response;
    };
  }
  const result = await askRoadmap({ goal: "Prepare the weekly service schedule", jobRole: "Service coordinator", profile: "service", notes: [], messages: [{ role: "user", content: "Make a three-step roadmap to review open requests, assign staff and confirm the weekly schedule. Do not invent dates." }] });
  if (!result.plan || result.plan.steps.length < 1 || result.plan.steps.some(s => s.status !== "todo")) throw new Error("AI did not return a usable proposal.");
  console.log(JSON.stringify({ ok: true, steps: result.plan.steps.length, validPlan: true, workspaceDataSent: false }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Planning check failed"); process.exitCode = 1; });
