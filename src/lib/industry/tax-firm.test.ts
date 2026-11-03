// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { previewIndustry } from "./service";
import { rideshareTaxProsTemplate } from "./rideshare-tax-pros";
import { importBusinessTemplate, exportBusinessTemplate, previewBusinessTemplate } from "../branding/templates";
import { getBranding } from "../branding/store";
import { visibleItems, catalogWithTools } from "../navigation/catalog";
import { moduleById } from "../sdk/registry";
import { addRecord, listRecords } from "../sdk/records";
import { saveSecrets } from "../connections/vault";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-tax-firm-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("configures a tax firm using existing services and keeps rideshare optional", () => {
  const request = { industryId: "tax-firm", answers: {}, templateName: "Independent firm", revision: 1 };
  const standard = previewIndustry(request).shown.map(item => item.id);
  for (const id of ["module:tax-engagements", "module:tax-document-requests", "module:tax-filing-handoffs", "module:tax-quarterly-reviews", "service-clients", "service-billing", "service-portal", "timeclock"]) expect(standard).toContain(id);
  for (const id of ["module:rideshare-tax-records", "module:vehicles", "module:restaurant-menu", "nonprofit-donations"]) expect(standard).not.toContain(id);
  const rideshare = previewIndustry({ ...request, answers: { rideshare: true, quarterly: false } }).shown.map(item => item.id);
  expect(rideshare).toContain("module:rideshare-tax-records"); expect(rideshare).not.toContain("module:tax-quarterly-reviews");
});

it("imports an actual branded template, persists tax work and exports no private client data", () => {
  previewBusinessTemplate(rideshareTaxProsTemplate);
  importBusinessTemplate(rideshareTaxProsTemplate); importBusinessTemplate(rideshareTaxProsTemplate);
  expect(getBranding()).toMatchObject({ businessName: "Rideshare Tax Pros", organizationTypes: ["service"], primaryColor: "#9425e8" });
  const shown = visibleItems(getBranding(), catalogWithTools()).map(item => item.id);
  for (const requirement of rideshareTaxProsTemplate.requiredModules) expect(shown).toContain(`module:${requirement.id}`);
  const module = moduleById("tax-engagements")!;
  const row = addRecord(module.id, module.fields, { name: "Synthetic client engagement", client_id: "synthetic-client", tax_year: 2025, stage: "Awaiting documents", accountant: "Synthetic accountant" });
  expect(listRecords(module.id).find(record => record.id === row.id)?.values.stage).toBe("Awaiting documents");
  expect(existsSync(path.join(directory, "workspace.sqlite"))).toBe(true);
  saveSecrets({ PRIVATE_TEST_TOKEN: "synthetic-do-not-export" });
  const exported = exportBusinessTemplate();
  expect(exported.requiredModules).toEqual(expect.arrayContaining(rideshareTaxProsTemplate.requiredModules));
  expect(JSON.stringify(exported)).not.toContain("synthetic-client");
  expect(JSON.stringify(exported)).not.toContain("synthetic-do-not-export");
  const nextFirm = mkdtempSync(path.join(tmpdir(), "shuug-next-tax-firm-"));
  try {
    vi.stubEnv("DEALDESK_DATA_DIR", nextFirm); importBusinessTemplate(exported);
    expect(getBranding().industrySetup?.industryId).toBe("tax-firm");
    expect(listRecords(module.id)).toHaveLength(0);
  } finally { rmSync(nextFirm, { recursive: true, force: true }); }
});

it("retains optional external filing references as staff records without a filing action", () => {
  const module = moduleById("tax-filing-handoffs")!;
  expect(() => addRecord(module.id, module.fields, { name: "Bad", client_id: "client", engagement_id: "engagement", tax_year: 2025, engine: "Drake", status: "Automatically filed" })).toThrow();
  const row = addRecord(module.id, module.fields, { name: "Synthetic handoff", client_id: "client", engagement_id: "engagement", tax_year: 2025, engine: "Other external preparer", status: "Acknowledgment pending", external_reference: "synthetic-external-reference" });
  expect(listRecords(module.id)[0].id).toBe(row.id);
  expect(module.description).toContain("never submits a return");
});
