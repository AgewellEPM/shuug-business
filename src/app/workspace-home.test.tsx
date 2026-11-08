import { beforeEach, expect, it, vi } from "vitest";
import Home from "./page";
const state = vi.hoisted(() => ({ owner: true, role: "Owner", hidden: false, configured: true }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("@/lib/auth/identity", () => ({ requireIdentity: async () => ({ isOwner: state.owner }) }));
vi.mock("@/lib/permissions/active", () => ({ getActiveRole: async () => state.role }));
vi.mock("@/lib/permissions/store", () => ({ getMatrix: () => ({ Owner: { home: "edit", services: "view" }, Restricted: { home: "view" } }) }));
vi.mock("@/lib/features/store", () => ({ toolLinks: () => [] }));
vi.mock("@/lib/navigation/active-profile", () => ({ activeWorkspace: async () => {
  const config = { organizationTypes: ["service"], hiddenSections: [], featureVisibility: state.hidden ? { "service-clients": false } : {} };
  return { config, branding: { ...config, ...(state.configured ? { workspaceLayout: { homeToolId: "service-clients", primaryToolIds: ["service-clients"] } } : {}) } };
} }));
vi.mock("@/components/OrganizationHome", () => ({ OrganizationHome: () => null }));
vi.mock("@/components/Cockpit", () => ({ Cockpit: () => null }));
vi.mock("@/lib/cockpit/data", () => ({ loadCockpitData: async () => ({ onboarding: { durable: true } }) }));
beforeEach(() => { state.owner = true; state.role = "Owner"; state.hidden = false; state.configured = true; });

it("starts an owner at the configured visible executable tool", async () => {
  await expect(Home()).rejects.toThrow("redirect:/modules/service-clients");
});
it("keeps employees on their existing personal-work route", async () => {
  state.owner = false; await expect(Home()).rejects.toThrow("redirect:/me");
});
it("falls back to the existing home when the configured tool is hidden or not permitted", async () => {
  state.hidden = true; await expect(Home()).resolves.toBeTruthy();
  state.hidden = false; state.role = "Restricted"; await expect(Home()).resolves.toBeTruthy();
});
it("preserves the existing home when no layout was configured", async () => {
  state.configured = false; await expect(Home()).resolves.toBeTruthy();
});
