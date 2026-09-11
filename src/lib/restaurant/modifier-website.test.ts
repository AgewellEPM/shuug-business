// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { GET, POST } from "@/app/api/website/restaurant/route";
import { modifierFixture, modifierCommand as run } from "./modifier-fixture";
import { restaurantBusinessSnapshot as state } from "./business";
let dir: string, f: ReturnType<typeof modifierFixture>;
const base = "https://modifier.example.test", endpoint = base + "/api/website/restaurant";
const hidden = (html: string, name: string) => html.match(new RegExp(`name="${name}" value="([^"]*)"`))![1];
const post = (data: URLSearchParams, origin = base) => POST(new Request(endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: data }));
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-modifier-website-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T17:00:00Z")); f = modifierFixture(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("adds two versions to the hosted cart, removes one, reviews and submits captured options without exposing recipes", async () => {
  const html = await GET(new Request(endpoint)).text(), proof = hidden(html, "proof"); expect(html).toContain("Side · Choose 1"); expect(html).not.toMatch(/ingredientId|remainingCost|Fixture supplier/);
  const a = new URLSearchParams({ action: "review", cartAction: "add", proof, "menu.0": f.menu, "qty.0": "1", name: "Guest <script>" }); a.append("options.0", f.fries); a.append("options.0", f.extra);
  expect((await post(a, "https://foreign.test")).status).toBe(403);
  const added = await post(a), cartHtml = await added.text(); expect(added.status).toBe(200); expect(cartHtml).toContain("Your cart"); expect(cartHtml).toContain("Cheese choice: Extra cheese"); expect(cartHtml).not.toContain("Guest <script>"); expect(state().orders).toHaveLength(0);
  const b = new URLSearchParams({ action: "review", cartAction: "add", proof, cart: hidden(cartHtml, "cart"), "menu.0": f.menu, "qty.0": "1", "options.0": f.salad }); const second = await post(b), secondHtml = await second.text(); expect(second.status).toBe(200); expect(secondHtml).toContain("Remove cart item 2");
  const removed = await post(new URLSearchParams({ action: "review", cartAction: "remove.0", proof, cart: hidden(secondHtml, "cart") })), removedHtml = await removed.text(); expect(removed.status).toBe(200); expect(removedHtml).not.toContain("Remove cart item 2");
  const review = await post(new URLSearchParams({ action: "review", proof, cart: hidden(removedHtml, "cart"), slotId: f.slot, name: "Guest", phone: "555-0100", email: "", note: "", consent: "yes" })), reviewedHtml = await review.text(); expect(review.status).toBe(200); expect(reviewedHtml).toContain("Side: Salad"); expect(reviewedHtml).toContain("USD 11.55");
  const quote = hidden(reviewedHtml, "quote"), submit = new URLSearchParams({ action: "submit", quote, confirmed: "yes" }); const receipt = await post(submit); expect(receipt.status).toBe(200); expect(await receipt.text()).toContain("Side: Salad"); expect((await post(submit)).status).toBe(200); expect(state().orders).toHaveLength(1);
});
it("rejects changed option terms after checkout review and safely escapes modifier text", async () => {
  const m = state().menu[0]; m.modifierGroups![0].options[0].name = "<script>fake</script>"; run("menu.save", m);
  const html = await GET(new Request(endpoint)).text(); expect(html).toContain("&lt;script&gt;fake"); expect(html).not.toContain("<script>");
  const r = await post(new URLSearchParams({ action: "review", proof: hidden(html, "proof"), "menu.0": f.menu, "qty.0": "1", "options.0": f.fries, slotId: f.slot, name: "Guest", phone: "555-0100", consent: "yes" })), reviewed = await r.text(); expect(r.status).toBe(200); const next = state().menu[0]; next.modifierGroups![0].options[0].priceDelta = 200; run("menu.save", next);
  const response = await post(new URLSearchParams({ action: "submit", quote: hidden(reviewed, "quote"), confirmed: "yes" })); expect(response.status).toBe(400); expect(await response.text()).toContain("changed"); expect(state().orders).toHaveLength(0);
});
