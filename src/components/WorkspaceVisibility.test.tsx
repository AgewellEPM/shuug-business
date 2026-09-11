import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrandingSettings } from "./BrandingSettings";
import { WorkspaceShell } from "./WorkspaceShell";
import { DEFAULT_BRANDING } from "@/lib/branding/store";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), query: "view=sales-tax", pathname: "/books" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => mocks.pathname, useSearchParams: () => new URLSearchParams(mocks.query) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.pathname = "/books"; mocks.query = "view=sales-tax";
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), clear: () => memory.clear() });
});
afterEach(() => vi.unstubAllGlobals());
it("edits a tool in Branding and saves mixed organization types without changing identity", async () => {
  const save = vi.fn(async patch => ({ ok: true, branding: patch }));
  render(<BrandingSettings initial={{ ...DEFAULT_BRANDING, businessName: "Community Works" }} saveAction={save}/>);
  fireEvent.change(screen.getByRole("searchbox", { name: "Find a tool or group" }), { target: { value: "Sales tax" } });
  const tax = screen.getByRole("switch", { name: "Sales tax" });
  expect(tax).toHaveAttribute("aria-checked", "true");
  fireEvent.click(tax);
  expect(tax).toHaveAttribute("aria-checked", "false");
  fireEvent.click(screen.getByRole("checkbox", { name: /^Nonprofit/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /^Service industry/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save & apply workspace" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ businessName: "Community Works", organizationTypes: ["product", "nonprofit", "service"], featureVisibility: { "sales-tax": false } })));
  expect(mocks.refresh).toHaveBeenCalled();
});
it("shows tax in Money with one current link, then hides it when the saved setting changes", () => {
  const view = render(<WorkspaceShell branding={DEFAULT_BRANDING}><p>Report</p></WorkspaceShell>);
  expect(screen.getByRole("link", { name: "Sales tax" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Balance sheet" })).not.toHaveAttribute("aria-current");
  view.rerender(<WorkspaceShell branding={{ ...DEFAULT_BRANDING, featureVisibility: { "sales-tax": false } }}><p>Report</p></WorkspaceShell>);
  expect(screen.queryByRole("link", { name: "Sales tax" })).not.toBeInTheDocument();
});
it("keeps program records outside fundraising access and hides product channel controls for a service organization", () => {
  mocks.pathname = "/modules/nonprofit-donors"; mocks.query = "";
  render(<WorkspaceShell allowedSections={["home", "fundraising"]} branding={{ ...DEFAULT_BRANDING, organizationTypes: ["service", "nonprofit"] }}><p>Workspace</p></WorkspaceShell>);
  expect(screen.getByRole("link", { name: /^Donors & supporters$/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Participants & service records/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Sales channel" })).not.toBeInTheDocument();
});
