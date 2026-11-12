// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "../backend/mcp";
import { executeOperation } from "../backend/service";
import { backendHandler } from "../backend/http";
import { getBranding, saveBranding } from "../branding/store";
import { saveSecrets } from "../connections/vault";
import { createRole } from "../permissions/store";
import { workspaceDatabase } from "../workspace/database";
import { listBusinessRecords, saveBusinessRecord } from "../workspace/store";
import { secureTaxRequired } from "../secure-tax/policy";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { toolLinks } from "../features/store";
import { previewWorkspace, applyWorkspace, workspaceCatalog, workspaceCapabilityIds } from "./mcp-builder";

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "shuug-builder-mcp-"));
  vi.stubEnv("DEALDESK_DATA_DIR", folder); vi.stubEnv("DEMO_DATA", "false");
  vi.stubEnv("BACKEND_ACCESS_TOKEN", "synthetic-builder-token"); vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(folder, { recursive: true, force: true }); });
const plan = () => ({
  description: "A small tax and accounting firm needs client intake, bookkeeping, complete tax return forms and e-filing.",
  businessName: "Synthetic Tax Firm",
  industry: { industryId: "tax-firm", answers: { appointments: false, portal: false, staff: false, quarterly: true, rideshare: false, quickbooks: false, marketing: false }, templateName: "Synthetic tax and accounting", revision: 1 },
  layout: { homeToolId: "tax-office", primaryToolIds: ["tax-office", "service-clients", "client-books", "tax-documents"] },
  visibleToolIds: ["tax-office", "service-clients", "client-books", "tax-documents", "module:tax-engagements", "module:tax-document-requests", "website-setup", "branding", "roles", "backend"],
});
const command = (value = plan()) => { const preview = previewWorkspace(value); return { plan: value, currentDigest: preview.currentDigest, proposedDigest: preview.proposedDigest }; };

it("previews only installed tools without writes and discloses the unsupported requested tax engine", () => {
  const before = readdirSync(folder), catalog = workspaceCatalog(), preview = previewWorkspace(plan());
  expect(readdirSync(folder)).toEqual(before);
  expect(catalog.industries.some(item => item.id === "tax-firm")).toBe(true);
  expect(catalog.tools.some(item => item.id === "tax-office" && item.href === "/tax-office")).toBe(true);
  expect(catalog.tools.find(item => item.id === "tax-documents")?.requiredToolIds).toEqual(["module:tax-engagements", "module:tax-document-requests"]);
  expect(preview.visibleTools.map(item => item.id).sort()).toEqual(plan().visibleToolIds.sort());
  expect(preview.hiddenToolIds).toContain("pipeline"); expect(preview.hiddenToolIds).toContain("orders");
  expect(preview.unsupportedRequests.map(item => item.id)).toEqual(["tax-return-calculation", "tax-return-forms", "tax-efile-transmission"]);
  expect(preview.interpretation).toContain("does not generate code");
});

it("refuses an explicit whitelist missing a tool dependency without changing the current configuration", () => {
  saveBranding({ businessName: "Existing firm", tagline: "Preserve this configuration" });
  const before = getBranding(), beforeBytes = readFileSync(path.join(folder, "branding.json")), reviewed = command();
  for (const dependency of ["module:tax-engagements", "module:tax-document-requests"]) {
    const invalid = { ...reviewed.plan, visibleToolIds: reviewed.plan.visibleToolIds.filter(id => id !== dependency) };
    expect(() => previewWorkspace(invalid)).toThrow(`requires visible tools: ${dependency}`);
    expect(() => applyWorkspace({ ...reviewed, plan: invalid })).toThrow("Add these exact IDs to visibleToolIds");
    expect(getBranding()).toEqual(before);
    expect(readFileSync(path.join(folder, "branding.json"))).toEqual(beforeBytes);
  }
  const valid = applyWorkspace(reviewed);
  expect(valid.applied).toBe(true);
  expect(valid.visibleTools.find(item => item.id === "tax-office")?.requiredToolIds).toEqual(["module:tax-engagements", "module:tax-document-requests"]);
  expect(valid.visibleTools.map(item => item.id)).toEqual(expect.arrayContaining(["tax-documents", "module:tax-engagements", "module:tax-document-requests"]));
});

it("rejects unknown, invisible, cross-profile and duplicate tool selections and strict plan extensions", () => {
  const input = plan();
  expect(() => previewWorkspace({ ...input, visibleToolIds: [...input.visibleToolIds, "invented-tax-engine"] })).toThrow("not installed");
  expect(() => previewWorkspace({ ...input, visibleToolIds: input.visibleToolIds.filter(id => id !== "tax-office") })).toThrow("visible workspace destination");
  expect(() => previewWorkspace({ ...input, visibleToolIds: [...input.visibleToolIds, "nonprofit-donors"] })).toThrow("industry profiles");
  expect(() => previewWorkspace({ ...input, visibleToolIds: [...input.visibleToolIds, "tax-office"] })).toThrow("unique");
  expect(() => previewWorkspace({ ...input, shellCommand: "never executed" })).toThrow();
  expect(() => previewWorkspace({ ...input, layout: { homeToolId: "tax-office", primaryToolIds: ["client-books"] } })).toThrow("home tool");
  expect(() => workspaceCatalog({ extra: true })).toThrow();
});

it("retains every required filing, billing and portal capability without claiming configuration or live-provider proof", () => {
  const input = { ...plan(), requiredCapabilityIds: [...workspaceCapabilityIds] }, catalog = workspaceCatalog(), preview = previewWorkspace(input);
  expect(catalog.capabilities.map(capability => capability.id)).toEqual([...workspaceCapabilityIds]);
  expect(preview.requiredCapabilities.map(capability => capability.id)).toEqual([...workspaceCapabilityIds]);
  expect(preview.requiredCapabilities.find(capability => capability.id === "invoice-delivery")).toMatchObject({ status: "implemented", requiresConfiguration: true, configured: false, liveVerification: false });
  expect(preview.requiredCapabilities.find(capability => capability.id === "online-invoice-payments")).toMatchObject({ status: "implemented", requiresConfiguration: true, configured: null, liveVerification: false });
  expect(preview.requiredCapabilities.find(capability => capability.id === "client-business-live-view")).toMatchObject({ status: "partial", liveVerification: false });
  expect(preview.requiredCapabilities.find(capability => capability.id === "tax-return-calculation")).toMatchObject({ status: "partial", configured: false, liveVerification: false });
  expect(preview.requiredCapabilities.find(capability => capability.id === "tax-return-forms")).toMatchObject({ status: "partial", configured: false });
  const unsupported = preview.unsupportedRequests.map(capability => capability.id);
  expect(new Set(unsupported).size).toBe(unsupported.length);
  expect(unsupported).toEqual(expect.arrayContaining(["tax-return-calculation", "tax-return-forms", "tax-efile-transmission", "client-portal-bulk-uploads", "client-business-live-view"]));
  expect(preview.requestedGoalComplete).toBe(false);
  const applied = applyWorkspace(command(input));
  expect(applied.receipt.plan.requiredCapabilityIds).toEqual([...workspaceCapabilityIds]);
  expect(applied.receipt.requestedGoalComplete).toBe(false);
  expect(() => previewWorkspace({ ...input, requiredCapabilityIds: ["invented-tax-engine"] })).toThrow();
});

it("applies through a genuine MCP session, persists a business-context receipt and preserves records, roles, credentials and enrollment", async () => {
  saveBranding({ businessName: "Before", primaryColor: "#112233", logoText: "BT", tagline: "Existing identity" });
  const record = saveBusinessRecord({ kind: "client", title: "Private fixture client", fields: { email: "synthetic@example.test" } }, "Fixture");
  createRole("Synthetic reviewer"); saveSecrets({ SYNTHETIC_PROVIDER_TOKEN: "never-returned-builder-secret" });
  workspaceDatabase(db => { db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT,clientId TEXT,status TEXT)"); db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,'active')").run("synthetic-account", record.id); }, true);
  const protectedFiles = ["permissions.json", "vault.key", "connections.enc"].map(name => [name, readFileSync(path.join(folder, name))] as const);
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "workspace-builder-test", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args }); expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  try {
    await server.connect(a); await client.connect(b);
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(53);
    expect(tools.find(item => item.name === "workspace_preview")?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(tools.find(item => item.name === "workspace_apply")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: false });
    const catalog = await call("workspace_catalog"); expect(catalog.tools.some((item: { id: string }) => item.id === "client-books")).toBe(true);
    const preview = await call("workspace_preview", plan()), input = { plan: plan(), currentDigest: preview.currentDigest, proposedDigest: preview.proposedDigest };
    const result = await call("workspace_apply", input);
    expect(result).toMatchObject({ applied: true, duplicate: false, branding: { businessName: "Synthetic Tax Firm", primaryColor: "#112233", tagline: "Existing identity", workspaceLayout: plan().layout } });
    expect(result.receipt.businessContext).toBe(plan().description);
    const repeated = await call("workspace_apply", input); expect(repeated.duplicate).toBe(true); expect(repeated.receipt).toEqual(result.receipt);
    expect(getBranding().industrySetup?.industryId).toBe("tax-firm");
    expect(visibleItems(getBranding(), catalogWithTools(toolLinks(), getBranding())).map(item => item.id).sort()).toEqual(plan().visibleToolIds.sort());
    expect(listBusinessRecords()).toEqual([record]); expect(secureTaxRequired({ clientId: record.id })).toBe(true);
    for (const [name, original] of protectedFiles) expect(readFileSync(path.join(folder, name))).toEqual(original);
    expect(JSON.stringify(result)).not.toContain("never-returned-builder-secret");
    expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM documents WHERE kind='workspace-build'").get())).toMatchObject({ n: 1 });
  } finally { await client.close(); await server.close(); }
});

it("rejects stale branding, changed context or visibility, and replay after a later owner edit", () => {
  const original = command(); saveBranding({ tagline: "Another owner edited this" });
  expect(() => applyWorkspace(original)).toThrow("reviewed workspace plan changed");
  const current = command();
  expect(() => applyWorkspace({ ...current, plan: { ...current.plan, description: "Changed business context" } })).toThrow("reviewed workspace plan changed");
  expect(() => applyWorkspace({ ...current, plan: { ...current.plan, visibleToolIds: [...current.plan.visibleToolIds, "tasks"] } })).toThrow("reviewed workspace plan changed");
  expect(applyWorkspace(current).applied).toBe(true); saveBranding({ businessName: "Later owner update" });
  expect(() => applyWorkspace(current)).toThrow("configuration changed");
  expect(getBranding().businessName).toBe("Later owner update");
});

it("uses the existing authenticated backend boundary for configuration mutations", async () => {
  const input = command();
  const request = (bearer: string, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/backend", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "workspace_apply", arguments: input }) });
  expect((await backendHandler(request("invalid"))).status).toBe(401);
  expect((await backendHandler(request("synthetic-builder-token", "https://attacker.test"))).status).toBe(403);
  expect(getBranding().businessName).toBe("Shuug");
  const response = await backendHandler(request("synthetic-builder-token")); expect(response.status).toBe(200);
  expect((await response.json()).data.applied).toBe(true);
});
