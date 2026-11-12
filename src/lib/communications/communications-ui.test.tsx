import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommunicationsWorkspace, type CommunicationsView } from "@/components/CommunicationsWorkspace";
const initial: CommunicationsView = { messages: [], consents: [], inbound: [], connections: { enabled: false,
  sms: { configured: false, ready: false, mode: null, detail: "SMS not connected" }, email: { configured: false, ready: false, mode: null, detail: "Email not connected" },
  callbacks: { twilioInbound: "/api/communications/twilio/inbound", twilioStatus: "/api/communications/twilio/status", mailgun: "/api/communications/mailgun" } } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("keeps the same immutable message event after a lost queue response and never dispatches implicitly", async () => {
  const requests: { command: string; input: { eventKey: string; body: string; to: string } }[] = [];
  const provider = vi.fn(async (_url: string, options?: RequestInit) => {
    requests.push(JSON.parse(String(options?.body)));
    if (requests.length === 1) throw new Error("Synthetic lost response");
    return Response.json({ ok: true, ...initial });
  }); vi.stubGlobal("fetch", provider);
  render(<CommunicationsWorkspace initial={initial}/>);
  fireEvent.click(screen.getByRole("button", { name: "New message" }));
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+18605550101" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Fictional appointment update" } });
  fireEvent.submit(screen.getByRole("button", { name: "Queue message" }).closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Synthetic lost response"));
  fireEvent.submit(screen.getByRole("button", { name: "Queue message" }).closest("form")!);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Message queued"));
  expect(requests).toHaveLength(2); expect(requests[0].input.eventKey).toBe(requests[1].input.eventKey);
  expect(requests.every(request => request.command === "queue")).toBe(true);
  expect(screen.getByRole("button", { name: "Process queue" })).toBeDisabled();
});

it("uses aggregate counts rather than the bounded visible history for its dashboard", () => {
  render(<CommunicationsWorkspace initial={{ ...initial, counts: { queued: 19, blocked: 4, sending: 3, uncertain: 8, failed: 4, delivered: 1000 } }}/>);
  expect(screen.getByText("26")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sent & queued" }));
  expect(screen.getByText(/Showing 0 of 1038 messages/)).toBeInTheDocument();
});
