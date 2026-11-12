import { processShopAutomation } from "../src/lib/shop-automation/service";
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { stopping = true; });
async function main() {
  do {
    try {
      const result = await processShopAutomation();
      // Do not log customer contacts, message contents or private invoice links.
      console.log(JSON.stringify({ shopWorker: result.status, at: new Date().toISOString() }));
    } catch { console.error("Shop automation needs review. Check the private workspace's run and message history."); }
    if (process.argv.includes("--once")) break;
    for (let seconds = 0; seconds < 15 && !stopping; seconds++) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping);
}
void main();
