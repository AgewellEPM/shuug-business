import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";
import { DEFAULT_BRANDING } from "@/lib/branding/store";
import type { Branding } from "@/lib/branding/store";
const state = vi.hoisted(() => ({ hidden: [] as string[], hiddenItems: [] as string[], push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, refresh: state.refresh }), usePathname: () => "/modules/service-clients", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/admin/actions", () => ({ setActiveRoleAction: vi.fn() }));
vi.mock("@/lib/ui/navUsage", () => ({ useNavUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ui/navPrefs", () => ({ useNavPrefs: () => ({ hidden: state.hidden, hiddenItems: state.hiddenItems, order: [], toggle: vi.fn(), toggleItem: vi.fn(), move: vi.fn() }), applyNavOrder: (groups: unknown[]) => groups }));
const branding: Branding = { ...DEFAULT_BRANDING, businessName: "A longer independent service business name", organizationTypes: ["service"], workspaceLayout: { homeToolId: "service-clients", primaryToolIds: ["service-clients", "client-books"] }, featureVisibility: { assistant: false } };
beforeEach(() => { state.hidden = []; state.hiddenItems = []; vi.clearAllMocks(); });

it("renders configured primary tools once in the sidebar, with contextual header and no hidden assistant/search", () => {
  render(<WorkspaceShell branding={branding} user={{ name: "Owner", isOwner: true }}><p>Existing tool</p></WorkspaceShell>);
  const primary = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(primary).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/modules/service-clients", "/accounting"]);
  fireEvent.click(screen.getByRole("button", { name: "Money section" }));
  expect(screen.getAllByRole("link", { name: "Client books" })).toHaveLength(1);
  expect(screen.getByText("Your workspace")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Search customers" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Ask assistant/ })).not.toBeInTheDocument();
  expect(screen.getByRole("banner").querySelector('a[href="/modules/service-clients"]')).toHaveTextContent("Clients & service locations");
});
it("keeps configured tools out of unauthorized and personally hidden navigation", () => {
  const view = render(<WorkspaceShell branding={branding} allowedSections={["home"]}><p>Restricted</p></WorkspaceShell>);
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryAllByRole("link")).toHaveLength(0);
  state.hidden = ["Services"];
  view.rerender(<WorkspaceShell branding={branding} allowedSections={["home", "services", "money"]}><p>Restricted</p></WorkspaceShell>);
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/accounting"]);
});
it("retains ordinary workspace navigation and header search when no layout was configured", () => {
  render(<WorkspaceShell branding={DEFAULT_BRANDING}><p>Original workspace</p></WorkspaceShell>);
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Assistant" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Search customers" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Ask assistant/ })).toBeInTheDocument();
});
