import { expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { workspaceItems, specialistModules, visibleItems, activeItem, catalogWithTools, type WorkspaceVisibility } from "./catalog";
import { assembleIndustry } from "../industry/model";
import { sectionForPath } from "../permissions/model";
const product: WorkspaceVisibility = { organizationTypes: ["product"], hiddenSections: [], featureVisibility: {} };
it("registers each existing top-level page, with valid destinations for every sidebar link", () => {
  const app = path.join(process.cwd(), "src/app");
  for (const entry of readdirSync(app, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(app, entry.name, "page.tsx"))) expect(workspaceItems.some(item => new URL(item.href, "http://local").pathname === `/${entry.name}`), entry.name).toBe(true);
  }
  for (const item of workspaceItems) {
    const pathname = new URL(item.href, "http://local").pathname;
    const dir = pathname.startsWith("/modules/") ? "modules/[id]" : pathname.startsWith("/m/") ? "m/[id]" : pathname;
    expect(existsSync(path.join(app, dir, "page.tsx")), item.href).toBe(true);
  }
  expect(new Set(workspaceItems.map(item => item.id)).size).toBe(workspaceItems.length);
  expect(new Set(workspaceItems.map(item => item.href)).size).toBe(workspaceItems.length);
});
it("combines product, service and nonprofit modules while keeping tax and backend in their groups", () => {
  expect(specialistModules.filter(item => item.organizations?.includes("nonprofit"))).toHaveLength(20);
  expect(specialistModules.filter(item => item.organizations?.includes("service"))).toHaveLength(20);
  const mixed = visibleItems({ ...product, organizationTypes: ["product", "service", "nonprofit"] });
  for (const id of ["orders", "service-work", "nonprofit-donations"]) expect(mixed.some(item => item.id === id)).toBe(true);
  expect(mixed.find(item => item.id === "sales-tax")?.group).toBe("Money");
  expect(mixed.find(item => item.id === "shopify")?.group).toBe("Setup");
  expect(visibleItems(product).some(item => item.id === "nonprofit-donations")).toBe(false);
});
it("respects feature, group and role restrictions including custom trackers", () => {
  const items = catalogWithTools([{ id: "one", href: "/trackers/one", label: "Custom" }, { id: "operations", href: "/operations", label: "Duplicate" }]);
  expect(items.filter(item => item.href === "/operations")).toHaveLength(1);
  expect(visibleItems({ ...product, featureVisibility: { "sales-tax": false } }, items).some(item => item.id === "sales-tax")).toBe(false);
  expect(visibleItems({ ...product, hiddenSections: ["Setup"] }, items).some(item => item.id === "tracker:one")).toBe(false);
  expect(visibleItems({ ...product, featureVisibility: { "nonprofit-participants": true } }, items, ["home", "fundraising"]).some(item => item.id === "nonprofit-participants")).toBe(false);
  expect(sectionForPath("/modules/nonprofit-donors")).toBe("fundraising");
  expect(sectionForPath("/modules/nonprofit-participants")).toBe("programs");
  // SDK modules resolve their section through the registry (governs middleware + guards).
  expect(sectionForPath("/m/customer-feedback")).toBe("sales");
  expect(sectionForPath("/m/equipment-log")).toBe("operations");
});
it("selects the exact accounting or distribution view and avoids overlapping parent highlights", () => {
  expect(activeItem(workspaceItems, "/books", "view=sales-tax")).toBe("sales-tax");
  expect(activeItem(workspaceItems, "/books", "view=balance-sheet")).toBe("balance-sheet");
  expect(activeItem(workspaceItems, "/books", "")).toBe("accounting");
  expect(activeItem(workspaceItems, "/distribution", "tab=routes")).toBe("delivery-routes");
  expect(activeItem(workspaceItems, "/customers/import", "")).toBe("customer-imports");
});

it("routes restaurant industry tools into the connected workflow while retaining visibility toggles", () => {
  const setup = assembleIndustry({ industryId: "restaurant", answers: {}, templateName: "Restaurant", revision: 1 });
  const config: WorkspaceVisibility = { ...product, industrySetup: setup.setup, organizationTypes: ["product"] };
  const items = catalogWithTools([], config);
  expect(items.find(i => i.id === "module:restaurant-menu")?.href).toBe("/restaurant/manage?tab=menu");
  expect(items.find(i => i.id === "module:restaurant-reservations")?.section).toBe("operations");
  expect(items.find(i => i.id === "module:daily-close")?.group).toBe("Money");
  expect(items.find(i => i.id === "module:daily-close")?.href).toBe("/restaurant/finance");
  expect(sectionForPath("/restaurant/finance")).toBe("money");
  expect(items.find(i => i.id === "restaurant-credits")?.group).toBe("Money");
  expect(visibleItems({ ...config, featureVisibility: { "restaurant-credits": false } }, items).some(i => i.id === "restaurant-credits")).toBe(false);
  expect(items.find(i => i.id === "restaurant-stocktakes")?.group).toBe("Operations");
  expect(items.find(i => i.id === "restaurant-prep")?.group).toBe("Operations");
  expect(items.find(i => i.id === "restaurant-prep")?.href).toBe("/restaurant/manage?tab=prep");
  expect(visibleItems({ ...config, featureVisibility: { "restaurant-prep": false } }, items).some(i => i.id === "restaurant-prep")).toBe(false);
  expect(items.find(i => i.id === "restaurant-stocktake-review")?.group).toBe("Money");
  expect(visibleItems({ ...config, featureVisibility: { "restaurant-stocktakes": false } }, items).some(i => i.id === "restaurant-stocktakes")).toBe(false);
  expect(items.filter(i => i.href === "/team/schedule")).toHaveLength(1);
  expect(visibleItems({ ...config, featureVisibility: { "module:restaurant-menu": false } }, items).some(i => i.id === "module:restaurant-menu")).toBe(false);
  expect(catalogWithTools([], product).find(i => i.id === "module:restaurant-menu")?.href).toBe("/m/restaurant-menu");
});
