import { it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeneralLedger } from "./GeneralLedger";
import { trialBalance, ledgerIncomeStatement, ledgerBalanceSheet, coaAccounts, type JournalEntry } from "@/lib/accounting/ledger";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const entry: JournalEntry = { id: "manual:fixture", source: "manual", date: "2026-09-10", memo: "Original entry", lines: [{ accountNumber: 1000, debitCents: 1234, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 1234 }], manual: { revision: 1, actor: "Original bookkeeper", recordedAt: "2026-09-10T16:00:00Z", reversesId: null, reversedById: null, reason: null, imported: false } };
function setup(canEdit = true, entries: JournalEntry[] = [entry], command = vi.fn().mockResolvedValue({ ok: true })) {
  const tb = trialBalance(entries);
  render(<GeneralLedger entries={entries} trialBalance={tb} incomeStatement={ledgerIncomeStatement(tb)} balanceSheet={ledgerBalanceSheet(tb)} accounts={coaAccounts()} canEdit={canEdit} journalCommandAction={command} />);
  return command;
}
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "+ Manual entry" }));
  fireEvent.change(screen.getByLabelText("Posting date"), { target: { value: "2026-09-11" } });
  fireEvent.change(screen.getByLabelText("Entry memo"), { target: { value: "Reviewed correction" } });
  fireEvent.change(screen.getByLabelText("Debit 1"), { target: { value: "12.34" } });
  fireEvent.change(screen.getByLabelText("Credit 2"), { target: { value: "12.34" } });
}
it("requires balanced amounts and explicit review, then sends exact integer cents", async () => {
  const command = setup(); fill();
  expect(screen.getByRole("button", { name: "Post entry" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("I reviewed the posting date, accounts and amounts."));
  fireEvent.change(screen.getByLabelText("Credit 2"), { target: { value: "12.30" } });
  expect(screen.getByRole("button", { name: "Post entry" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Credit 2"), { target: { value: "12.34" } });
  fireEvent.click(screen.getByLabelText("I reviewed the posting date, accounts and amounts."));
  fireEvent.click(screen.getByRole("button", { name: "Post entry" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(command.mock.calls[0][0]).toMatchObject({ action: "journal.post", input: { date: "2026-09-11", memo: "Reviewed correction", reviewed: true, lines: [{ debitCents: 1234, creditCents: 0 }, { debitCents: 0, creditCents: 1234 }] } });
  await screen.findByText("Journal entry recorded.");
});
it("reuses the command ID if the posting response is interrupted", async () => {
  const command = vi.fn().mockRejectedValueOnce(Error("Connection lost")).mockResolvedValue({ ok: true });
  setup(true, [entry], command); fill(); fireEvent.click(screen.getByLabelText("I reviewed the posting date, accounts and amounts."));
  fireEvent.click(screen.getByRole("button", { name: "Post entry" }));
  await screen.findByText(/response was interrupted/);
  await waitFor(() => expect(screen.getByRole("button", { name: "Post entry" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Post entry" }));
  await waitFor(() => expect(command).toHaveBeenCalledTimes(2)); expect(command.mock.calls[1][0]).toEqual(command.mock.calls[0][0]);
});
it.each(["1.234", "-1", "hello", "1e4"])("blocks invalid amount %s", amount => {
  setup(); fill(); fireEvent.click(screen.getByLabelText("I reviewed the posting date, accounts and amounts."));
  fireEvent.change(screen.getByLabelText("Debit 1"), { target: { value: amount } }); expect(screen.getByRole("button", { name: "Post entry" })).toBeDisabled();
});
it("shows the author and records a reviewed dated reversal instead of deleting history", async () => {
  const command = setup(); expect(screen.getByText(/Original bookkeeper/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review reversal" }));
  expect(screen.getByRole("button", { name: "Record reversal" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reversal date"), { target: { value: "2026-09-11" } });
  fireEvent.change(screen.getByLabelText("Correction reason"), { target: { value: "The sale was already recorded" } });
  fireEvent.click(screen.getByLabelText("I reviewed this reversal and its date."));
  fireEvent.click(screen.getByRole("button", { name: "Record reversal" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(command.mock.calls[0][0]).toMatchObject({ action: "journal.reverse", input: { id: entry.id, revision: 1, date: "2026-09-11", reason: "The sale was already recorded", reviewed: true } });
});
it("gives viewers journal history without mutation controls", () => {
  setup(false); expect(screen.getByText("Original entry")).toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("links a recorded reversal and suppresses a second direct correction", () => {
  setup(true, [{ ...entry, manual: { ...entry.manual!, reversedById: "manual:reversal" } }]);
  expect(screen.getByRole("link", { name: "Recorded reversal" })).toHaveAttribute("href", "#manual:reversal");
  expect(screen.queryByRole("button", { name: "Review reversal" })).not.toBeInTheDocument();
});

it("starts new entries with active accounts even if an inactive account sorts first", () => {
  const tb = trialBalance([]);
  const accounts = [{ number: 1, name: "Inactive historical cash", type: "asset", active: false }, ...coaAccounts()];
  render(<GeneralLedger entries={[]} trialBalance={tb} incomeStatement={ledgerIncomeStatement(tb)} balanceSheet={ledgerBalanceSheet(tb)} accounts={accounts} canEdit journalCommandAction={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Manual entry" }));
  expect(screen.getByLabelText("Account 1")).toHaveValue("1000");
  expect(screen.queryByRole("option", { name: /Inactive historical cash/ })).not.toBeInTheDocument();
});
