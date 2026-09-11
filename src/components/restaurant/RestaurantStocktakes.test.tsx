import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { RestaurantOperations } from "./RestaurantOperations";
import { restaurantManagementData, restaurantFinanceData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
let directory: string, ingredient: string;
const run = (action: string, input: unknown) => executeRestaurantCommand({ action, input, requestId: randomUUID() }, "Fixture owner");
const counts = () => restaurantBusinessSnapshot().stocktakes ?? [];
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-count-form-`); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  run("configure", { name: "Fixture kitchen", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Supply", email: "", phone: "", active: true }).id; ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "RICE", date: restaurantManagementData(false).today, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 100, cost: 200, expires: null }] });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { try { const result = executeRestaurantCommand(JSON.parse(String(init.body)), "Fixture owner"); return { ok: true, json: async () => ({ result }) }; } catch (e) { return { ok: false, json: async () => ({ error: (e as Error).message }) }; } }
    return { ok: true, json: async () => url.includes("finance") ? restaurantFinanceData() : restaurantManagementData(true) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
async function click(label: string) { const button = await screen.findByRole("button", { name: label }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); }
it("counts, submits, and posts an adjustment using the actual inventory controls", async () => {
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="stocktakes" canEdit canManageMoney canConfigure/>);
  fireEvent.click(screen.getByText("Start a count sheet")); fireEvent.change(screen.getByLabelText("Unique count reference"), { target: { value: "UI-COUNT" } }); fireEvent.change(screen.getByLabelText("Count scope and preparation notes"), { target: { value: "Pause storage movement" } }); fireEvent.click(screen.getByLabelText("Rice · g")); await click("Start physical count");
  const quantity = await screen.findByLabelText("Actual Rice, lot RICE (g)"); expect(quantity).toHaveValue(null); expect(screen.getByRole("button", { name: "Submit count for review" })).toBeDisabled();
  fireEvent.change(quantity, { target: { value: "90" } }); fireEvent.change(screen.getByLabelText("Explanation for lot RICE"), { target: { value: "Verified lower physical stock" } }); await click("Save lot count"); await waitFor(() => expect(counts()[0].lines[0].countedQuantity).toBe(90));
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit count for review" })).toBeEnabled()); fireEvent.click(screen.getByLabelText(/I physically checked/)); await click("Submit count for review");
  fireEvent.change(await screen.findByLabelText("Inventory review evidence"), { target: { value: "Compared original receipt and second count" } }); fireEvent.click(screen.getByLabelText(/I reviewed the counts/)); await click("Post reviewed inventory adjustment");
  await waitFor(() => expect(counts()[0].status).toBe("posted")); expect(restaurantBusinessSnapshot().lots[0].remainingQuantity).toBe(90); expect(await screen.findByText(/The inventory lots and books were updated together/)).toBeInTheDocument();
});
it("retains a rejected observation, then saves its correction", async () => {
  run("stocktake.start", { reference: "REJECTED-COUNT", ingredientIds: [ingredient], note: "Fixture count" });
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="stocktakes" canEdit canManageMoney={false} canConfigure={false}/>);
  const input = screen.getByLabelText("Actual Rice, lot RICE (g)"); fireEvent.change(input, { target: { value: "80" } }); await click("Save lot count"); expect(await screen.findByRole("status")).toHaveTextContent("Explain the quantity difference"); expect(input).toHaveValue(80);
  fireEvent.change(screen.getByLabelText("Explanation for lot RICE"), { target: { value: "Rechecked shelf" } }); await click("Save lot count"); await waitFor(() => expect(counts()[0].lines[0].countedQuantity).toBe(80));
});
it("lets a finance-only reviewer return a count without opening operational forms", async () => {
  const id = run("stocktake.start", { reference: "FINANCE-COUNT", ingredientIds: [ingredient], note: "Fixture count" }).id;
  run("stocktake.record", { id, revision: 1, lineId: counts()[0].lines[0].id, quantity: 90, reason: "Physical shortage" }); run("stocktake.submit", { id, revision: 2, confirmed: true });
  render(<RestaurantOperations initial={restaurantFinanceData()} initialTab="stocktakes" canEdit={false} canManageMoney canConfigure={false} allowedTabs={["money", "reports", "stocktakes"]} readEndpoint="/api/restaurant/finance"/>);
  expect(screen.queryByText("Start a count sheet")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Save lot count" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Return for correction")); fireEvent.change(screen.getByLabelText("Correction required"), { target: { value: "Check unopened bag" } }); await click("Return count to staff"); await waitFor(() => expect(counts()[0].status).toBe("counting"));
});
it("flags stale counts and offers a real recount that selects the fresh sheet", async () => {
  run("stocktake.start", { reference: "STALE-COUNT", ingredientIds: [ingredient], note: "Fixture count" }); run("waste", { ingredientId: ingredient, quantity: 10, date: restaurantManagementData(false).today, reason: "Fixture waste", includeExpired: false });
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="stocktakes" canEdit canManageMoney={false} canConfigure={false}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Start a recount"); expect(screen.queryByRole("button", { name: "Save lot count" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Recount or cancel this sheet")); fireEvent.change(screen.getByLabelText("New recount reference"), { target: { value: "FRESH-COUNT" } }); fireEvent.change(screen.getByLabelText("Why a recount is needed"), { target: { value: "Stock moved during counting" } }); await click("Start fresh recount");
  await waitFor(() => expect(counts()).toHaveLength(2)); expect(await screen.findByRole("heading", { name: "FRESH-COUNT · counting" })).toBeInTheDocument(); expect(screen.getByLabelText("Actual Rice, lot RICE (g)")).toHaveValue(null);
});
