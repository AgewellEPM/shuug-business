import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { RestaurantOperations } from "./RestaurantOperations";
import { modifierFixture, modifierCommand as run } from "@/lib/restaurant/modifier-fixture";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
import { advanceTicket, restaurantState } from "@/lib/restaurant/store";
let dir: string, f: ReturnType<typeof modifierFixture>;
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-modifier-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", dir);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T17:00:00Z")); f = modifierFixture();
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      try { executeRestaurantCommand(JSON.parse(String(init.body)), "UI fixture"); return Response.json({ ok: true }); }
      catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    }
    return Response.json(restaurantManagementData(true));
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("creates differently configured check lines with actual form controls and sends their choices to the kitchen", async () => {
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="orders" canEdit canManageMoney canConfigure/>);
  fireEvent.change(screen.getByLabelText("Check reference"), { target: { value: "UI-VARIANTS" } }); fireEvent.change(screen.getByLabelText("Responsible server"), { target: { value: "Fixture server" } });
  fireEvent.change(screen.getByLabelText("Menu item"), { target: { value: f.menu } }); fireEvent.click(screen.getByLabelText(/Fries/)); fireEvent.click(screen.getByLabelText(/Extra cheese/)); fireEvent.click(screen.getByRole("button", { name: "Add menu item" }));
  fireEvent.change(screen.getAllByLabelText("Menu item")[1], { target: { value: f.menu } }); fireEvent.click(screen.getAllByLabelText(/Salad/)[1]); fireEvent.click(screen.getByRole("button", { name: "Create check for review" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().orders).toHaveLength(1)); await screen.findByText(/Total/);
  const o = restaurantBusinessSnapshot().orders[0]; expect(o.lines.map(l => l.unitPrice)).toEqual([1200, 1050]);
  fireEvent.click(screen.getByLabelText(/I reviewed the guest/)); fireEvent.click(screen.getByRole("button", { name: "Send order to kitchen" }));
  await waitFor(() => expect(restaurantState.read().tickets[0].items[0].modifiers).toContain("Cheese choice: Extra cheese"));
});
it("edits and persists option pricing and signed ingredient adjustments through the real menu form", async () => {
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="menu" canEdit canManageMoney canConfigure/>);
  const article = screen.getByRole("heading", { name: /Burger ·/ }).closest("article")!, form = within(article);
  fireEvent.click(form.getByText("Edit item and recipe")); const prices = form.getAllByLabelText("Price adjustment per portion (USD)"); fireEvent.change(prices[2], { target: { value: "3.50" } });
  const adjustments = form.getAllByLabelText("Base-unit adjustment per portion"); fireEvent.change(adjustments[2], { target: { value: "15" } }); fireEvent.click(form.getByRole("button", { name: "Save menu revision" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().menu[0].revision).toBe(2)); expect(restaurantBusinessSnapshot().menu[0].modifierGroups![1].options[0]).toMatchObject({ priceDelta: 350, recipe: [{ quantity: 15 }] });
});
it("disables menu option changes for read-only operations users", () => {
  render(<RestaurantOperations initial={restaurantManagementData(false)} initialTab="menu" canEdit={false} canManageMoney={false} canConfigure={false}/>);
  expect(screen.getAllByRole("button", { name: "Add option group", hidden: true }).every(b => (b as HTMLButtonElement).closest("fieldset")!.disabled)).toBe(true);
  expect(screen.getByRole("button", { name: "Add menu item" })).toBeDisabled();
});
it("credits one configured item using its distinct field in the actual credit form", async () => {
  const id = run("order.create", { ref: "UI-CREDIT", channel: "takeaway", guest: "", covers: 1, reservationId: null, server: "Fixture", note: "", lines: [{ menuId: f.menu, qty: 1, options: [f.fries] }, { menuId: f.menu, qty: 1, options: [f.salad] }] }).id;
  let o = restaurantBusinessSnapshot().orders.find(o => o.id === id)!;
  run("order.fire", { id, revision: o.revision, allergensReviewed: true }); o = restaurantBusinessSnapshot().orders.find(o => o.id === id)!;
  advanceTicket(o.ticketId!, "cooking"); advanceTicket(o.ticketId!, "ready"); run("order.serve", { id, revision: o.revision });
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="credits" canEdit canManageMoney canConfigure/>);
  fireEvent.click(screen.getByText("Issue a reviewed credit"));
  fireEvent.change(screen.getByLabelText(/Credit for Burger \(Side: Salad\)/), { target: { value: "10.50" } });
  fireEvent.change(screen.getByLabelText("Unique credit reference"), { target: { value: "UI-LINE-CREDIT" } });
  fireEvent.change(screen.getByLabelText("Reason and review evidence"), { target: { value: "Reviewed salad burger issue" } });
  fireEvent.click(screen.getByLabelText(/I reviewed the original sale/)); fireEvent.click(screen.getByRole("button", { name: "Issue reviewed credit" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().credits).toHaveLength(1));
  expect(restaurantBusinessSnapshot().credits![0].lines[0].lineId).toBe(o.lines[1].id);
  expect(restaurantManagementData(true).financial!.checks[0].lines.map(l => l.credited)).toEqual([0, 1050]);
});
