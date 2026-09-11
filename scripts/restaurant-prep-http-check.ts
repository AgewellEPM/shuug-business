import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { restaurantManagementData } from "../src/lib/restaurant/management";
import { restaurantBusinessSnapshot } from "../src/lib/restaurant/business";
import { advanceTicket } from "../src/lib/restaurant/store";

export async function restaurantPrepHttpCheck(base: string, cookie: string, employeeCookie: string, backendToken: string, today: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Prep acceptance requires disposable fixture data.");
  const request = (path: string, body?: unknown, identity = cookie, origin = base) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: identity, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const command = async (action: string, input: unknown, requestId = randomUUID()) => {
    const response = await request("/api/restaurant/business", { requestId, action, input }), result = await response.json(); assert(response.ok, result.error); return result.result as { id: string };
  };
  const read = async (): Promise<ReturnType<typeof restaurantManagementData>> => { const r = await request("/api/restaurant/business"); assert(r.ok); return r.json(); };
  const supplier = (await command("supplier.save", { name: "HTTP prep supply", email: "", phone: "", active: true })).id;
  const ingredient = async (name: string) => (await command("ingredient.save", { name, unit: "g", reorderAt: 0, targetStock: 1000, supplierId: null, active: true })).id;
  const raw = await ingredient("HTTP prep tomatoes"), output = await ingredient("HTTP prepared sauce");
  await command("receive", { supplierId: supplier, invoiceReference: "HTTP-PREP-RAW", date: today, purchaseId: null, lines: [{ ingredientId: raw, quantity: 1000, cost: 1001, expires: null }] });
  const bills = (await read()).financial!.bills.length, inputs = [{ ingredientId: raw, quantity: 500 }];
  const recipeId = (await command("prep.recipe.save", { name: "HTTP sauce prep", outputIngredientId: output, expectedQuantity: 400, inputs, instructions: "Synthetic kitchen prep instructions", active: true })).id;
  const input = { recipeId, recipeRevision: 1, batches: 1, reference: "HTTP-PREP-1", inputs, evidence: "Synthetic weighed inputs", reviewed: true };
  assert.equal((await request("/api/restaurant/business", { requestId: randomUUID(), action: "prep.start", input }, employeeCookie)).status, 403);
  assert.equal((await request("/api/restaurant/business", { requestId: randomUUID(), action: "prep.start", input }, cookie, "https://foreign.test")).status, 403);
  const firstRequest = randomUUID(), id = (await command("prep.start", input, firstRequest)).id;
  assert.equal((await command("prep.start", input, firstRequest)).id, id);
  const competing = ["HTTP-PREP-2", "HTTP-PREP-3"].map(reference => ({ requestId: randomUUID(), action: "prep.start", input: { ...input, reference } }));
  const responses = await Promise.all(competing.map(body => request("/api/restaurant/business", body)));
  assert.equal(responses.filter(r => r.ok).length, 1); assert.equal(responses.filter(r => r.status === 400).length, 1);
  const secondId = (await responses.find(r => r.ok)!.json()).result.id as string;
  const mcp = new Client({ name: "restaurant-prep-acceptance", version: "1" });
  try {
    await mcp.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base), { requestInit: { headers: { Authorization: `Bearer ${backendToken}` } } }));
    const catalog = await mcp.callTool({ name: "restaurant_catalog", arguments: {} }); assert.notEqual(catalog.isError, true); assert(JSON.stringify(catalog).includes("prep.complete"));
    const complete = { action: "prep.complete", requestId: randomUUID(), input: { id, revision: 1, quantity: 350, expires: today, evidence: "Synthetic measured output and reviewed release", reviewed: true } };
    const result = await mcp.callTool({ name: "restaurant_command", arguments: complete }); assert.notEqual(result.isError, true); assert.deepEqual(await mcp.callTool({ name: "restaurant_command", arguments: complete }), result);
  } finally { await mcp.close(); }
  await command("prep.discard", { id: secondId, revision: 1, evidence: "Synthetic full-batch loss", reviewed: true });
  const data = await read(), completed = data.prepBatches.find(b => b.id === id)!;
  assert.equal(completed.foodCost, 501); assert.equal(completed.actualQuantity, 350); assert.equal(data.financial!.bills.length, bills);
  assert.equal(data.lots.find(l => l.prepBatchId === id)?.remainingCost, 501);
  assert.equal(restaurantBusinessSnapshot().prepBatches?.find(b => b.id === id)?.status, "completed", "Another process cannot read completed prep.");
  const finance = await (await request("/api/restaurant/finance")).json(); assert.deepEqual(finance.prepRecipes, []); assert.deepEqual(finance.prepBatches, []);
  const page = await request("/restaurant/manage?tab=prep"), html = await page.text(); assert(page.ok && html.includes("HTTP-PREP-1") && html.includes("87.5") && html.includes("Prep history and yield differences"));
  const menu = (await command("menu.save", { name: "HTTP sauce serving", category: "Main", price: 1000, station: "Line", description: "Synthetic prep sale", allergens: "Fixture kitchen-reviewed notes", recipe: [{ ingredientId: output, quantity: 100 }], active: true })).id;
  const orderId = (await command("order.create", { ref: "HTTP-PREP-SALE", channel: "takeaway", guest: "Fixture", covers: 1, reservationId: null, server: "Cook", note: "", lines: [{ menuId: menu, qty: 1 }] })).id;
  await command("order.fire", { id: orderId, revision: 1, allergensReviewed: true });
  let order = (await read()).orders.find(o => o.id === orderId)!; assert.equal(order.foodCost, 143);
  // The existing installed kitchen controls invoke these same transaction functions.
  // Exercise the second-process kitchen lane against the saved HTTP check.
  advanceTicket(order.ticketId!, "cooking"); advanceTicket(order.ticketId!, "ready");
  await command("order.serve", { id: orderId, revision: order.revision }); order = (await read()).orders.find(o => o.id === orderId)!;
  await command("tender", { id: orderId, revision: order.revision, amount: order.total, tip: 0, reference: "HTTP-PREP-CASH", method: "cash", received: true });
  order = (await read()).orders.find(o => o.id === orderId)!; await command("order.close", { id: orderId, revision: order.revision });
  const ledger = await request("/ledger"); assert(ledger.ok && (await ledger.text()).includes("Prep completed: HTTP-PREP-1"));
  console.log("Installed restaurant prep: recipe → measured input → competing last-stock protection → genuine MCP completion/retry → yielded lot → priced menu sale → payment, plus discarded batch, permissions, saved screen and cross-process ledger passed.");
  return { cash: order.total, netSales: order.subtotal, foodCost: order.foodCost };
}
