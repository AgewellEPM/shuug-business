import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { catalogWithTools, visibleItems, type WorkspaceVisibility } from "./catalog";
import { resolveWorkspaceLayout, workspaceLayoutSchema } from "./workspace-layout";
import { getBranding, saveBranding } from "../branding/store";
import { exportBusinessTemplate, importBusinessTemplate } from "../branding/templates";

const config: WorkspaceVisibility = { organizationTypes: ["service", "nonprofit"], hiddenSections: [] };
const layout = { homeToolId: "service-clients", primaryToolIds: ["service-clients", "client-books", "nonprofit-donors"] };
const shown = (value = config, allowed?: Parameters<typeof visibleItems>[2]) => visibleItems(value, catalogWithTools([], value), allowed);
let directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "shuug-workspace-layout-")); vi.stubEnv("DEALDESK_DATA_DIR", directory); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("bounds saved tool references without accepting duplicate IDs, unlisted home or arbitrary URLs", () => {
  expect(workspaceLayoutSchema.parse(layout)).toEqual(layout);
  for (const invalid of [
    { ...layout, primaryToolIds: [] }, { ...layout, primaryToolIds: Array(13).fill("service-clients") },
    { ...layout, primaryToolIds: ["service-clients", "service-clients"] },
    { ...layout, homeToolId: "unlisted" }, { homeToolId: "https://external.invalid", primaryToolIds: ["https://external.invalid"] },
    { ...layout, homeHref: "/arbitrary" },
  ]) expect(workspaceLayoutSchema.safeParse(invalid).success).toBe(false);
});
it("resolves generated order using visible tools while preserving default navigation when absent", () => {
  const items = shown(), resolved = resolveWorkspaceLayout(layout, items);
  expect(resolved.primary.map(item => item.id)).toEqual(layout.primaryToolIds);
  expect(resolved.home?.href).toBe("/modules/service-clients");
  expect(resolved.header?.id).toBe("service-clients");
  expect(resolveWorkspaceLayout(undefined, items)).toMatchObject({ configured: false, home: null, header: null, primary: items.filter(item => item.group === "Workspace") });
});
it("never reveals tools outside role, feature or profile visibility", () => {
  const role = resolveWorkspaceLayout(layout, shown(config, ["home", "fundraising"]));
  expect(role.primary.map(item => item.id)).toEqual(["nonprofit-donors"]); expect(role.home).toBeNull();
  const hidden = resolveWorkspaceLayout(layout, shown({ ...config, featureVisibility: { "service-clients": false } }));
  expect(hidden.home).toBeNull(); expect(hidden.primary.some(item => item.id === "service-clients")).toBe(false);
  expect(resolveWorkspaceLayout(layout, shown({ ...config, organizationTypes: ["product"] })).home).toBeNull();
});
it("honors personal hidden groups/items and safely falls back for unavailable, planned or root home", () => {
  const resolved = resolveWorkspaceLayout(layout, shown(), { hiddenGroups: ["Services"], hiddenItems: ["/accounting"] });
  expect(resolved.primary.map(item => item.id)).toEqual(["nonprofit-donors"]); expect(resolved.home).toBeNull();
  expect(resolveWorkspaceLayout({ homeToolId: "removed-module", primaryToolIds: ["removed-module"] }, shown()).home).toBeNull();
  expect(resolveWorkspaceLayout({ homeToolId: "home", primaryToolIds: ["home"] }, shown()).home).toBeNull();
  expect(resolveWorkspaceLayout(layout, shown().map(item => item.id === layout.homeToolId ? { ...item, status: "planned" } : item)).home).toBeNull();
});
it("persists layout across other branding changes, supports reset and preserves old files", () => {
  expect(getBranding()).not.toHaveProperty("workspaceLayout");
  saveBranding({ workspaceLayout: layout }); saveBranding({ businessName: "Independent practice" });
  expect(getBranding().workspaceLayout).toEqual(layout);
  expect(() => saveBranding({ workspaceLayout: { ...layout, primaryToolIds: [] } })).toThrow();
  expect(getBranding().workspaceLayout).toEqual(layout);
  const template = exportBusinessTemplate(); saveBranding({ workspaceLayout: null }); importBusinessTemplate(template);
  expect(getBranding().workspaceLayout).toEqual(layout);
  saveBranding({ workspaceLayout: null }); expect(getBranding().workspaceLayout).toBeNull();
  writeFileSync(path.join(directory, "branding.json"), JSON.stringify({ businessName: "Older workspace" }));
  expect(getBranding()).not.toHaveProperty("workspaceLayout");
  const before = readFileSync(path.join(directory, "branding.json"), "utf8");
  expect(() => saveBranding({ workspaceLayout: { homeToolId: "service-clients", primaryToolIds: ["client-books"] } })).toThrow();
  expect(readFileSync(path.join(directory, "branding.json"), "utf8")).toBe(before);
});
