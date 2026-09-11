// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { industries, packs } from "./catalog";
import { assembleIndustry } from "./model";
import { previewIndustry, applyIndustry } from "./service";
import { getBranding, saveBranding } from "../branding/store";
import { visibleItems, workspaceItems } from "../navigation/catalog";
import { exportBusinessTemplate, importBusinessTemplate } from "../branding/templates";
import { moduleById } from "../sdk/registry";
import { addRecord, listRecords, updateRecord } from "../sdk/records";
import { saveSecrets } from "../connections/vault";
let folder: string;
beforeEach(() => { folder = mkdtempSync(path.join(tmpdir(), "shuug-industry-")); vi.stubEnv("DEALDESK_DATA_DIR", folder); vi.stubEnv("DEMO_DATA", "false"); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(folder, { recursive: true, force: true }); });
const request = (industryId = "auto-repair", answers = {}, addedPacks: string[] = []) => ({ industryId, answers, addedPacks, templateName: "Independent Auto Repair", revision: 3 });
const ids = (input: unknown) => previewIndustry(input).shown.map(i => i.id);
it("installs all thirteen industries with 5–8 questions and valid tools for every capability pack", () => {
  expect(industries).toHaveLength(13);
  for (const template of industries) { expect(template.questions.length).toBeGreaterThanOrEqual(5); expect(template.questions.length).toBeLessThanOrEqual(8); expect(assembleIndustry(request(template.id)).setup.packs.length).toBeGreaterThan(0); }
  for (const pack of packs) for (const tool of pack.tools) expect(workspaceItems.some(i => i.id === tool), `${pack.id}:${tool}`).toBe(true);
});
it("selects distinct mechanic, restaurant and nonprofit workspaces", () => {
  const mechanic = ids(request()); expect(mechanic).toContain("module:vehicles"); expect(mechanic).toContain("module:vehicle-inspections"); expect(mechanic).toContain("module:parts-markups"); expect(mechanic).not.toContain("module:restaurant-menu"); expect(mechanic).not.toContain("nonprofit-donations"); expect(mechanic).not.toContain("territories"); expect(mechanic).not.toContain("production");
  const restaurant = ids(request("restaurant")); for (const id of ["module:restaurant-menu", "module:ingredient-inventory", "module:suppliers", "module:purchase-orders", "module:restaurant-recipes", "module:staff-shifts", "module:food-waste", "module:restaurant-reservations", "module:daily-close"]) expect(restaurant).toContain(id); expect(restaurant).not.toContain("module:vehicles"); expect(restaurant).not.toContain("nonprofit-donations");
  const nonprofit = ids(request("nonprofit")); for (const id of ["nonprofit-donations", "nonprofit-grants", "nonprofit-enrollment", "nonprofit-volunteers", "nonprofit-participants", "nonprofit-restrictions", "expenses", "nonprofit-reporting"]) expect(nonprofit).toContain(id); expect(nonprofit).not.toContain("module:restaurant-menu");
});
it("uses mechanic answers to change real capability defaults and connection guidance", () => {
  const result = previewIndustry(request("auto-repair", { appointments: false, parts: false, "job-time": false, "electronic-estimates": false, fleet: true, quickbooks: true }));
  const shown = result.shown.map(i => i.id); expect(shown).not.toContain("service-booking"); expect(shown).not.toContain("operations"); expect(shown).not.toContain("module:parts-markups"); expect(shown).not.toContain("timeclock"); expect(shown).not.toContain("service-time"); expect(shown).not.toContain("service-portal"); expect(shown).toContain("module:fleet-accounts"); expect(result.connections).toEqual(["quickbooks"]);
});
it("supports hybrid capabilities and individual overrides without exposing unselected profiles", () => {
  expect(ids(request("nonprofit", { merchandise: true }))).toContain("products"); expect(ids(request("restaurant", { catering: true }))).toContain("orders"); expect(ids(request("auto-repair", { "product-sales": true }))).toContain("products");
  const preview = previewIndustry(request()); applyIndustry(request(), preview.currentDigest, preview.proposedDigest);
  saveBranding({ featureVisibility: { production: true, "module:vehicles": false } }); const visible = visibleItems(getBranding()).map(i => i.id); expect(visible).toContain("production"); expect(visible).not.toContain("module:vehicles"); expect(visible).not.toContain("nonprofit-donations");
  const gym = previewIndustry(request("gym")); expect(gym.organizationTypes).not.toContain("nonprofit"); expect(gym.shown.map(i => i.id)).toContain("module:member-subscriptions"); expect(gym.shown.map(i => i.id)).not.toContain("nonprofit-donors");
});
it("binds apply to the reviewed configuration and preserves brand identity", () => {
  saveBranding({ businessName: "Joe’s HVAC", primaryColor: "#112233" }); const draft = previewIndustry(request("hvac"));
  saveBranding({ tagline: "Changed by another owner tab" }); expect(() => applyIndustry(request("hvac"), draft.currentDigest, draft.proposedDigest)).toThrow("changed");
  const current = previewIndustry(request("hvac")); applyIndustry(request("hvac"), current.currentDigest, current.proposedDigest); expect(getBranding().businessName).toBe("Joe’s HVAC"); expect(getBranding().primaryColor).toBe("#112233");
});
it("round-trips named industry revisions and module dependencies without credentials or records", () => {
  const input = request(), preview = previewIndustry(input); applyIndustry(input, preview.currentDigest, preview.proposedDigest); saveSecrets({ PRIVATE_PROVIDER_TOKEN: "synthetic-private-token" });
  const vehicles = moduleById("vehicles")!; addRecord(vehicles.id, vehicles.fields, { customer_id: "test-client", vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003 });
  const exported = exportBusinessTemplate(); expect(exported.name).toBe("Independent Auto Repair — v3"); expect(exported.version).toBe(2); expect(exported.requiredModules?.some(m => m.id === "vehicles")).toBe(true); expect(JSON.stringify(exported)).not.toContain("1HGCM82633A004352"); expect(JSON.stringify(exported)).not.toContain("synthetic-private-token");
  saveBranding({ industrySetup: null }); importBusinessTemplate(exported); expect(getBranding().industrySetup?.industryId).toBe("auto-repair"); expect(getBranding().industrySetup?.revision).toBe(3); expect(listRecords("vehicles")).toHaveLength(1);
  expect(() => importBusinessTemplate({ ...exported, requiredModules: [{ id: "missing-extension", version: "1.0.0" }] })).toThrow("Install module");
});
it("keeps industry module rows durable and imports legacy module records once", () => {
  const m = moduleById("restaurant-menu")!;
  writeFileSync(path.join(folder, "module-records.json"), JSON.stringify({ old: [{ id: "legacy1", values: { name: "Legacy" }, archived: false, createdAt: "2026-09-10", updatedAt: "2026-09-10" }] }));
  expect(listRecords("old")).toHaveLength(1);
  const row = addRecord(m.id, m.fields, { name: "Soup", category: "Lunch", price: 700, available: true }); updateRecord(m.id, row.id, m.fields, { name: "Soup", category: "Lunch", price: 800, available: false });
  writeFileSync(path.join(folder, "module-records.json"), "invalid legacy source after migration"); expect(listRecords(m.id)[0].values.price).toBe(800); expect(listRecords("old")).toHaveLength(1);
});
it("places restaurant specials under Marketing and follows the restaurant marketing answer", () => {
  expect(ids(request("restaurant", { promotions: true }))).toContain("restaurant-specials"); expect(ids(request("restaurant", { promotions: false }))).not.toContain("restaurant-specials"); expect(ids(request("auto-repair", {}))).not.toContain("restaurant-specials");
  expect(workspaceItems.find(i => i.id === "restaurant-specials")).toMatchObject({ group: "Marketing", section: "marketing", href: "/restaurant/specials" });
});
