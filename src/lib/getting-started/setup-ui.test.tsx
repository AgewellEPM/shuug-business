import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GettingStarted } from "@/components/GettingStarted";
import type { Branding } from "../branding/store";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ConnectionWizard", () => ({ ConnectionWizard: () => <p>Existing connection forms</p> }));
const formId = "dc0463ab-c8b6-4c7b-9e99-4265a0de3f45";
const initial = { forms: [{ id: formId, revision: 1, title: "Website quote", kind: "quote" as const, enabled: true, origins: ["https://www.example.test"], createdAt: "2026-09-10" }], submissions: [], workflows: [], runs: [] };
const branding = { organizationTypes: ["service"] } as Branding;
beforeEach(() => { window.location.hash = ""; vi.stubGlobal("fetch", vi.fn(async (_url, init) => { const body = JSON.parse(init.body); if (body.action === "workflow.test") return { ok: true, json: async () => ({ testId: "test1", steps: ["Receive Website quote", "Create a task"], message: "No external action was performed." }) }; return { ok: true, json: async () => ({}) }; })); });
afterEach(() => { vi.unstubAllGlobals(); });
function mount() { render(<GettingStarted initial={initial} connections={[]} branding={branding} members={[{ id: "employee1", name: "Alice" }]} baseUrl="https://business.example.test" configuration={<p>Existing branding controls</p>}/>); }
it("keeps unsupported mailbox integrations explicit and presents all four setup steps", () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: /1. Connect/ })); expect(screen.getByText("Existing connection forms")).toBeTruthy(); expect(screen.getByText(/Native mailbox sign-in and two-way calendar synchronization are not included/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /2. Configure/ })); expect(screen.getByText("Existing branding controls")).toBeTruthy();
});
it("requires a dry run before enabling and invalidates the test after an edit", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: /4. Automate/ })); expect(screen.queryByRole("button", { name: "Enable workflow" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Assign follow-up to"), { target: { value: "employee1" } });
  fireEvent.click(screen.getByRole("button", { name: "Test workflow without sending" })); await screen.findByRole("button", { name: "Enable workflow" });
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/setup", expect.objectContaining({ body: expect.stringContaining('"assigneeId":"employee1"') })));
  fireEvent.change(screen.getByLabelText("Task instruction"), { target: { value: "Changed instruction" } }); expect(screen.queryByRole("button", { name: "Enable workflow" })).toBeNull();
});
it("generates a public form embed and separates WordPress employee access", () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: /3. Attach/ })); expect(screen.getByRole("link", { name: "Download the WordPress plugin" }).getAttribute("href")).toBe("/api/setup/wordpress");
  expect((screen.getByLabelText("Website embed code") as HTMLTextAreaElement).value).toContain(`/api/website/forms/${formId}`); expect(screen.getByRole("link", { name: "Open form" }).getAttribute("href")).not.toContain("preview");
  expect(screen.getByText(/They do not confirm appointments/)).toBeTruthy();
});
