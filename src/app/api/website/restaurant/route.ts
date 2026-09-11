import { z } from "zod";
import { escapeHtml, readAuthForm } from "@/lib/auth/forms";
import { appBaseUrl } from "@/lib/connections/vault";
import { restaurantPublicPage } from "@/lib/restaurant/public-page";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { restaurantCartLines, updateRestaurantCart, restaurantStorefront, restaurantMenuProof, reviewRestaurantPickup, submitRestaurantPickup, restaurantPickupStatus, cancelRestaurantPickup } from "@/lib/restaurant/website";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const e = escapeHtml, amount = (v: number) => `USD ${(v / 100).toFixed(2)}`, action = "/api/website/restaurant";
const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${e(value)}">`;
function time(value: string, timezone: string) { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function page(content: string, status = 200) { return restaurantPublicPage("Pickup ordering", restaurantStorefront(), content, status); }
function receipt(token: string) {
  const order = restaurantPickupStatus(token), site = restaurantStorefront();
  return page(`<h2>${e(order.status)}</h2><p>Order ${e(order.ref)}${order.pickup ? ` · Pickup ${e(time(order.pickup, site.timezone))} (${e(site.timezone)})` : ""}</p><ul>${order.lines.map(l => `<li>${l.qty} × ${e(l.name)}${l.options.length ? ` · ${e(l.options.join("; "))}` : ""} — ${amount(l.subtotal)}</li>`).join("")}</ul>${order.special ? `<p>Special ${e(order.special.name)} (${e(order.special.code)}) · Discount ${amount(order.discount)} from menu total ${amount(order.listSubtotal)}</p>` : ""}<p>Food ${amount(order.subtotal)} · Tax ${amount(order.tax)}<br><strong>Total ${amount(order.total)}</strong> · Paid ${amount(order.paid)}</p><p>${e(site.instructions)}</p><p>Credits recorded ${amount(order.balance.credited)} · Refunds recorded ${amount(order.balance.refunded)}<br><strong>Amount still due ${amount(order.balance.due)} · Refund owed to you ${amount(order.balance.refundDue)}</strong></p><p>${order.balance.due ? "Pay the remaining balance at pickup. " : ""}${order.balance.refundDue ? "Contact the restaurant about your pending refund. " : ""}Keep this private link to follow your order.</p><p><a href="${action}?receipt=${encodeURIComponent(token)}">Refresh order status</a></p>${order.canCancel ? `<form method="post" action="${action}">${hidden("action", "cancel")}${hidden("receipt", token)}<label><input type="checkbox" name="confirmed" value="yes" required> Cancel this order before preparation starts.</label><button>Cancel my pickup order</button></form>` : ""}<p><a href="${action}">Restaurant menu</a></p>`);
}
function menuPage(proof: string, cart = "", fields = new URLSearchParams()) {
  const site = restaurantStorefront();
  if (!site.accepting) return page("<h2>Online pickup ordering is closed</h2><p>Contact the restaurant to place an order.</p>");
  const lines = restaurantCartLines(proof, cart);
  const cartContent = lines.length ? `<section><h2>Your cart</h2><ul>${lines.map((l, i) => { const item = site.menu.find(m => m.id === l.menuId), names = l.options.map(id => item?.modifierGroups.flatMap(g => g.options.map(o => ({ ...o, group: g.name }))).find(o => o.id === id)).map(o => o ? `${o.group}: ${o.name}` : "Unavailable choice"); return `<li>${l.qty} × ${e(item?.name ?? "Unavailable menu item")}${names.length ? ` · ${e(names.join("; "))}` : ""}<button name="cartAction" value="remove.${i}" formnovalidate>Remove cart item ${i + 1}</button></li>`; }).join("")}</ul></section>` : "";
    return page(`<h2>Order for pickup</h2><p>${e(site.instructions)}</p><p>Choose your food and options, review the total, then place your order. Payment is collected at pickup.</p><form method="post" action="${action}">${hidden("action", "review")}${hidden("proof", proof)}${hidden("cart", cart)}${cartContent}${site.menu.slice(0, 100).map((m, i) => `<article><h2>${e(m.name)} · ${amount(m.price)}</h2><p>${e(m.description)}</p><p>Allergen information: ${e(m.allergens)}</p>${hidden(`menu.${i}`, m.id)}${m.modifierGroups.map(g => `<fieldset><legend>${e(g.name)} · Choose ${g.min === g.max ? g.min : `${g.min}–${g.max}`} for each ordered portion</legend>${g.options.map(o => `<label><input type="checkbox" name="options.${i}" value="${o.id}"> ${e(o.name)} · ${o.priceDelta < 0 ? "−" : "+"}${amount(Math.abs(o.priceDelta))}<br>${e(o.allergens)}</label>`).join("")}</fieldset>`).join("")}<label>Quantity of ${e(m.name)}<input type="number" name="qty.${i}" min="0" max="${m.available}" value="0"></label></article>`).join("")}<button type="submit" name="cartAction" value="add" formnovalidate>Add selected items and keep shopping</button><p>To order the same item with different choices, add one version, then choose and add the next. Stock and prices are confirmed at review and when placing the order.</p><label>Pickup time (${e(site.timezone)})<select name="slotId" required>${site.slots.map(s => `<option value="${s.id}"${fields.get("slotId") === s.id ? " selected" : ""}>${e(time(s.at, site.timezone))}</option>`).join("")}</select></label><label>Special code (optional)<input name="specialCode" maxlength="30" value="${e(fields.get("specialCode") ?? "")}"></label>${site.specials.length ? `<p>Available specials: ${site.specials.map(s => `${e(s.code)} — ${e(s.name)} (${s.discountBasisPoints / 100}% off eligible menu items)`).join("; ")}. Limits apply; the review shows the accepted discount.</p>` : ""}<label>Your name<input name="name" value="${e(fields.get("name") ?? "")}" autocomplete="name" maxlength="100" required></label><label>Phone for this order<input name="phone" value="${e(fields.get("phone") ?? "")}" type="tel" autocomplete="tel" minlength="5" maxlength="40" required></label><label>Email (optional)<input name="email" value="${e(fields.get("email") ?? "")}" type="email" autocomplete="email" maxlength="160"></label><label>Dietary needs or pickup notes<textarea name="note" maxlength="200">${e(fields.get("note") ?? "")}</textarea></label><label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label><input type="checkbox" name="consent" value="yes" required> I reviewed the menu allergen information and agree to share these details with the restaurant for this order.</label><p>The kitchen reviews dietary notes before preparing online orders. Contact the restaurant if you need clarification before ordering.</p><button>Review pickup order</button></form>`);
}
export function GET(request: Request) {
  if (!rateLimit(clientKey(request, "restaurant-menu"), 120).allowed) return page("<p>Too many requests. Try again shortly.</p>", 429);
  try {
    const search = new URL(request.url).searchParams, requestedSpecial = (search.get("special") ?? "").slice(0, 30);
    const token = search.get("receipt"); if (token) return receipt(token);
    const site = restaurantStorefront(); if (!site.accepting) return page("<h2>Online pickup ordering is closed</h2><p>Contact the restaurant to place an order.</p>");
    if (!site.slots.length || !site.menu.length) return page("<h2>No pickup times are available right now</h2><p>Please check again later or contact the restaurant.</p>");
    return menuPage(restaurantMenuProof(), "", new URLSearchParams({ specialCode: requestedSpecial }));
  } catch { return page("<h2>Order link unavailable</h2><p>Open the private receipt link issued with your order, or contact the restaurant.</p>", 400); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return page("<p>Request origin not permitted.</p>", 403);
  if (!rateLimit(clientKey(request, "restaurant-checkout"), 30).allowed) return page("<p>Too many requests. Try again shortly.</p>", 429);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the pickup order form.");
    const f = await readAuthForm(request, 100000); if (f.get("website")) throw new Error("Reload the menu to place an order.");
    const chosenLines = () => Array.from({ length: 100 }, (_, i) => ({ menuId: f.get(`menu.${i}`), qty: Number(f.get(`qty.${i}`) ?? 0), options: f.getAll(`options.${i}`) })).filter(l => l.qty !== 0);
    if (f.has("cartAction")) {
      const value = f.get("cartAction")!, remove = value.startsWith("remove.") ? Number(value.slice(7)) : undefined;
      if (value !== "add" && !/^remove\.\d+$/.test(value)) throw new Error("Choose a cart action.");
      const proof = f.get("proof") ?? "", cart = updateRestaurantCart(proof, f.get("cart") ?? "", remove === undefined ? chosenLines() : [], remove);
      return menuPage(proof, cart, f);
    }
    if (f.get("action") === "review") {
      const proof = f.get("proof") ?? "", cart = updateRestaurantCart(proof, f.get("cart") ?? "", chosenLines());
      const lines = restaurantCartLines(proof, cart);
      const r = reviewRestaurantPickup(f.get("proof") ?? "", { specialCode: f.get("specialCode") ?? "", slotId: f.get("slotId"), name: f.get("name"), phone: f.get("phone"), email: f.get("email") ?? "", note: f.get("note") ?? "", consent: f.get("consent") === "yes", lines }), site = restaurantStorefront();
      return page(`<h2>Review your pickup order</h2><p>${e(r.input.name)} · Pickup ${e(time(r.slot.at, site.timezone))}</p><ul>${r.items.map(l => `<li>${l.qty} × ${e(l.name)}${l.options.length ? ` · ${e(l.options.join("; "))}` : ""} — ${amount(l.subtotal)}<br>Allergens: ${e(l.allergens)}</li>`).join("")}</ul><p>Notes: ${e(r.input.note || "None")}</p>${r.special ? `<p>Special ${e(r.special.name)} (${e(r.special.code)}) · Discount ${amount(r.discount)} from menu total ${amount(r.listSubtotal)}</p>` : ""}<p>Food ${amount(r.subtotal)} · Tax ${amount(r.tax)}<br><strong>Total due at pickup ${amount(r.total)}</strong></p><p>Your items and pickup time are allocated when you place the order. No card is charged by this form.</p><form method="post" action="${action}">${hidden("action", "submit")}${hidden("quote", r.quote)}<label><input type="checkbox" name="confirmed" value="yes" required> I confirm the items, pickup time and total, and will pay at pickup.</label><button>Place pickup order</button></form><p><a href="${action}">Start again to change the order</a></p>`);
    }
    if (f.get("confirmed") !== "yes") throw new Error("Confirm the action before continuing.");
    if (f.get("action") === "submit") return receipt(submitRestaurantPickup(f.get("quote") ?? ""));
    if (f.get("action") === "cancel") { const token = f.get("receipt") ?? ""; cancelRestaurantPickup(token); return receipt(token); }
    throw new Error("Choose a pickup order action.");
  } catch (error) { return page(`<h2>Could not complete the order</h2><p>${e(error instanceof z.ZodError ? "Check your order quantities, menu choices, name, phone, pickup time and consent." : error instanceof Error ? error.message : "Please try again.")}</p><p><a href="${action}">Return to the restaurant menu</a></p>`, 400); }
}
