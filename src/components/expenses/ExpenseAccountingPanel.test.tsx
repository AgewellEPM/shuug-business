import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ExpensesWorkspace } from "./ExpensesWorkspace";
import { blankExpense } from "@/lib/expenses/model";
import { listExpenses, readExpense, saveExpense } from "@/lib/expenses/store";
import { expenseAccountingData, executeExpenseAccountingCommand } from "@/lib/expenses/accounting";
import { expenseOutstanding } from "@/lib/expenses/accounting-model";
import { chartOfAccounts } from "@/lib/accounting/journal-store";
vi.mock("../WorkspaceShell", () => ({ useSalesChannel: () => ({ channel: "all" }) }));
vi.mock("@/app/expenses/actions", async () => {
  const store = await import("@/lib/expenses/store");
  return { saveExpenseAction: vi.fn(), refreshExpensesAction: async () => store.listExpenses(), archiveExpenseAction: async (id: string, revision: number, restore: boolean) => ({ ok: true, expense: store.archiveExpense(id, revision, restore, "Fixture owner") }) };
});
let directory: string, id: string, loseResponse: boolean;
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-expense-form-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); loseResponse = false;
  id = saveExpense({ status: "recorded", fields: { ...blankExpense("2026-09-10"), merchant: "Fixture subscription", amountCents: 10000, paymentStatus: "unpaid" } }).expense!.id;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    try { const result = executeExpenseAccountingCommand(JSON.parse(String(init?.body)), "Fixture owner", "2026-09-20");
      if (loseResponse) { loseResponse = false; throw new Error("Connection lost after posting; retry to confirm."); }
      return { ok: true, json: async () => ({ result, expense: readExpense(result.id) }) };
    } catch (e) { return { ok: false, json: async () => ({ error: (e as Error).message }) }; }
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function open(canEdit = true) { render(<ExpensesWorkspace initial={listExpenses()} today="2026-09-20" canEdit={canEdit} accounts={chartOfAccounts().accounts}/>); fireEvent.click(screen.getByRole("button", { name: "Fixture subscription" })); }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const review = () => fireEvent.click(screen.getByLabelText("I reviewed these accounts, amounts, dates and supporting evidence."));
async function click(label: string) { const button = screen.getByRole("button", { name: label }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); }
async function post() { change("Accounting review evidence", "Verified invoice and expense account"); review(); await click("Post reviewed bill or vendor credit"); await screen.findByLabelText("Accounting action"); }
it("posts an unpaid bill, records a partial settlement and preserves its ledger when archived", async () => {
  open(); expect(screen.getByText(/This receipt has not been posted/)).toBeInTheDocument(); await post();
  expect(screen.getByLabelText("Receipt date")).toBeDisabled(); change("Amount settled (USD)", "40.00"); change("Unique settlement reference", "UI-PAYMENT"); change("Bank or card settlement evidence", "Verified bank debit"); review(); await click("Record verified settlement");
  await waitFor(() => expect(expenseOutstanding(readExpense(id).accounting!).amountCents).toBe(6000));
  await screen.findByText(/Remaining bill balance: \$60.00/); const entries = expenseAccountingData().entries;
  await click("Archive expense"); await screen.findByText("Archived expense"); expect(expenseAccountingData().entries).toEqual(entries); expect(screen.getByText(/Remaining bill balance: \$60.00/)).toBeInTheDocument();
});
it("keeps exact posting requests after a lost response and requires renewed review when values change", async () => {
  open(); change("Accounting review evidence", "Verified current invoice"); review(); change("Bill or credit due date", "2026-10-10"); expect(screen.getByRole("button", { name: "Post reviewed bill or vendor credit" })).toBeDisabled(); review(); loseResponse = true;
  await click("Post reviewed bill or vendor credit"); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Connection lost")); expect(screen.getByLabelText("Accounting review evidence")).toHaveValue("Verified current invoice");
  await click("Post reviewed bill or vendor credit"); await screen.findByLabelText("Accounting action"); expect(expenseAccountingData().entries).toHaveLength(1);
  const calls = vi.mocked(fetch).mock.calls; expect(calls).toHaveLength(2); expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
});
it("corrects a posted amount through a dated reversal and replacement while preserving entered errors", async () => {
  open(); await post(); change("Accounting action", "correct"); change("Corrected receipt total (USD)", "90.00"); change("Accounting review evidence", "Supplier corrected invoice total"); review(); await click("Post dated correction");
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("allocations must equal")); expect(screen.getByLabelText("Corrected receipt total (USD)")).toHaveValue("90.00");
  change("Allocation 1 amount (USD)", "90.00"); review(); await click("Post dated correction"); await waitFor(() => expect(readExpense(id).accounting!.homeAmountCents).toBe(9000)); expect(expenseAccountingData().entries).toHaveLength(3);
});
it("shows receipts to Money viewers with posting, upload, editing and archiving disabled", () => {
  open(false); expect(screen.getByLabelText("Merchant / business")).toBeDisabled(); expect(screen.getByRole("button", { name: "Post reviewed bill or vendor credit" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Archive expense" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
