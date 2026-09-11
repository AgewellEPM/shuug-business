import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { RestaurantOperations } from "./RestaurantOperations";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
let directory: string, raw: string, output: string, loseStartResponse: boolean;
const run = (action: string, input: unknown) => executeRestaurantCommand({ action, input, requestId: randomUUID() }, "Fixture cook");
const state = () => restaurantBusinessSnapshot();
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-prep-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); loseStartResponse = false;
  run("configure", { name: "Fixture kitchen", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Prep supplier", email: "", phone: "", active: true }).id;
  const ingredient = (name: string) => run("ingredient.save", { name, unit: "g", reorderAt: 0, targetStock: 1000, supplierId: null, active: true }).id;
  raw = ingredient("Tomatoes"); output = ingredient("Sauce");
  run("receive", { supplierId: supplier, invoiceReference: "PREP-RAW", date: restaurantManagementData(false).today, purchaseId: null, lines: [{ ingredientId: raw, quantity: 1000, cost: 200, expires: null }] });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const parsed = JSON.parse(String(init.body));
      try { const result = executeRestaurantCommand(parsed, "Fixture cook");
        if (loseStartResponse && parsed.action === "prep.start") { loseStartResponse = false; throw new Error("Connection lost after saving. Retry to confirm."); }
        return { ok: true, json: async () => ({ result }) };
      } catch (e) { return { ok: false, json: async () => ({ error: (e as Error).message }) }; }
    }
    return { ok: true, json: async () => restaurantManagementData(true) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { force: true, recursive: true }); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function click(label: string) { const button = screen.getByRole("button", { name: label }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); }
function recipe() { return run("prep.recipe.save", { name: "House sauce", outputIngredientId: output, expectedQuantity: 400, inputs: [{ ingredientId: raw, quantity: 500 }], instructions: "Fixture prep", active: true }).id; }
it("creates a recipe, starts measured prep, and completes the batch through the real controls", async () => {
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="prep" canEdit canManageMoney canConfigure/>);
  fireEvent.click(screen.getByText("Create a prep recipe")); change("Prep recipe name", "House sauce"); change("Prepared output ingredient", output); change("Expected output per batch (g)", "400"); change("Input ingredient 1", raw); change("Input quantity 1", "500");
  await click("Create prep recipe"); await waitFor(() => expect(state().prepRecipes).toHaveLength(1));
  change("Prep recipe", state().prepRecipes![0].id); change("Unique batch reference", "UI-SAUCE"); change("Actual Tomatoes used (g)", "450"); change("Batch start evidence", "Measured 450 grams on scale"); fireEvent.click(screen.getByLabelText(/I checked the measured inputs/));
  await click("Start batch and use ingredients");
  await screen.findByLabelText("Measured output for UI-SAUCE (g)");
  change("Measured output for UI-SAUCE (g)", "320"); change("Reviewed use-by date for UI-SAUCE", "2099-01-01"); change("Result evidence for UI-SAUCE", "Measured output and release reviewed"); fireEvent.click(screen.getByLabelText(/I verified the measured yield/));
  await click("Complete batch and receive prepared stock"); await waitFor(() => expect(state().prepBatches![0].status).toBe("completed"));
  expect(screen.getByText(/80.0% of planned output/)).toBeInTheDocument(); expect(state().lots.find(l => l.prepBatchId)?.receivedCost).toBe(90); expect(state().bills).toHaveLength(1);
});
it("preserves measured input and the original request after a lost response, without repeating stock use", async () => {
  const recipeId = recipe(); render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="prep" canEdit canManageMoney={false} canConfigure={false}/>);
  change("Prep recipe", recipeId); change("Unique batch reference", "RETRY-SAUCE"); change("Actual Tomatoes used (g)", "475"); change("Batch start evidence", "Weighed actual input"); fireEvent.click(screen.getByLabelText(/I checked the measured inputs/));
  loseStartResponse = true; await click("Start batch and use ingredients"); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connection lost"));
  expect(screen.getByLabelText("Actual Tomatoes used (g)")).toHaveValue(475); await click("Start batch and use ingredients");
  await screen.findByText("RETRY-SAUCE · House sauce"); expect(state().prepBatches).toHaveLength(1); expect(state().lots[0].remainingQuantity).toBe(525);
  const calls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.body && JSON.parse(String(init.body)).action === "prep.start");
  expect(calls).toHaveLength(2); expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
});
it("requires reviewed disposal and keeps all mutation controls disabled for viewers", async () => {
  const recipeId = recipe(); run("prep.start", { recipeId, recipeRevision: 1, batches: 1, reference: "SPILLED", inputs: [{ ingredientId: raw, quantity: 500 }], evidence: "Actual inputs", reviewed: true });
  const view = render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="prep" canEdit={false} canManageMoney={false} canConfigure={false}/>);
  expect(screen.getByRole("button", { name: "Create prep recipe" })).toBeDisabled(); expect(screen.getByLabelText("Result for SPILLED")).toBeDisabled(); view.unmount();
  render(<RestaurantOperations initial={restaurantManagementData(true)} initialTab="prep" canEdit canManageMoney={false} canConfigure={false}/>);
  change("Result for SPILLED", "discard"); change("Result evidence for SPILLED", "Entire batch spilled"); fireEvent.click(screen.getByLabelText(/I verified the whole-batch disposal/)); await click("Record discarded batch");
  await waitFor(() => expect(state().prepBatches![0].status).toBe("discarded")); expect(state().lots.filter(l => l.prepBatchId)).toHaveLength(0);
});
