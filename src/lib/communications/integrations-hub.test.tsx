import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { IntegrationsHub } from "@/components/IntegrationsHub";
import { integrationById } from "../integrations/registry";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture(id: string, configured = false) {
  const spec = integrationById(id)!, connect = vi.fn(async () => ({ ok: true, message: "Settings saved; delivery not verified." }));
  render(<IntegrationsHub groups={[{ cat: "Communication", items: [{ spec, configured, connected: configured }] }]} connectAction={connect} disconnectAction={vi.fn(async () => ({ ok: true, message: "Disconnected" }))}/>);
  fireEvent.click(screen.getByRole("button", { name: configured ? "Update settings" : "Add settings" }));
  return connect;
}
it("uses an explicit Twilio mode selector, readable account fields and a password-only secret", async () => {
  const connect = fixture("twilio", true);
  expect(screen.getByText("Configured")).toBeInTheDocument(); expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Twilio account ID")).toHaveAttribute("type", "text");
  expect(screen.getByLabelText("Shop texting number")).toHaveAttribute("type", "tel");
  expect(screen.getByLabelText("Twilio auth token")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Twilio auth token")).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Text message mode" })).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Twilio account ID"), { target: { value: `AC${"1".repeat(32)}` } });
  fireEvent.change(screen.getByLabelText("Twilio auth token"), { target: { value: "synthetic-private-twilio-token" } });
  fireEvent.change(screen.getByLabelText("Shop texting number"), { target: { value: "+18605550101" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Text message mode" }), { target: { value: "test" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(connect.mock.calls[0][1]).toMatchObject({ TWILIO_MODE: "test", TWILIO_FROM_NUMBER: "+18605550101" });
  expect(await screen.findByRole("status")).toHaveTextContent("delivery not verified");
});
it("selects Mailgun region and email mode without exposing technical key names", async () => {
  const connect = fixture("mailgun");
  expect(screen.queryByText("MAILGUN_API_KEY")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Shop sender email")).toHaveAttribute("type", "email");
  expect(screen.getByLabelText("Mailgun API key")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Email webhook signing key")).toHaveAttribute("type", "password");
  for (const [name, value] of [["Mailgun API key", "synthetic-private-mailgun-key"], ["Verified sending domain", "mail.example.invalid"], ["Shop sender email", "service@mail.example.invalid"], ["Email webhook signing key", "synthetic-signing-key"]]) fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.change(screen.getByRole("combobox", { name: "Mailgun account region" }), { target: { value: "EU" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Email message mode" }), { target: { value: "live" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(connect.mock.calls[0][1]).toMatchObject({ MAILGUN_MODE: "live", MAILGUN_REGION: "EU" });
});
