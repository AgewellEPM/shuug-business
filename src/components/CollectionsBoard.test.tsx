import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CollectionsBoard } from "./CollectionsBoard";
import { settleInvoice, type Payment } from "@/lib/payments/collections";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const invoice = { id: "invoice-A", company: "Fixture company", customerId: "customer-A", totalCents: 10000, dueDateISO: "2026-07-31" };
const payment: Payment = { id: "receipt-A", invoiceId: invoice.id, amountCents: 10000, feeCents: 100, method: "check", receivedAtISO: "2026-08-01", refunded: false, reference: "Bank-A", actor: "Owner", evidence: "Reviewed bank receipt" };
function setup(payments: Payment[] = [], canEdit = true, command = vi.fn().mockResolvedValue({ ok: true })) {
  render(<CollectionsBoard statuses={[settleInvoice(invoice, payments, undefined, "2026-09-30")]} payments={payments} audit={[]} canEdit={canEdit} team={[]} commandAction={command} />); return command;
}
function fillReceipt() {
  fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
  fireEvent.change(screen.getByLabelText("Receipt amount $"), { target: { value: "40.25" } });
  fireEvent.change(screen.getByLabelText("Fee withheld $"), { target: { value: "1.25" } });
  fireEvent.change(screen.getByLabelText("Receipt date"), { target: { value: "2026-08-01" } });
  fireEvent.change(screen.getByLabelText("Receipt reference"), { target: { value: "Bank fixture" } });
  fireEvent.change(screen.getByLabelText("Receipt evidence"), { target: { value: "Bank deposit verified" } });
}
it("posts reviewed dated receipts with whole cents and keeps the form until success", async () => {
  const command = setup(); fillReceipt();
  expect(screen.getByRole("button", { name: "Save receipt" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("I reviewed the dates, amounts and supporting records."));
  fireEvent.change(screen.getByLabelText("Receipt reference"), { target: { value: "Bank fixture corrected" } });
  expect(screen.getByRole("button", { name: "Save receipt" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("I reviewed the dates, amounts and supporting records."));
  fireEvent.click(screen.getByRole("button", { name: "Save receipt" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(command.mock.calls[0][0]).toMatchObject({ action: "payment.record", input: { invoiceId: "invoice-A", amountCents: 4025, feeCents: 125, receivedAtISO: "2026-08-01", method: "check", reviewed: true } });
  await screen.findByText("Record saved.");
});
it("retains rejected receipt details and retries an interrupted response with the same ID", async () => {
  const command = vi.fn().mockRejectedValueOnce(Error("Interrupted")).mockResolvedValue({ ok: false, error: "Current balance changed" }); setup([], true, command); fillReceipt();
  fireEvent.click(screen.getByLabelText("I reviewed the dates, amounts and supporting records.")); fireEvent.click(screen.getByRole("button", { name: "Save receipt" }));
  await screen.findByText(/response was interrupted/); await waitFor(() => expect(screen.getByRole("button", { name: "Save receipt" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Save receipt" })); await screen.findByText("Current balance changed");
  expect(command.mock.calls[1][0]).toEqual(command.mock.calls[0][0]); expect(screen.getByLabelText("Receipt amount $")).toHaveValue("40.25");
});
it("opens a paid invoice's retained receipt and requires reviewed return evidence", async () => {
  const command = setup([payment]);
  fireEvent.click(screen.getByLabelText("Include paid and cancelled invoices")); expect(screen.getByText(/Received 2026-08-01/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record returned payment" })); expect(screen.getByRole("button", { name: "Save returned payment" })).toBeDisabled();
  for (const [label, value] of [["Return date", "2026-09-02"], ["Bank return reference", "Return fixture"], ["Return reason", "Check returned unpaid"], ["Return evidence", "Bank advice verified"], ["Additional bank fee $", "2.50"], ["Customer return fee including tax $", "5.50"], ["Tax included in customer fee $", "0.50"], ["Reviewed customer fee basis", "Customer agreement and reviewed tax"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByLabelText("I reviewed the dates, amounts and supporting records.")); fireEvent.click(screen.getByRole("button", { name: "Save returned payment" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(command.mock.calls[0][0]).toMatchObject({ action: "payment.return", input: { paymentId: payment.id, date: "2026-09-02", bankFeeCents: 250, customerFeeCents: 550, customerFeeTaxCents: 50, reviewed: true } });
});
it("logs a reminder actually made without presenting a fake send action", async () => {
  const command = setup(); expect(screen.queryByRole("button", { name: "Send reminder" })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Log reminder" }));
  fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-09-01" } }); fireEvent.change(screen.getByLabelText("Reminder details"), { target: { value: "Called accounts payable" } }); fireEvent.click(screen.getByRole("button", { name: "Save reminder record" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce()); expect(command.mock.calls[0][0]).toMatchObject({ action: "reminder.record", input: { date: "2026-09-01", note: "Called accounts payable" } });
});
it("gives Money viewers history without financial or follow-up mutation controls", () => {
  setup([payment], false); fireEvent.click(screen.getByLabelText("Include paid and cancelled invoices")); expect(screen.getByText("Reviewed bank receipt")).toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
