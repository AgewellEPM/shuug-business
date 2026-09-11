import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ChartOfAccounts } from "./ChartOfAccounts";
import { standardAccounts } from "@/lib/accounting/account-model";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it("creates a classified subaccount after review and resets review when details change", async () => {
  const command = vi.fn().mockResolvedValue({ ok: true });
  render(<ChartOfAccounts accounts={standardAccounts()} audit={[]} canEdit commandAction={command} />);
  fireEvent.click(screen.getByRole("button", { name: "New account" }));
  fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "7000" } });
  fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Kitchen supplies" } });
  fireEvent.change(screen.getByLabelText("Parent account"), { target: { value: "6000" } });
  expect(screen.getByRole("button", { name: "Save account" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("I reviewed the classification and account details."));
  fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Kitchen equipment hire" } });
  expect(screen.getByRole("button", { name: "Save account" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("I reviewed the classification and account details."));
  fireEvent.click(screen.getByRole("button", { name: "Save account" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(command.mock.calls[0][0]).toMatchObject({ action: "account.save", input: { number: 7000, revision: 0, name: "Kitchen equipment hire", classification: "expense", parentNumber: 6000, active: true, reviewed: true } });
});
it("filters accounts and gives viewers no mutation controls", () => {
  render(<ChartOfAccounts accounts={standardAccounts()} audit={[]} canEdit={false} commandAction={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Find account"), { target: { value: "checking" } });
  expect(screen.getByText("1000 · Business Checking")).toBeInTheDocument(); expect(screen.queryByText("Sales Income")).not.toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("shows errors without dropping edits and reuses the request on an interrupted response", async () => {
  const command = vi.fn().mockRejectedValueOnce(Error("Network lost")).mockResolvedValue({ ok: true });
  render(<ChartOfAccounts accounts={standardAccounts()} audit={[]} canEdit commandAction={command} />);
  fireEvent.click(screen.getByRole("button", { name: "6000 · Operating Expenses" }));
  expect(screen.getByLabelText("Account classification")).toBeDisabled(); expect(screen.getByLabelText("Active for new postings")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Operations expense" } });
  fireEvent.click(screen.getByLabelText("I reviewed the classification and account details.")); fireEvent.click(screen.getByRole("button", { name: "Save account" }));
  await screen.findByText(/response was interrupted/); await waitFor(() => expect(screen.getByRole("button", { name: "Save account" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Save account" }));
  await waitFor(() => expect(command).toHaveBeenCalledTimes(2)); expect(command.mock.calls[0][0]).toEqual(command.mock.calls[1][0]);
});
