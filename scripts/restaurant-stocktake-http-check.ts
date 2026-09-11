import { randomUUID } from "node:crypto";
import type { restaurantManagementData } from "../src/lib/restaurant/management";
import { restaurantBusinessSnapshot } from "../src/lib/restaurant/business";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function restaurantStocktakeHttpCheck(base: string, cookie: string, employeeCookie: string, fixture: { ingredient: string; supplier: string; today: string }) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Inventory-count acceptance requires disposable fixture data.");
  const request = (path: string, body?: unknown, token = cookie) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: token, Origin: base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const command = async (action: string, input: unknown, requestId = randomUUID()) => { const response = await request("/api/restaurant/business", { action, input, requestId }), result = await response.json(); assert(response.ok, result.error ?? `Inventory count ${action} failed`); return result.result as { id: string }; };
  const read = async (): Promise<ReturnType<typeof restaurantManagementData>> => (await request("/api/restaurant/business")).json();
  const prior = await read(), bills = prior.financial!.bills.length;
  const { id } = await command("stocktake.start", { reference: "HTTP-STOCKTAKE", ingredientIds: [fixture.ingredient], note: "Synthetic storeroom count after service" });
  const count = async () => { const c = (await read()).stocktakes.find(c => c.id === id); assert(c, "Installed count missing"); return c; };
  const first = await count(); assert(first.lines.length === 1 && first.lines[0].expectedQuantity === 100 && first.lines[0].countedQuantity === null, "Count sheet did not capture the actual remaining lot.");
  assert((await request("/api/restaurant/business", { requestId: randomUUID(), action: "stocktake.submit", input: { id, revision: first.revision, confirmed: true } })).status === 400, "Count submitted without physical observations.");
  await command("stocktake.record", { id, revision: first.revision, lineId: first.lines[0].id, quantity: 90, reason: "Synthetic verified ten-unit shortage" });
  await command("stocktake.found", { id, revision: (await count()).revision, ingredientId: fixture.ingredient, supplierId: fixture.supplier, lotReference: "HTTP-OWNED-STOCK", quantity: 20, cost: 20, expires: null, evidence: "Synthetic already-recorded purchase found on shelf", owned: true });
  await command("stocktake.submit", { id, revision: (await count()).revision, confirmed: true });
  const input = { id, revision: (await count()).revision, reviewed: true, evidence: "Synthetic reviewed physical count and cost evidence" };
  assert((await request("/api/restaurant/business", { requestId: randomUUID(), action: "stocktake.post", input }, employeeCookie)).status === 403, "Restricted employee posted an inventory adjustment.");
  // Concurrent reviewers must never create duplicate stock adjustments.
  const reviewerRequests = [randomUUID(), randomUUID()], race = await Promise.all(reviewerRequests.map(requestId => request("/api/restaurant/business", { requestId, action: "stocktake.post", input })));
  assert(race.filter(r => r.ok).length === 1 && race.filter(r => r.status === 400).length === 1, "Competing reviewers posted the same count twice.");
  await command("stocktake.post", input, reviewerRequests[race.findIndex(r => r.ok)]);
  const after = await read(), reviewed = await count(); assert(reviewed.status === "posted" && reviewed.gains === 20 && reviewed.losses === 10 && reviewed.netValue === 10, "Posted count totals are incorrect.");
  assert(after.ingredients.find(i => i.id === fixture.ingredient)?.available === 110 && after.financial!.bills.length === bills, "Found stock quantity or payable treatment is incorrect.");
  const journal = after.financial!.journals.filter(j => j.source === `restaurant-stocktake:${id}`); assert(journal.length === 1 && journal[0].lines.reduce((n, l) => n + l.debitCents - l.creditCents, 0) === 0, "Inventory adjustment did not post one balanced journal.");
  assert(restaurantBusinessSnapshot().stocktakes?.find(c => c.id === id)?.status === "posted", "A second process cannot read the posted count.");
  const finance = await (await request("/api/restaurant/finance")).json(); assert(finance.stocktakes.some((c: { id: string }) => c.id === id) && finance.orders.length === 0 && finance.menu.length === 0, "Finance projection lost review evidence or exposed recipes/guests.");
  for (const path of ["/restaurant/manage?tab=stocktakes", "/restaurant/finance?tab=stocktakes"]) { const page = await request(path), html = await page.text(); assert(page.ok && html.includes("HTTP-STOCKTAKE") && html.includes("Physical inventory counts"), "Installed count screen did not render the saved adjustment."); }
  const ledger = await request("/ledger"); assert(ledger.ok && (await ledger.text()).includes("Stocktake: HTTP-STOCKTAKE"), "Shared books did not include the physical inventory journal.");
  console.log(JSON.stringify({ ok: true, stocktakes: ["physical lot observations and required completeness", "owned-stock evidence without duplicate payable", "submit and authorized review", "competing reviewer protection", "atomic quantity/value/journal", "finance projection and installed pages", "cross-process persistence"] }));
}
