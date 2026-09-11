import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { RestaurantOperations } from "./RestaurantOperations";
import { restaurantManagementData, restaurantFinanceData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
import { advanceTicket } from "@/lib/restaurant/store";
let directory: string, id: string;
const run = (action: string, input: unknown) => executeRestaurantCommand({ action, input, requestId: randomUUID() }, "Fixture accountant");
const state = restaurantBusinessSnapshot, order = () => state().orders.find(o => o.id === id)!;
function serve() { advanceTicket(order().ticketId!, "cooking"); advanceTicket(order().ticketId!, "ready"); run("order.serve", { id, revision: order().revision }); }
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-credit-form-`); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  run("configure", { name: "Fixture kitchen", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 1000, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Supply", email: "", phone: "", active: true }).id, ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "RICE", date: restaurantManagementData(false).today, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 1000, cost: 1000, expires: null }] });
  const menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "", allergens: "Reviewed", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true }).id;
  id = run("order.create", { ref: "UI-CHECK", channel: "takeaway", guest: "", covers: 1, reservationId: null, server: "Counter", note: "", lines: [{ menuId: menu, qty: 1 }] }).id; run("order.fire", { id, revision: 1, allergensReviewed: true });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { try { const result = executeRestaurantCommand(JSON.parse(String(init.body)), "Fixture accountant"); return { ok: true, json: async () => ({ result }) }; } catch (e) { return { ok: false, json: async () => ({ error: (e as Error).message }) }; } } return { ok: true, json: async () => restaurantFinanceData() }; }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const view = (edit = true) => render(<RestaurantOperations initial={restaurantFinanceData()} initialTab="credits" canEdit={false} canManageMoney={edit} canConfigure={false} allowedTabs={["money", "reports", "credits"]} readEndpoint="/api/restaurant/finance"/>);
async function click(label: string) { const button = await screen.findByRole("button", { name: label }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); }
it("issues a reviewed partial credit then records the actual refund from the original payment", async () => {
  serve(); run("tender", { id, revision: order().revision, amount: 1100, tip: 0, method: "cash", reference: "UI-RECEIPT", received: true }); run("order.close", { id, revision: order().revision }); view();
  fireEvent.click(screen.getByText("Issue a reviewed credit")); fireEvent.change(screen.getByLabelText(/Credit for Rice bowl/), { target: { value: "4.00" } }); fireEvent.change(screen.getByLabelText("Unique credit reference"), { target: { value: "UI-CREDIT" } }); fireEvent.change(screen.getByLabelText("Reason and review evidence"), { target: { value: "Reviewed service problem" } }); expect(screen.getByText(/Review: food/)).toHaveTextContent("add $4.40 to the refund owed"); fireEvent.click(screen.getByLabelText(/I reviewed the original sale/)); await click("Issue reviewed credit");
  await waitFor(() => expect(state().credits).toHaveLength(1)); const input = await screen.findByLabelText("Verified refund amount (USD)"); expect(input).toHaveValue(4.4); expect(screen.getByLabelText("Original payment to refund")).toHaveTextContent("UI-RECEIPT");
  fireEvent.change(screen.getByLabelText("Unique refund receipt or processor reference"), { target: { value: "UI-REFUND" } }); fireEvent.change(screen.getByLabelText("Refund payment evidence"), { target: { value: "Guest received cash and signed receipt" } }); fireEvent.click(screen.getByLabelText(/I verified the money has been returned/)); await click("Record verified refund");
  await waitFor(() => expect(state().refunds).toHaveLength(1)); expect(await screen.findByText(/Restaurant owes guest \$0.00/)).toBeInTheDocument(); expect(state().refunds![0].amount).toBe(440); expect(state().orders[0].paid).toBe(1100);
});
it("cancels a paid kitchen check and records a real deposit refund", async () => {
  run("tender", { id, revision: order().revision, amount: 500, tip: 0, method: "cash", reference: "DEPOSIT", received: true }); view();
  fireEvent.click(screen.getByText("Cancel this unserved paid check")); fireEvent.change(screen.getByLabelText("Cancellation credit reference"), { target: { value: "CANCEL-1" } }); fireEvent.change(screen.getByLabelText("Paid cancellation reason"), { target: { value: "Guest changed plans before cooking" } }); fireEvent.click(screen.getByLabelText(/I reviewed the cancellation with the kitchen/)); await click("Cancel and record refund owed");
  await waitFor(() => expect(order().status).toBe("cancelled")); expect(await screen.findByLabelText("Verified refund amount (USD)")).toHaveValue(5); expect(state().lots[0].remainingQuantity).toBe(1000);
});
it("retains an attempted credit after duplicate-reference rejection and allows correcting it", async () => {
  serve(); run("credit.issue", { id, revision: order().revision, reference: "EXISTING", lines: [{ menuId: order().lines[0].menuId, amount: 100 }], tips: 0, reason: "First approved correction", reviewed: true }); view();
  fireEvent.click(screen.getByText("Issue a reviewed credit")); const input = screen.getByLabelText(/Credit for Rice bowl/); fireEvent.change(input, { target: { value: "2.00" } }); fireEvent.change(screen.getByLabelText("Unique credit reference"), { target: { value: "EXISTING" } }); fireEvent.change(screen.getByLabelText("Reason and review evidence"), { target: { value: "Further reviewed correction" } }); fireEvent.click(screen.getByLabelText(/I reviewed the original sale/)); await click("Issue reviewed credit");
  expect(await screen.findByText("Use a unique restaurant credit reference.")).toBeInTheDocument(); expect(input).toHaveValue(2); fireEvent.change(screen.getByLabelText("Unique credit reference"), { target: { value: "CORRECTED" } }); await click("Issue reviewed credit"); await waitFor(() => expect(state().credits).toHaveLength(2));
});
it("disables credit entry and refund recording for read-only Money access", () => {
  serve(); run("tender", { id, revision: order().revision, amount: 1100, tip: 0, method: "cash", reference: "READ-ONLY", received: true }); run("credit.issue", { id, revision: order().revision, reference: "READ-CREDIT", lines: [{ menuId: order().lines[0].menuId, amount: 100 }], tips: 0, reason: "Reviewed correction", reviewed: true }); view(false);
  fireEvent.click(screen.getByText("Issue a reviewed credit")); expect(screen.getByLabelText(/Credit for Rice bowl/)).toBeDisabled(); expect(screen.getByRole("button", { name: "Record verified refund" })).toBeDisabled();
});
