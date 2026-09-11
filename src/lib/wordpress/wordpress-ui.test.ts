import { readFileSync } from "node:fs";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
const script = readFileSync("integrations/wordpress/shuug-business/assets/workspace.js", "utf8");
const user = { id: "employee-alice", name: "Alice", email: "alice@example.test", role: "Employee", isOwner: false };
const workspace = { user, branding: { businessName: "Our business", organizationTypes: ["service"], primaryColor: "#2c4939" }, modules: [], definitions: [], editable: [], navigation: [], backendUrl: "https://business.example.test" };
const calls: { operation: string; input: Record<string, unknown> }[] = [];
let mode = "workspace";
beforeEach(() => {
  calls.length = 0; mode = "workspace"; document.body.replaceChildren();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body); calls.push(request);
    if (mode === "login" && request.operation === "workspace") return { ok: false, status: 401, json: async () => ({ message: "Connect your account." }) };
    if (request.operation === "workspace") return { ok: true, json: async () => ({ data: workspace }) };
    if (request.operation === "me") return { ok: true, json: async () => ({ data: { user, tasks: [{ id: "task1", title: "Finish my assigned work", priority: "high", status: "todo", goal: null, dueDate: null }] } }) };
    if (request.operation === "notes") return { ok: true, json: async () => ({ data: [{ id: "note1", ownerId: user.id, author: "Alice", title: "<img src=x onerror=alert(1)>", body: "Private note", scope: "internal", pageKey: "internal", pageLabel: "Internal", profile: "all", revision: 1 }] }) };
    return { ok: true, json: async () => ({ data: { ok: true } }) };
  }));
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
function mount() {
  const root = document.createElement("div"); root.dataset.shuugConfig = JSON.stringify({ endpoint: "https://wordpress.example.test/wp-json/shuug-business/v1/command", nonce: "wordpress-nonce", administrator: false, configured: true, logoutUrl: "https://wordpress.example.test/logout" }); document.body.append(root);
  // Execute our first-party vanilla script inside the DOM unit-test environment.
  new Function(script)();
}
it("updates personal assignments using the WordPress nonce without browser-held backend credentials", async () => {
  mount(); await screen.findByText("Finish my assigned work");
  fireEvent.change(screen.getByRole("combobox", { name: "Status for Finish my assigned work" }), { target: { value: "done" } });
  await waitFor(() => expect(calls).toContainEqual({ operation: "task.status", input: { id: "task1", status: "done" } }));
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { "Content-Type": "application/json", "X-WP-Nonce": "wordpress-nonce" } }));
  expect(screen.queryByRole("button", { name: "Employee accounts" })).toBeNull();
});
it("renders note content as text and keeps private note editing available", async () => {
  mount(); await screen.findByText("Finish my assigned work"); fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  await screen.findByText("<img src=x onerror=alert(1)>"); expect(document.querySelector("img")).toBeNull(); expect(screen.getByRole("button", { name: "Edit note" })).toBeTruthy();
});
it("provides an employee account connection form without owner controls", async () => {
  mode = "login"; mount(); await screen.findByRole("button", { name: "Connect account" });
  expect(screen.getByLabelText("Business email")).toBeTruthy(); expect(screen.getByLabelText("Business password")).toBeTruthy(); expect(screen.queryByText("Connect as the workspace owner")).toBeNull();
});
