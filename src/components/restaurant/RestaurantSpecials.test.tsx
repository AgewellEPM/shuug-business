import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { RestaurantSpecials } from "./RestaurantSpecials";
import { specialManagementData } from "@/lib/restaurant/special-management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
let directory: string;
const run = (action: string, input: unknown) => executeRestaurantCommand({ action, input, requestId: randomUUID() }, "Fixture owner");
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-special-form-`); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  run("configure", { name: "Fixture kitchen", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Supply", email: "", phone: "", active: true }).id, ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "RICE", date: specialManagementData().today, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 1000, cost: 1000, expires: null }] });
  run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "Rice bowl", allergens: "Reviewed", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { const result = executeRestaurantCommand(JSON.parse(String(init.body)), "Fixture owner"); return { ok: true, json: async () => ({ result }) }; } return { ok: true, json: async () => specialManagementData(true) }; }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("creates a reviewed draft, publishes the offer, and pauses new redemptions from real controls", async () => {
  render(<RestaurantSpecials initial={specialManagementData(true)} canEdit canPublish canRecordSpend/>);
  fireEvent.change(screen.getByLabelText("Offer name"), { target: { value: "Weekday bowls" } }); fireEvent.change(screen.getByLabelText("Unique special code"), { target: { value: "BOWLS10" } }); fireEvent.change(screen.getByLabelText("Guest offer description"), { target: { value: "Ten percent off selected rice bowls." } }); fireEvent.click(screen.getByLabelText("Monday")); fireEvent.click(screen.getByLabelText(/Rice bowl · Menu/)); fireEvent.click(screen.getByRole("button", { name: "Save draft special" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().specials?.[0].status).toBe("draft")); const publish = await screen.findByRole("button", { name: "Publish reviewed special" }); await waitFor(() => expect(publish).toBeEnabled()); fireEvent.click(screen.getByLabelText(/I reviewed the eligible menu/)); fireEvent.click(publish);
  await waitFor(() => expect(restaurantBusinessSnapshot().specials?.[0].status).toBe("active")); expect(await screen.findByLabelText("Website offer path")).toHaveValue("/api/website/restaurant?special=BOWLS10"); expect(screen.getByLabelText("WordPress special shortcode")).toHaveValue('[shuug_restaurant_ordering special="BOWLS10"]'); const pause = await screen.findByRole("button", { name: "Pause new redemptions" }); await waitFor(() => expect(pause).toBeEnabled()); fireEvent.click(pause); await waitFor(() => expect(restaurantBusinessSnapshot().specials?.[0].status).toBe("paused"));
});
it("disables campaign editing for read-only marketing access", () => { render(<RestaurantSpecials initial={specialManagementData()} canEdit={false} canPublish={false} canRecordSpend={false}/>); expect(screen.getByRole("button", { name: "Save draft special" })).toBeDisabled(); });
