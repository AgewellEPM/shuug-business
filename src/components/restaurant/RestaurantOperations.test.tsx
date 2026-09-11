import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { RestaurantOperations } from "./RestaurantOperations";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
let directory: string;
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-restaurant-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { executeRestaurantCommand(JSON.parse(String(init.body)), "UI fixture owner"); return { ok: true, json: async () => ({ ok: true }) }; } return { ok: true, json: async () => restaurantManagementData(true) }; })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("saves restaurant configuration and supplier/ingredient forms through real commands", async () => {
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="settings" canEdit canManageMoney canConfigure/>);
  fireEvent.change(screen.getByLabelText("Restaurant name"), { target: { value: "Local Kitchen" } }); fireEvent.change(screen.getByLabelText("IANA timezone"), { target: { value: "America/New_York" } }); fireEvent.click(screen.getByLabelText(/I reviewed these settings/)); fireEvent.click(screen.getByRole("button", { name: "Save restaurant settings" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().config.name).toBe("Local Kitchen"));
  fireEvent.click(screen.getByRole("button", { name: "Suppliers & purchasing" })); fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "Fresh Supply" } }); fireEvent.click(screen.getByRole("button", { name: "Add supplier" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().suppliers).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Ingredients & waste" })); const ingredient = within(screen.getByRole("heading", { name: "Add ingredient" }).closest("section")!);
  fireEvent.change(ingredient.getByLabelText("Ingredient name"), { target: { value: "Rice" } }); fireEvent.change(ingredient.getByLabelText("Preferred supplier"), { target: { value: restaurantBusinessSnapshot().suppliers[0].id } }); fireEvent.click(ingredient.getByRole("button", { name: "Add ingredient" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().ingredients[0].name).toBe("Rice")); expect(restaurantBusinessSnapshot().ingredients[0].supplierId).toBe(restaurantBusinessSnapshot().suppliers[0].id);
});
it("hides financial areas and disables mutations for a read-only operations user", () => {
  render(<RestaurantOperations initial={restaurantManagementData(false)} initialTab="orders" canEdit={false} canManageMoney={false} canConfigure={false}/>);
  expect(screen.queryByRole("button", { name: "Payments & daily close" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Create check for review" })).toBeDisabled();
});
it("keeps the original request identifier when a staff member retries after an interrupted response", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { const body = JSON.parse(String(init.body)); calls.push(body.requestId); executeRestaurantCommand(body, "UI fixture owner"); if (calls.length === 1) throw new Error("Synthetic response interrupted"); return { ok: true, json: async () => ({ ok: true }) }; } return { ok: true, json: async () => restaurantManagementData(true) }; }));
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="purchasing" canEdit canManageMoney canConfigure/>);
  fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "One supplier" } }); fireEvent.click(screen.getByRole("button", { name: "Add supplier" })); await screen.findByText("Synthetic response interrupted"); fireEvent.click(screen.getByRole("button", { name: "Add supplier" }));
  await waitFor(() => expect(calls).toHaveLength(2)); expect(calls[0]).toBe(calls[1]); expect(restaurantBusinessSnapshot().suppliers).toHaveLength(1);
});
