import { processPendingRuns } from "../src/lib/getting-started/runner";
let stopped = false;
process.once("SIGINT", () => { stopped = true; }); process.once("SIGTERM", () => { stopped = true; });
async function main() {
  do { const result = await processPendingRuns(); if (result.completed) console.log(JSON.stringify(result)); if (process.argv.includes("--once")) break; if (!stopped) await new Promise(resolve => setTimeout(resolve, 2000)); } while (!stopped);
}
main().catch(() => { console.error("Workflow worker stopped. Check the private data directory and run history."); process.exitCode = 1; });
