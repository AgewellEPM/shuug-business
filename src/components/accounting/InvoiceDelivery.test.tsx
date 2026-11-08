import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvoiceDelivery } from "./InvoiceDelivery";
import type { BillingDocument } from "@/lib/accounting/billing-model";
const refreshed = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshed }) }));
const doc = { id: "synthetic-invoice", revision: 2, status: "posted", party: { email: "client@example.invalid" } } as BillingDocument;
const connection = { ready: true, from: "office@billing.example.invalid", mode: "live", region: "US", domain: "billing.example.invalid", message: "Configured only" } as const;
const preview = { deliveryId: "synthetic-delivery", status: "preview", message: "Preview only", previewDigest: "a".repeat(64), preview: { from: connection.from, recipient: doc.party.email, subject: "Your invoice is available", text: "Your invoice is available at https://workspace.example.invalid/private-invoice", url: "https://workspace.example.invalid/private-invoice", mode: "live", expiresAt: "2099-01-01", previewExpiresAt: "2098-12-01" } };
afterEach(() => { vi.unstubAllGlobals(); refreshed.mockClear(); });
it("previews without sending, then binds an explicit reviewed send to the displayed recipient and digest", async () => {
  const provider = vi.fn(async (_url: string, init?: RequestInit) => { const request = JSON.parse(String(init?.body)); return Response.json({ result: request.action === "billing.delivery.preview" ? preview : { deliveryId: preview.deliveryId, status: "accepted", message: "Mailgun accepted; recipient delivery unconfirmed." } }); });
  vi.stubGlobal("fetch", provider);
  render(<InvoiceDelivery bookId="office" doc={doc} connection={connection} history={[]} canEdit owner/>);
  fireEvent.click(screen.getByText("Email invoice")); fireEvent.click(screen.getByRole("button", { name: "Preview invoice email" }));
  await screen.findByText(preview.preview.text); expect(provider).toHaveBeenCalledOnce(); expect(JSON.parse(String(provider.mock.calls[0][1]?.body)).action).toBe("billing.delivery.preview");
  expect(screen.getByText(/Tax files, line items and internal notes are not attached/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.submit(screen.getByRole("button", { name: "Send invoice email" }).closest("form")!);
  await screen.findByText("Mailgun accepted; recipient delivery unconfirmed."); expect(provider).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(provider.mock.calls[1][1]?.body))).toMatchObject({ action: "billing.delivery.send", input: { id: doc.id, revision: 2, deliveryId: preview.deliveryId, previewDigest: preview.previewDigest, recipient: doc.party.email, reviewed: true } });
});
it("reuses the same send request after a lost response and exposes connection-missing state without send controls", async () => {
  const requests: { action: string; requestId: string }[] = [];
  const provider = vi.fn(async (_url: string, init?: RequestInit) => { const request = JSON.parse(String(init?.body)); requests.push(request); if (request.action === "billing.delivery.preview") return Response.json({ result: preview }); if (requests.filter(r => r.action === "billing.delivery.send").length === 1) throw new Error("Synthetic lost response; inspect saved request"); return Response.json({ result: { deliveryId: preview.deliveryId, status: "uncertain", message: "Provider outcome uncertain. Do not resend." } }); });
  vi.stubGlobal("fetch", provider);
  const view = render(<InvoiceDelivery bookId="office" doc={doc} connection={connection} history={[]} canEdit owner/>);
  fireEvent.click(screen.getByText("Email invoice")); fireEvent.click(screen.getByRole("button", { name: "Preview invoice email" })); await screen.findByText(preview.preview.text);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.submit(screen.getByRole("button", { name: "Send invoice email" }).closest("form")!);
  await screen.findByText(/Synthetic lost response/); fireEvent.submit(screen.getByRole("button", { name: "Check this send attempt" }).closest("form")!);
  await waitFor(() => expect(requests).toHaveLength(3)); expect(requests[1].requestId).toBe(requests[2].requestId);
  view.unmount(); render(<InvoiceDelivery bookId="office" doc={doc} connection={{ ...connection, ready: false, message: "Mailgun credentials required." }} history={[]} canEdit={false} owner={false}/>);
  fireEvent.click(screen.getByText("Email invoice")); expect(screen.getByText(/Invoice email is not connected/)).toBeTruthy(); expect(screen.queryByRole("button", { name: "Preview invoice email" })).toBeNull();
});

it("keeps voided invoice outcome review available while forbidding another email preview", () => {
  render(<InvoiceDelivery bookId="office" doc={{ ...doc, status: "void", revision: 3 }} connection={connection} history={[{ deliveryId: "synthetic-interrupted", documentId: doc.id, revision: 2, recipient: doc.party.email, mode: "live", status: "uncertain", createdAt: "2026-10-01T00:00:00.000Z", attemptedAt: "2026-10-01T00:00:00.000Z", providerId: null, message: "Uncertain", verification: "none" }]} canEdit owner/>);
  fireEvent.click(screen.getByText("Email invoice")); expect(screen.queryByRole("button", { name: "Preview invoice email" })).toBeNull(); expect(screen.getByText("Record outcome after checking Mailgun")).toBeTruthy();
});
