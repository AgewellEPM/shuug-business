import { processWebsitePayments } from "../src/lib/website-payments/service";
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  do {
    try { const results = await processWebsitePayments(20); if (results.length) console.log(JSON.stringify({ websitePayments: results })); }
    catch { console.error("Website payment worker could not read its private database. Check the data volume and vault key."); }
    if (process.argv.includes("--once")) break;
    for (let seconds = 0; seconds < 10 && !stopping; seconds++) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping);
}
void main();
