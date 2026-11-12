/** Configure TateWay through Shuug's actual stdio MCP tools. This program never
 * writes business data directly, dispatches messages or configures providers. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Usage: node --import tsx scripts/tateway-mcp-setup.ts
  --url ORIGIN --data-dir ABSOLUTE_PRIVATE_DIR --plan PLAN.json --out NEW_RECEIPT.json [--apply]

Without --apply, reads the real MCP catalogs and previews the exact plan only.
With --apply, configures the reviewed plan and missing native TateWay intake,
follow-up, notification and invoicing settings. Existing owner settings and
provider connections are preserved. Outbound sending is never enabled here.
The selected private directory must already have native backend:setup access.
Use a new receipt filename for every run; partial progress is checkpointed.
`;
type ObjectValue = Record<string, unknown>;
type Options = { origin: string; directory: string; planFile: string; output: string; apply: boolean };
type Call = { name: string; at: string; status: "pending" | "completed" | "failed" };
type Step = { name: string; outcome: string; id?: string; detail?: string };
const origins = ["https://tatewayauto.com", "https://www.tatewayauto.com"];
const formTitle = "TateWay service request";
function object(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`The native ${label} response is incomplete. No replacement data was assumed.`);
  return value as ObjectValue;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`The native ${label} response is incomplete. No empty state was assumed.`);
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`The native ${label} response is missing its identifier.`);
  return value;
}
function revision(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`The native ${label} revision is unavailable.`);
  return Number(value);
}
function brandMode(value: unknown): "real" | "demo" | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (/^TateWay Auto(?: LLC)?$/i.test(name)) return "real";
  if (/^TateWay Auto(?: LLC)? - DEMO$/i.test(name)) return "demo";
  return null;
}
function parseArguments(args: string[]): Options | null {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(usage); return null; }
  const values = new Map<string, string>(); let apply = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--apply") { if (apply) throw new Error("Duplicate --apply option."); apply = true; continue; }
    if (!["--url", "--data-dir", "--plan", "--out"].includes(key) || values.has(key) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(usage);
    values.set(key, args[++index]);
  }
  const selected = values.get("--url"), directory = values.get("--data-dir"), planFile = values.get("--plan"), output = values.get("--out");
  if (!selected || !directory || !planFile || !output || !path.isAbsolute(directory)) throw new Error(usage);
  let url: URL; try { url = new URL(selected); } catch { throw new Error("Use an exact HTTPS origin, or HTTP on loopback. Never put credentials in the URL."); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use an exact HTTPS origin, or HTTP on loopback. Never put credentials in the URL.");
  return { origin: url.origin, directory: path.resolve(directory), planFile: path.resolve(planFile), output: path.resolve(output), apply };
}
function credentialFree(value: unknown) {
  if (Array.isArray(value)) { for (const item of value) credentialFree(item); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:password|secret|token|credential|private.?key|api.?key)/i.test(key)) throw new Error("The workspace plan must contain public business configuration only, without credential fields.");
    credentialFree(item);
  }
}
function sameOrigins(value: unknown) {
  const actual = array(value, "form origins");
  return actual.length === origins.length && origins.every(origin => actual.includes(origin));
}

async function main() {
  const parsedOptions = parseArguments(process.argv.slice(2)); if (!parsedOptions) return;
  const options: Options = parsedOptions;
  if (!existsSync(options.directory) || !statSync(options.directory).isDirectory()) throw new Error("Select the existing private directory initialized by backend:setup.");
  if (!existsSync(path.join(options.directory, "connections.enc")) || !existsSync(path.join(options.directory, "vault.key"))) throw new Error("Run native backend:setup for this private workspace first. No credential was printed.");
  if (existsSync(options.output)) throw new Error("Receipt already exists. Choose a new --out path; prior receipts are never overwritten.");
  const bytes = readFileSync(options.planFile); if (bytes.length > 32768) throw new Error("The public workspace plan exceeds 32 KiB.");
  let decoded: unknown;
  try { decoded = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("The reviewed workspace plan is not valid JSON."); }
  const plan = object(decoded, "workspace plan"); credentialFree(plan);
  const mode = brandMode(plan.businessName);
  if (!mode || object(plan.industry, "plan industry").industryId !== "auto-repair") throw new Error("This setup accepts only a reviewed TateWay Auto real or DEMO automotive plan.");
  process.env.DEALDESK_DATA_DIR = options.directory;
  const { readVault } = await import("../src/lib/connections/vault");
  // Read this directory's native encrypted vault only. An unrelated shell token
  // must never override the explicitly selected client's backend credential.
  if (!readVault().BACKEND_ACCESS_TOKEN) throw new Error("The selected native vault has no backend access credential. Run backend:setup first.");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"), path.join(root, "scripts/mcp-server.ts")], cwd: root,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...(process.env.HOME ? { HOME: process.env.HOME } : {}), ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      NODE_ENV: "production", DEALDESK_DATA_DIR: options.directory, SHUUG_BACKEND_URL: options.origin, SHUUG_BACKEND_TOKEN: "", BACKEND_ACCESS_TOKEN: "",
      DATABASE_URL: "", DEMO_DATA: "false", NEXT_TELEMETRY_DISABLED: "1" }, stderr: "pipe" });
  const client = new Client({ name: "tateway-native-mcp-setup", version: "1.0.0" });
  const receipt: ObjectValue & { calls: Call[]; steps: Step[] } = { version: 1, kind: "tateway-native-mcp-setup", status: "connecting", apply: options.apply,
    backendOrigin: options.origin, planSha256: createHash("sha256").update(bytes).digest("hex"), businessName: plan.businessName,
    startedAt: new Date().toISOString(), calls: [], steps: [], limits: ["No providers were connected and no outbound send switch was changed.", "This setup does not dispatch messages, run workers, create repair approvals or initiate payments.", "Public HTTPS, website routing and real provider delivery/payment verification remain separate acceptance gates."] };
  mkdirSync(path.dirname(options.output), { recursive: true, mode: 0o700 });
  writeFileSync(options.output, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  function checkpoint() {
    const temporary = `${options.output}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" }); renameSync(temporary, options.output);
  }
  async function call(name: string, args: ObjectValue = {}) {
    const entry: Call = { name, at: new Date().toISOString(), status: "pending" }; receipt.calls.push(entry); checkpoint();
    process.stderr.write(`Shuug MCP → ${name}\n`);
    try {
      const response = await client.callTool({ name, arguments: args });
      if (response.isError) throw new Error("Native operation rejected.");
      const content = response.content as { type: string; text?: string }[];
      const result: unknown = JSON.parse(content.filter(item => item.type === "text").map(item => item.text ?? "").join("\n"));
      entry.status = "completed"; checkpoint(); return result;
    } catch { entry.status = "failed"; checkpoint(); throw new Error(`Native MCP ${name} failed. Inspect the selected workspace and private receipt before retrying with a new receipt path.`); }
  }
  async function business(resource: string) { return object(await call("business_read", { resource }), resource).data; }
  function empty(value: unknown, label: string) { if (array(value, label).length) throw new Error(`The default workspace already contains ${label}. Refusing to rename or configure another business.`); }
  try {
    await client.connect(transport); transport.stderr?.on("data", () => { /* Do not forward credential-bearing child diagnostics. */ });
    receipt.server = client.getServerVersion();
    const tools = await client.listTools(); receipt.toolCount = tools.tools.length;
    for (const required of ["business_capabilities", "shopify_status", "workspace_catalog", "shop_catalog", "workspace_preview", "workspace_apply", "website_read", "website_command", "shop_read", "shop_command", "communications_read", "workflow_records", "billing_read", "business_read", "trackers_list"]) {
      if (!tools.tools.some(tool => tool.name === required)) throw new Error("This running Shuug build lacks the native automotive setup tools. Build and install the automation release first.");
    }
    await call("business_capabilities"); const shopify = object(await call("shopify_status"), "Shopify status");
    const catalog = object(await call("workspace_catalog"), "workspace catalog"); await call("shop_catalog");
    const current = object(catalog.current, "current workspace"), currentMode = brandMode(current.businessName);
    const website = object(await call("website_read"), "website state"), shop = object(await call("shop_read"), "shop state");
    const communications = object(await call("communications_read"), "communications state");
    const settings = object(shop.settings, "shop settings"), invoicing = object(shop.invoicing, "invoice settings");
    if (currentMode && currentMode !== mode) throw new Error("Real and DEMO TateWay workspaces cannot be renamed into one another. Select the matching reviewed plan.");
    if (!currentMode) {
      if (current.businessName !== "Shuug" || current.industrySetup || current.workspaceLayout) throw new Error("This is not an existing TateWay workspace or a pristine default installation. Refusing to rename another business.");
      if (shopify.enabled || shopify.connected || shopify.shop) throw new Error("The default workspace already has a commerce connection. Refusing to repurpose it.");
      empty(await call("workflow_records"), "service/nonprofit records");
      for (const key of ["forms", "submissions", "workflows", "runs"]) empty(website[key], `website ${key}`);
      for (const key of ["messages", "consents", "inbound"]) empty(communications[key], `communication ${key}`);
      const connections = object(communications.connections, "communication connections");
      if (connections.enabled || object(connections.email, "email connection").configured || object(connections.sms, "SMS connection").configured || revision(settings.revision, "automation") || revision(invoicing.revision, "invoicing")) throw new Error("The default workspace has existing provider or owner automation settings. Refusing to repurpose it.");
      empty(await business("vehicles"), "vehicles"); empty(await call("trackers_list"), "custom trackers");
      for (const resource of ["customers", "orders", "products", "vendors", "expenses", "inventory"]) empty(object(await business(resource), resource)[resource], resource);
      const billing = object(await call("billing_read", { bookId: "office" }), "office books");
      for (const key of ["entries", "billing", "statements", "invoiceDeliveries"]) empty(billing[key], `accounting ${key}`);
      if (object(billing.paymentConnection, "payment connection").enabled || object(billing.deliveryConnection, "invoice delivery").ready || array(billing.accounts, "accounts").some(item => { const account = object(item, "account"); return !account.system || account.revision !== 1; })) throw new Error("The default workspace has existing financial configuration. Refusing to repurpose it.");
      const staff = object(await business("staff-schedule"), "staff schedule");
      for (const key of ["shifts", "entries", "absences", "audit"]) empty(staff[key], `staff ${key}`);
      if (array(staff.team, "staff team").some(item => object(item, "team member").id !== "owner")) throw new Error("The default workspace has an existing team. Refusing to repurpose it.");
      const pricing = object(await business("auto-repair-pricing"), "repair pricing");
      for (const key of ["books", "estimates", "inspections", "vehicles", "clients"]) empty(pricing[key], `repair ${key}`);
      const inspections = object(await business("auto-repair-inspections"), "repair inspections");
      for (const key of ["templates", "inspections", "jobs", "vehicles", "timeCosts"]) empty(inspections[key], `inspection ${key}`);
      receipt.steps.push({ name: "workspace-guard", outcome: "pristine-default-verified" });
    } else receipt.steps.push({ name: "workspace-guard", outcome: `existing-tateway-${currentMode}` });
    const preview = object(await call("workspace_preview", plan), "workspace preview");
    const currentDigest = text(preview.currentDigest, "current digest"), proposedDigest = text(preview.proposedDigest, "proposed digest");
    if (![currentDigest, proposedDigest].every(digest => /^[a-f0-9]{64}$/.test(digest))) throw new Error("The native workspace preview did not return valid review digests.");
    receipt.preview = { currentDigest, proposedDigest, unsupportedRequests: preview.unsupportedRequests, requiredCapabilities: preview.requiredCapabilities, requestedGoalComplete: preview.requestedGoalComplete };
    receipt.outboundSendingBefore = object(communications.connections, "communication connections").enabled;
    if (!options.apply) {
      receipt.steps.push({ name: "setup", outcome: "preview-only", detail: "No apply, form save, workflow test/enable or settings command was invoked." });
    } else {
      receipt.status = "applying"; checkpoint();
      const applied = object(await call("workspace_apply", { plan, currentDigest, proposedDigest }), "workspace apply");
      receipt.steps.push({ name: "workspace", outcome: applied.duplicate ? "already-configured" : "applied", id: text(object(applied.receipt, "workspace receipt").id, "workspace receipt") }); checkpoint();
      const forms = array(website.forms, "website forms").map(item => object(item, "form")), matches = forms.filter(form => form.title === formTitle);
      if (matches.length > 1) throw new Error("Multiple TateWay service forms use the setup title. Review them instead of creating a duplicate.");
      let form: ObjectValue;
      if (matches.length) {
        form = matches[0];
        if (form.kind !== "auto-repair" || !sameOrigins(form.origins)) throw new Error("The existing TateWay service form has owner-selected type or origins. It was preserved; review it before continuing.");
        receipt.steps.push({ name: "intake-form", outcome: form.enabled ? "reused" : "preserved-paused", id: text(form.id, "form") });
      } else {
        if (forms.some(form => form.kind === "auto-repair")) throw new Error("An owner-configured automotive form already exists under another title. It was preserved; review which form to use.");
        form = object(await call("website_command", { action: "form.save", input: { title: formTitle, kind: "auto-repair", origins, enabled: true } }), "saved intake form");
        receipt.steps.push({ name: "intake-form", outcome: "created", id: text(form.id, "form") });
      }
      checkpoint(); const formId = text(form.id, "form");
      if (form.enabled !== true) receipt.steps.push({ name: "follow-up-workflow", outcome: "preserved-paused", detail: "The existing owner-paused intake form was not enabled." });
      else {
        const existing = array(website.workflows, "website workflows").map(item => object(item, "workflow")).filter(workflow => workflow.formId === formId);
        if (existing.length) receipt.steps.push({ name: "follow-up-workflow", outcome: existing.some(workflow => workflow.enabled === true) ? "reused" : "preserved-paused", detail: "Existing owner instructions, assignees and destinations were preserved." });
        else {
          const workflow = { name: "TateWay service request follow-up", formId, taskTitle: "Review TateWay service request", assigneeId: null, priority: "high", channels: [] };
          const tested = object(await call("website_command", { action: "workflow.test", input: workflow }), "workflow test");
          const enabled = object(await call("website_command", { action: "workflow.enable", input: { workflow, testId: text(tested.testId, "workflow test") } }), "enabled workflow");
          receipt.steps.push({ name: "follow-up-workflow", outcome: "tested-and-enabled", id: text(enabled.id, "workflow") });
        }
      }
      checkpoint();
      if (revision(settings.revision, "automation") === 0) {
        await call("shop_command", { action: "automation.configure", input: { revision: 0, reviewed: true, enabled: true, bookingConfirmations: true, appointmentReminders: true, jobUpdates: true, reminderHours: 24, timeZone: "America/New_York" } });
        receipt.steps.push({ name: "notifications", outcome: "configured" });
      } else receipt.steps.push({ name: "notifications", outcome: "preserved-owner-settings" });
      checkpoint();
      if (revision(invoicing.revision, "invoicing") === 0) {
        await call("shop_command", { action: "invoicing.configure", input: { revision: 0, reviewed: true, enabled: true, emailOnIssue: true, dueDays: 7, linkDays: 30 } });
        receipt.steps.push({ name: "invoicing", outcome: "configured" });
      } else receipt.steps.push({ name: "invoicing", outcome: "preserved-owner-settings" });
      checkpoint();
      const verifiedSite = object(await call("website_read"), "verified website"), verifiedShop = object(await call("shop_read"), "verified shop");
      const verifiedComms = object(await call("communications_read"), "verified communications");
      const outboundAfter = object(verifiedComms.connections, "verified connections").enabled;
      if (outboundAfter !== receipt.outboundSendingBefore) throw new Error("The outbound sending switch changed concurrently. Review workspace configuration; this script did not modify it.");
      const verifiedForms = array(verifiedSite.forms, "verified forms").map(item => object(item, "verified form"));
      if (verifiedForms.filter(item => item.id === formId && item.kind === "auto-repair" && sameOrigins(item.origins)).length !== 1) throw new Error("The native intake form changed during setup. Review the saved receipt before continuing.");
      receipt.verification = { formId, publicFormPath: `/api/website/forms/${formId}`, formEnabled: form.enabled === true,
        matchingFormCount: verifiedForms.filter(item => item.title === formTitle).length,
        workflowCount: array(verifiedSite.workflows, "verified workflows").filter(item => object(item, "verified workflow").formId === formId).length,
        automationRevision: object(verifiedShop.settings, "verified automation").revision, automationEnabled: object(verifiedShop.settings, "verified automation").enabled,
        invoicingRevision: object(verifiedShop.invoicing, "verified invoicing").revision, invoicingEnabled: object(verifiedShop.invoicing, "verified invoicing").enabled,
        outboundSendingUnchanged: true, outboundSendingEnabled: outboundAfter };
    }
    receipt.status = options.apply ? "completed" : "previewed"; receipt.finishedAt = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify({ status: receipt.status, businessName: plan.businessName, backendOrigin: options.origin, receipt: options.output,
      preview: receipt.preview, steps: receipt.steps, verification: receipt.verification, limits: receipt.limits }, null, 2));
  } catch (error) {
    receipt.status = "needs-review"; receipt.finishedAt = new Date().toISOString(); receipt.error = error instanceof Error ? error.message : "Native MCP setup failed."; checkpoint(); throw error;
  } finally { await client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "TateWay MCP setup failed. No credential was printed."); process.exitCode = 1; });
