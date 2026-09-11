import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { syncTick } from "../src/lib/shopify-backend/sync";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  do {
    try { const result = await syncTick(); if (!["idle", "disabled", "busy"].includes(result.state)) console.log(JSON.stringify(result)); }
    catch (error) { console.error(error instanceof Error ? error.message : "Shopify sync failed"); }
    if (process.argv.includes("--once")) return;
    // Short interruptible intervals let the worker stop promptly without orphaning a job.
    for (let i = 0; i < 20 && !stopping; i++) await setTimeout(100);
  } while (!stopping);
}
main().catch(() => { process.exitCode = 1; });
