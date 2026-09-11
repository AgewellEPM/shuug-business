import { randomUUID } from "node:crypto";
import { restaurantBusinessSnapshot } from "../src/lib/restaurant/business";
import type { RestaurantOverview } from "../src/lib/restaurant/load";
import type { restaurantManagementData } from "../src/lib/restaurant/management";
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
export async function restaurantModifierHttpCheck(base: string, ownerCookie: string, employeeCookie: string, today: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Modifier HTTP checks require disposable data.");
  const request = (route: string, body?: unknown, cookie = ownerCookie) => fetch(base + route, { method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const read = async () => (await (await request("/api/restaurant/business")).json()) as ReturnType<typeof restaurantManagementData>;
  const command = async (action: string, input: unknown, requestId = randomUUID()) => { const r = await request("/api/restaurant/business", { action, input, requestId }), v = await r.json(); assert(r.ok, v.error ?? `Modifier action failed: ${action}`); return v.result.id as string; };
  const check = async (id: string) => (await read()).orders.find(o => o.id === id)!;
  const supplier = await command("supplier.save", { name: "HTTP option supplier", email: "", phone: "", active: true }), ingredient = await command("ingredient.save", { name: "HTTP option rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true });
  await command("receive", { supplierId: supplier, invoiceReference: "MOD-STOCK", date: today, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 600, cost: 600, expires: null }] });
  const extra = randomUUID(), groups = [{ id: randomUUID(), name: "Extras", min: 0, max: 1, options: [{ id: extra, name: "Extra rice", priceDelta: 200, allergens: "Kitchen-reviewed option", active: true, recipe: [{ ingredientId: ingredient, quantity: 10 }] }] }];
  const menuInput = { name: "HTTP configurable bowl", category: "Main", price: 1000, station: "Line", description: "Synthetic variant acceptance", allergens: "Kitchen-reviewed base recipe", recipe: [{ ingredientId: ingredient, quantity: 100 }], modifierGroups: groups, active: true };
  assert((await request("/api/restaurant/business", { requestId: randomUUID(), action: "menu.save", input: menuInput }, employeeCookie)).status === 403, "Restricted employee changed option pricing.");
  const menu = await command("menu.save", menuInput);
  const id = await command("order.create", { ref: "HTTP-VARIANTS", channel: "takeaway", guest: "Synthetic guest", covers: 1, reservationId: null, server: "HTTP server", note: "", lines: [{ menuId: menu, qty: 1, options: [extra] }, { menuId: menu, qty: 1, options: [] }] });
  const fired = { id, revision: (await check(id)).revision, allergensReviewed: true }, fireId = randomUUID(); await command("order.fire", fired, fireId); await command("order.fire", fired, fireId);
  const o = await check(id), kitchen = await (await request("/api/restaurant/service")).json() as RestaurantOverview, ticket = kitchen.kitchen.columns.flatMap(c => c.tickets).find(t => t.id === o.ticketId);
  assert(ticket, "The configured check did not reach the live kitchen board.");
  assert(o.total === 2420 && o.foodCost === 210 && new Set(o.lines.map(l => l.id)).size === 2 && ticket.items[0].modifiers?.includes("Extras: Extra rice"), "Variant price, stock or kitchen choices were not captured.");
  for (const status of ["cooking", "ready"]) { const r = await request("/api/restaurant/service", { action: "ticket.status", input: { id: o.ticketId, status } }); assert(r.ok, "Modifier kitchen transition failed."); }
  await command("order.serve", { id, revision: o.revision });
  const credit = { id, revision: (await check(id)).revision, reference: "HTTP-VARIANT-CREDIT", reason: "Reviewed extra-rice line correction", reviewed: true, tips: 0, lines: [{ menuId: menu, lineId: o.lines[0].id, amount: 1200 }] }, creditId = randomUUID();
  await command("credit.issue", credit, creditId); await command("credit.issue", credit, creditId);
  const rows = (await read()).financial!.checks.find(c => c.id === id)!.lines; assert(rows[0].credited === 1200 && rows[1].credited === 0, "Credit applied to the wrong variant.");
  const ambiguous = await request("/api/restaurant/business", { requestId: randomUUID(), action: "credit.issue", input: { ...credit, revision: (await check(id)).revision, reference: "HTTP-AMBIGUOUS-CREDIT", lines: [{ menuId: menu, amount: 1 }] } }); assert(ambiguous.status === 400, "Ambiguous menu-only credit was accepted.");
  await command("tender", { id, revision: (await check(id)).revision, method: "cash", amount: 1100, tip: 0, reference: "HTTP-MODIFIER-CASH", received: true }); await command("order.close", { id, revision: (await check(id)).revision });
  const slot = await command("pickup.save", { at: new Date(Date.now() + 75 * 60000).toISOString(), capacity: 2, enabled: true });
  const page = await fetch(base + "/api/website/restaurant"), html = await page.text(), hidden = (h: string, name: string) => h.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] ?? "", proof = hidden(html, "proof");
  const index = html.match(new RegExp(`name="menu\\.(\\d+)" value="${menu}"`))?.[1]; assert(index && proof && html.includes("Extra rice"), "Installed menu omitted choice controls.");
  const post = async (body: URLSearchParams) => { const r = await fetch(base + "/api/website/restaurant", { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body }), h = await r.text(); assert(r.ok, h.slice(-1400)); return h; };
  const cart = await post(new URLSearchParams({ action: "review", cartAction: "add", proof, [`menu.${index}`]: menu, [`qty.${index}`]: "1", [`options.${index}`]: extra })); assert(cart.includes("Your cart") && cart.includes("Extras: Extra rice"), "Installed cart did not retain its first variant.");
  const reviewed = await post(new URLSearchParams({ action: "review", proof, cart: hidden(cart, "cart"), [`menu.${index}`]: menu, [`qty.${index}`]: "1", slotId: slot, name: "Synthetic modifier pickup", phone: "555-0100", consent: "yes" })); assert(reviewed.includes("USD 24.20") && reviewed.includes("Extras: Extra rice"), "Online combined variant review is incorrect.");
  const body = new URLSearchParams({ action: "submit", quote: hidden(reviewed, "quote"), confirmed: "yes" }), receipt = await post(body); await post(body); assert(receipt.includes("Extras: Extra rice"), "Private receipt lost modifier instructions.");
  const token = receipt.match(/href="\/api\/website\/restaurant\?receipt=([^"]+)"/)?.[1]; assert(token, "Variant pickup receipt missing.");
  const online = (await read()).orders.filter(x => x.channel === "online" && x.lines.some(l => l.menuId === menu)); assert(online.length === 1 && online[0].lines.length === 2, "Online retry duplicated the configured check.");
  await post(new URLSearchParams({ action: "cancel", receipt: decodeURIComponent(token), confirmed: "yes" })); assert((await read()).ingredients.find(i => i.id === ingredient)?.available === 390, "Unstarted variant cancellation did not restore exact ingredients.");
  const stale = await command("order.create", { ref: "HTTP-STALE-OPTIONS", channel: "takeaway", guest: "", covers: 1, reservationId: null, server: "Fixture", note: "", lines: [{ menuId: menu, qty: 1, options: [extra] }] });
  await command("menu.save", { ...menuInput, id: menu, revision: 1, modifierGroups: [{ ...groups[0], options: [{ ...groups[0].options[0], priceDelta: 300 }] }] });
  assert((await request("/api/restaurant/business", { requestId: randomUUID(), action: "order.fire", input: { id: stale, revision: 1, allergensReviewed: true } })).status === 400, "Changed option price bypassed staff review."); await command("order.cancel", { id: stale, revision: 1, reason: "Synthetic stale review completed" });
  const current = restaurantBusinessSnapshot().orders.find(x => x.id === id)!; assert(current.lines[0].unitPrice === 1200 && current.foodCost === 210, "Cross-process read lost captured prices/costs.");
  const screen = await request("/restaurant/manage?tab=orders"), screenHtml = await screen.text(); assert(screen.ok && screenHtml.includes("HTTP-VARIANTS") && screenHtml.includes("Extras: Extra rice"), "Installed order screen omitted modifier history.");
  assert((await read()).financial!.report.items.find(i => i.name === menuInput.name)?.sales === 1000, "Menu reporting deducted a variant credit more than once.");
  console.log(JSON.stringify({ ok: true, restaurantModifiers: ["authorized option menu editing", "distinct check lines with captured prices/recipes", "stock → kitchen → sale", "specific-line credit and exact retry", "hosted cart with two versions → review → submit → private receipt", "unstarted pickup cancellation restores selected ingredients", "changed-menu rejection", "installed screen and cross-process history", "net menu reporting"] }));
  return { netSales: 1000, foodCost: 210, cash: 1100 };
}
