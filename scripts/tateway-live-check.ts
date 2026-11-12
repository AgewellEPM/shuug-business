/** Live compiled acceptance. All business mutations travel through genuine MCP
 * or native HTTP endpoints; only synthetic private receipts are written here. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Obj = Record<string, unknown>;
type NativeRecord = { id: string; kind: string; title: string; currency: string; status: string; revision: number; fields: Record<string, string | number | boolean>; computed?: Obj };
type State = { version: number; origin: string; directory: string; build: string; runId: string; startedAt: string; requests: Record<string, Obj>; results: Record<string, unknown>; checks: string[]; payload?: Record<string, string>; error?: string };
const origin = "http://127.0.0.1:3134", build = "XYICSTwCjq6Evnr_mCVFC";
const directory = "/Users/lukekist/.shuug-workspaces/tateway-acceptance-20261112";
const formId = "b5a237e9-5ac7-4b83-98cf-5c22985391de";
const object = (value: unknown) => { assert(value && typeof value === "object" && !Array.isArray(value), "Native response must be an object."); return value as Obj; };
const list = (value: unknown) => { assert(Array.isArray(value), "Native response must be an array."); return value as unknown[]; };
const id = (value: unknown) => { assert(typeof value === "string" && value, "Native identifier is missing."); return value; };

async function main() {
  if (process.argv.includes("--help")) { console.log("Run with node --import tsx scripts/tateway-live-check.ts. This helper targets only the dedicated loopback3134 acceptance workspace; it resumes its private checkpoint."); return; }
  assert.equal(process.argv.length, 2, "No target overrides are accepted by this fixture.");
  assert.equal(path.basename(directory), "tateway-acceptance-20261112");
  process.env.DEALDESK_DATA_DIR = directory;
  const { readVault } = await import("../src/lib/connections/vault");
  function guardedVault() {
    const vault = readVault();
    for (const key of ["MAILGUN_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) assert(!vault[key], "Provider credentials are forbidden in live acceptance.");
    assert.notEqual(vault.COMMUNICATIONS_SEND_ENABLED, "true", "Outbound sending must stay disabled.");
    assert(vault.BACKEND_ACCESS_TOKEN && vault.WORKSPACE_ACCESS_TOKEN, "The dedicated fixture's native MCP and owner gateway must already be configured.");
    assert.equal(vault.APP_BASE_URL || origin, origin, "The fixture origin must stay on the existing acceptance server.");
    return vault;
  }
  const vault = guardedVault(), ownerKey = vault.WORKSPACE_ACCESS_TOKEN;
  const receipts = path.join(directory, "receipts"); mkdirSync(receipts, { recursive: true, mode: 0o700 });
  const stateFile = path.join(receipts, "compiled-live-state.json"), summaryFile = path.join(receipts, "compiled-live-verification.json");
  const state: State = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { version: 1, origin, directory, build, runId: randomUUID(), startedAt: new Date().toISOString(), requests: {}, results: {}, checks: [] };
  assert.equal(state.origin, origin); assert.equal(state.directory, directory); assert.equal(state.build, build);
  const marker = `DEMO acceptance ${state.runId.slice(0, 8)}`;
  function save() { const temporary = `${stateFile}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600, flag: "wx" }); renameSync(temporary, stateFile); }
  save();
  function check(label: string) { if (!state.checks.includes(label)) state.checks.push(label); save(); }
  async function once<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (Object.hasOwn(state.results, key)) return state.results[key] as T;
    const value = await operation(); state.results[key] = value; save(); return value;
  }
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const client = new Client({ name: "tateway-compiled-live-acceptance", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"), path.join(root, "scripts/mcp-server.ts")], cwd: root,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...(process.env.HOME ? { HOME: process.env.HOME } : {}), NODE_ENV: "production", DEALDESK_DATA_DIR: directory,
      SHUUG_BACKEND_URL: origin, SHUUG_BACKEND_TOKEN: "", BACKEND_ACCESS_TOKEN: "", DATABASE_URL: "", DEMO_DATA: "false", NEXT_TELEMETRY_DISABLED: "1" }, stderr: "pipe" });
  async function call(name: string, args: Obj = {}) {
    guardedVault(); const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      state.results.lastNativeError = { name, content: result.content }; save();
      throw new Error(`Native MCP ${name} rejected the fixture. Details remain in its private checkpoint.`);
    }
    return JSON.parse((result.content as { type: string; text?: string }[]).filter(item => item.type === "text").map(item => item.text ?? "").join("\n")) as unknown;
  }
  async function mutate<T>(key: string, name: string, prepare: () => Obj): Promise<T> {
    return once(key, async () => {
      const request = state.requests[key] ?? { name, arguments: prepare() }; assert.equal(request.name, name); state.requests[key] = request; save();
      return await call(name, object(request.arguments)) as T;
    });
  }
  async function http(route: string, options: { body?: unknown; owner?: boolean; requestOrigin?: string; form?: boolean } = {}) {
    guardedVault(); assert(route.startsWith("/") && !route.startsWith("//"), "Only the existing fixture server may be fetched.");
    return fetch(origin + route, { method: options.body === undefined ? "GET" : "POST", headers: {
      ...(options.owner ? { Authorization: `Bearer ${ownerKey}` } : {}), ...(options.requestOrigin ? { Origin: options.requestOrigin } : {}),
      ...(options.body !== undefined ? { "Content-Type": options.form ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
      ...(options.body !== undefined ? { body: options.form ? new URLSearchParams(options.body as Record<string, string>) : JSON.stringify(options.body) } : {}), redirect: "manual", signal: AbortSignal.timeout(30000) });
  }
  async function records() { return await call("workflow_records") as NativeRecord[]; }
  async function record(recordId: string) { const found = (await records()).find(row => row.id === recordId); assert(found, "Expected native fixture record missing."); return found; }
  const create = (key: string, kind: string, fields: NativeRecord["fields"]) => mutate<NativeRecord>(key, "workflow_save", () => ({ requestId: randomUUID(), kind, title: `${marker} ${kind}`, currency: "USD", fields }));
  const go = (key: string, row: NativeRecord, target: string) => mutate<NativeRecord>(key, "workflow_transition", () => ({ id: row.id, revision: row.revision, target, commandId: randomUUID() }));
  async function edit(key: string, row: NativeRecord, patch: NativeRecord["fields"]) {
    return once(key, async () => {
      const current = await record(row.id);
      if (Object.entries(patch).every(([field, value]) => current.fields[field] === value)) return current;
      return mutate<NativeRecord>(`${key}:save`, "workflow_save", () => ({ id: current.id, revision: current.revision, kind: current.kind, title: current.title, currency: current.currency, fields: { ...current.fields, ...patch } }));
    });
  }
  try {
    await client.connect(transport); transport.stderr?.on("data", () => {});
    assert.equal((await client.listTools()).tools.length, 53); await call("business_capabilities"); await call("shopify_status");
    const catalog = object(await call("workspace_catalog")); assert.equal(object(catalog.current).businessName, "TateWay Auto LLC");
    await call("shop_catalog"); await call("workflow_catalog"); await call("repair_catalog");
    const commsBefore = object(await call("communications_read")), connections = object(commsBefore.connections);
    assert.equal(connections.enabled, false); assert.equal(object(connections.email).configured, false); assert.equal(object(connections.sms).configured, false);
    const initial = await records(); assert(initial.every(row => row.title.includes(marker)), "This acceptance workspace contains unrelated business records; refusing mutation.");
    const initialSite = object(await call("website_read"));
    assert(list(initialSite.submissions).every(item => String(object(item).name).includes(marker)), "Unrelated website submissions found.");
    const forms = list(initialSite.forms).map(object); assert(forms.some(form => form.id === formId && form.kind === "auto-repair" && form.enabled === true));
    check("53 actual stdio MCP tools route into the compiled native backend");
    await once("owner-boundaries", async () => {
      const deniedPage = await http("/shop"); assert([303, 307].includes(deniedPage.status)); assert(deniedPage.headers.get("location")?.includes("/api/auth/login"));
      assert.equal((await http("/api/communications")).status, 403); assert.equal((await http("/api/shop-invoicing")).status, 403);
      const allowed = await http("/shop", { owner: true }), html = await allowed.text(); assert.equal(allowed.status, 200); assert(html.includes("Shop operations"));
      assert(html.includes(build), "Rendered app does not identify the expected compiled build.");
      assert.equal((await http("/api/communications", { owner: true, requestOrigin: "https://foreign.example.invalid", body: { command: "dispatch", limit: 20 } })).status, 403);
      check("compiled owner page/API require authorization and reject foreign-origin mutations"); return { compiledBuild: build };
    });
    if (!state.payload) {
      const response = await http(`/api/website/forms/${formId}`), html = await response.text(); assert.equal(response.status, 200);
      assert(response.headers.get("content-security-policy")?.includes("https://www.tatewayauto.com"));
      const proof = html.match(/name="proof" value="([^"]+)"/)?.[1], consentVersion = html.match(/name="smsConsentVersion" value="([^"]+)"/)?.[1]; assert(proof && consentVersion);
      state.payload = { proof, name: `${marker} customer`, email: "demo.acceptance@example.invalid", phone: "860-555-0111", message: `${marker}. SYNTHETIC service request; no real repair, message delivery or payment is authorized.`,
        vehicleYear: "2003", vehicleMake: "Honda", vehicleModel: "Accord", vehicleVin: "1HGCM82633A004352", vehiclePlate: "DEMO-ONLY", vehicleOdometer: "84500",
        requestedDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), consent: "yes", smsConsent: "yes", smsConsentVersion: consentVersion, website: "" }; save();
    }
    await once("intake-post", async () => {
      assert.equal((await http(`/api/website/forms/${formId}`, { body: state.payload, form: true, requestOrigin: "https://foreign.example.invalid" })).status, 403);
      const recovered = list(object(await call("website_read")).submissions).map(object).find(submission => submission.name === state.payload!.name);
      if (!recovered) { const accepted = await http(`/api/website/forms/${formId}`, { body: state.payload, form: true, requestOrigin: origin }); assert.equal(accepted.status, 201); }
      const retry = await http(`/api/website/forms/${formId}`, { body: state.payload, form: true, requestOrigin: origin }); assert.equal(retry.status, 200);
      const conflict = await http(`/api/website/forms/${formId}`, { body: { ...state.payload!, message: "Conflicting changed request" }, form: true, requestOrigin: origin }); assert.equal(conflict.status, 400);
      check("public automotive form commits once, exact retry recovers receipt and changed retry/origin are rejected"); return { accepted: true, exactRetry: true };
    });
    const site = object(await call("website_read")), submissions = list(site.submissions).map(object); assert.equal(submissions.length, 1);
    const submission = submissions[0], intake = object(submission.intakeReceipt), rows = await records();
    assert.equal(rows.filter(row => row.kind === "client").length, 1); assert.equal(rows.filter(row => row.kind === "inquiry").length, 1);
    const customer = rows.find(row => row.kind === "client")!, inquiry = rows.find(row => row.kind === "inquiry")!;
    assert.equal(inquiry.fields.client, customer.id); assert.equal(customer.fields.phone, "+18605550111"); assert.equal(submission.smsConsent, true);
    const vehicles = list(object(await call("business_read", { resource: "vehicles" })).data).map(object); assert.equal(vehicles.length, 1);
    assert.equal(object(vehicles[0].values).customer_id, customer.id); assert(!vehicles[0].vinReviews);
    const inbox = await http("/inbox", { owner: true }), inboxHtml = await inbox.text(); assert.equal(inbox.status, 200); assert(inboxHtml.includes(id(intake.ownerInboxId))); assert(inboxHtml.includes(marker));
    const taskRuns = list(site.runs).map(object).filter(run => run.action === "task"); assert.equal(taskRuns.length, 1); assert.equal(taskRuns[0].status, "completed");
    const taskPage = await http("/tasks", { owner: true }); assert.equal(taskPage.status, 200); assert((await taskPage.text()).includes(marker));
    const ack = object(await call("communications_read")); assert.equal(list(ack.messages).map(object).filter(message => message.purpose === "service-request-acknowledgment").length, 2); assert.equal(list(ack.consents).length, 1);
    check("compiled intake persists linked client/inquiry, unverified vehicle, owner inbox, one task and separately consented acknowledgment outbox");
    const intakeWorkerCheck = "repeated compiled shop worker leaves acknowledgments blocked without provider attempts or duplicate intake/tasks";
    if (!state.checks.includes(intakeWorkerCheck)) {
      await call("shop_tick", { limit: 20 }); await call("shop_tick", { limit: 20 });
      const blocked = list(object(await call("communications_read")).messages).map(object);
      assert.equal(blocked.length, 2); assert(blocked.every(message => message.status === "blocked" && message.attemptId === null && message.providerId === null));
      assert.equal(list(object(await call("website_read")).runs).length, 1); assert.equal((await records()).length, 2); check(intakeWorkerCheck);
    }
    const today = new Date().toISOString().slice(0, 10);
    const book = await mutate<Obj>("pricing-book", "repair_command", () => ({ action: "book.save", input: { requestId: randomUUID(), shareInTemplates: false, definition: {
      name: `${marker} pricing`, version: 1, currency: "USD", effectiveFrom: today, effectiveTo: null, labor: [], parts: [{ category: "Parts", bands: [{ fromCost: 0, untilCost: null, markupBasisPoints: 0 }] }] } } }));
    await mutate("pricing-publish", "repair_command", () => ({ action: "book.publish", input: { requestId: randomUUID(), id: id(book.id), revision: 1, reviewed: true, review: "SIMULATED owner-reviewed acceptance pricing; not installed shop rates." } }));
    const review = await mutate<Obj>("estimate-review", "repair_command", () => ({ action: "estimate.review", input: { bookId: id(book.id), vehicleId: id(vehicles[0].id), title: `${marker} repair`,
      scope: "SIMULATED replacement of agreed parts", exclusions: "No additional work authorized", expires: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      labor: [], parts: [{ category: "Parts", description: "DEMO agreed repair parts", unitCost: 10000, quantity: 1 }], laborTaxBasisPoints: 0, partsTaxBasisPoints: 625,
      taxReviewed: true, taxReview: "PRIVATE ACCEPTANCE REVIEW: synthetic entered rate only; no statutory tax determination." } }));
    assert.equal(object(review.quote).total, 10625);
    const created = await mutate<Obj>("estimate-create", "repair_command", () => ({ action: "estimate.create", input: { requestId: randomUUID(), proof: id(review.proof), reviewed: true } }));
    const estimateRetry = object(state.requests["estimate-create"].arguments); assert.deepEqual(await call("repair_command", estimateRetry), created);
    let proposal = await record(id(created.id)); proposal = await edit("proposal-approval-evidence", proposal, { acceptedBy: `${marker} customer`, evidence: "SIMULATED explicit customer estimate approval for isolated acceptance only." });
    proposal = await go("proposal-sent", proposal, "sent"); proposal = await go("proposal-accepted", proposal, "accepted");
    const agreement = await go("agreement-signed", await create("agreement-create", "agreement", { client: customer.id, proposal: proposal.id, terms: "SIMULATED fixture only. No actual repair, agreement, invoice delivery or payment.", deposit: 0, signedBy: `${marker} customer`, evidence: "SIMULATED customer signature." }), "signed");
    let job = await create("job-create", "job", { client: customer.id, agreement: agreement.id, instructions: "SIMULATED agreed repair parts", requiredChecks: "Inspect related components\nVerify final fasteners", budget: 6000 });
    const resource = await go("resource-active", await create("resource-create", "resource", { category: "equipment", weeklyHours: 40, notes: "SYNTHETIC acceptance service bay." }), "active");
    await go("booking-scheduled", await create("booking-create", "booking", { job: job.id, resource: resource.id, start: new Date(Date.now() + 2 * 86400000).toISOString(), end: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(), buffer: 15, notes: "SYNTHETIC appointment only." }), "scheduled");
    job = await go("job-scheduled", job, "scheduled"); job = await go("job-started", job, "in_progress");
    job = await edit("job-checks", job, { completedChecks: "Inspect related components\nVerify final fasteners", acceptedBy: `${marker} customer`, evidence: "SIMULATED final checks and explicit completion acceptance." });
    job = await go("job-completed", job, "completed"); job = await go("job-accepted", job, "accepted");
    check("actual MCP reviewed pricing, customer-approved scope, signed agreement, booking and completed/accepted job persist through compiled HTTP");
    await call("shop_tick", { limit: 50 }); const afterIssue = await records(), invoices = afterIssue.filter(row => row.kind === "invoice"); assert.equal(invoices.length, 1);
    const invoice = invoices[0]; assert.equal(invoice.status, "issued"); assert.equal(invoice.fields.job, job.id); assert.equal(invoice.fields.amount, 10625);
    assert.equal(object(invoice.computed?.reviewedTaxSnapshot).subtotal, 10000); assert.equal(object(invoice.computed?.reviewedTaxSnapshot).tax, 625);
    const invoiceRepeat = await mutate<Obj>("invoice-exact-retry", "shop_command", () => ({ action: "invoice.issue", input: { jobId: job.id, jobRevision: job.revision, requestId: randomUUID() } }));
    assert.equal(invoiceRepeat.invoiceId, invoice.id); assert.deepEqual(await call("shop_command", object(state.requests["invoice-exact-retry"].arguments)), invoiceRepeat);
    await call("shop_tick", { limit: 50 });
    const finance = object(await call("billing_read", { bookId: "office" })); assert.equal(list(finance.billing).length, 0); assert.equal(list(finance.entries).length, 1);
    const entry = object(list(finance.entries)[0]); assert.deepEqual(entry.lines, [{ accountNumber: 1200, debitCents: 10625, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 10000 }, { accountNumber: 2200, debitCents: 0, creditCents: 625 }]);
    assert.equal((await records()).filter(row => row.kind === "invoice").length, 1); assert.equal((await records()).filter(row => row.kind === "service_payment").length, 0);
    check("one canonical native invoice posts exact net/tax/AR once; repeated worker/issue commands create no Finance duplicate or payment");
    const grant = await once<Obj>("private-invoice-grant", async () => {
      assert(!state.requests["private-invoice-grant"], "An earlier share response was interrupted; do not create another grant automatically.");
      state.requests["private-invoice-grant"] = { pending: true }; save();
      const response = await http("/api/shop-invoicing", { owner: true, requestOrigin: origin, body: { action: "share", input: { invoiceId: invoice.id, days: 1 }, reviewed: true } });
      assert.equal(response.status, 200); return object((await response.json()).result);
    });
    const grantUrl = new URL(id(grant.url)); assert.equal(grantUrl.origin, origin);
    await once("private-invoice-page", async () => {
      const response = await http(grantUrl.pathname), html = await response.text(); assert.equal(response.status, 200); assert(html.includes("Tax USD 6.25")); assert(html.includes("USD 106.25"));
      for (const privateText of ["PRIVATE ACCEPTANCE REVIEW", "unitCost", "markupBasisPoints", "taxReview", "fingerprints"]) assert(!html.includes(privateText), "Private pricing evidence leaked into invoice HTML.");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      const parts = grantUrl.pathname.split("/"), token = parts.at(-1)!; parts[parts.length - 1] = `${token[0] === "0" ? "1" : "0"}${token.slice(1)}`;
      assert.equal((await http(parts.join("/"))).status, 404);
      assert.equal((await http(grantUrl.pathname, { requestOrigin: "https://foreign.example.invalid", body: { action: "pay" }, form: true })).status, 403);
      assert.equal((await http(grantUrl.pathname, { requestOrigin: origin, body: { action: "pay" }, form: true })).status, 400);
      check("compiled private invoice is scoped and omits private pricing; foreign-origin and unconfigured payment attempts fail closed"); return { checked: true };
    });
    await once("private-invoice-revocation", async () => {
      const response = await http("/api/shop-invoicing", { owner: true, requestOrigin: origin, body: { action: "revoke", input: { id: id(grant.id) }, reviewed: true } }); assert.equal(response.status, 200);
      assert.equal((await http(grantUrl.pathname)).status, 404); check("native invoice-link revocation closes the compiled public route"); return { revoked: true };
    });
    const finalSite = object(await call("website_read")), finalComms = object(await call("communications_read")), finalFinance = object(await call("billing_read", { bookId: "office" })), finalRecords = await records();
    const messages = list(finalComms.messages).map(object); assert(messages.every(message => ["blocked", "queued", "canceled"].includes(String(message.status)) && message.attemptId === null && message.providerId === null));
    guardedVault();
    const summary = { ok: true, checkedAt: new Date().toISOString(), fixture: "dedicated-local-compiled-acceptance", buildId: build, toolCount: 53,
      checks: state.checks, submissions: list(finalSite.submissions).length, nativeRecords: finalRecords.length, vehicles: vehicles.length,
      completedIntakeTasks: list(finalSite.runs).map(object).filter(run => run.action === "task" && run.status === "completed").length,
      invoices: finalRecords.filter(row => row.kind === "invoice").length, ledgerEntries: list(finalFinance.entries).length, financeInvoiceCopies: list(finalFinance.billing).length,
      invoiceCents: { net: 10000, tax: 625, gross: 10625 }, payments: finalRecords.filter(row => row.kind === "service_payment").length,
      messageStates: messages.reduce<Record<string, number>>((counts, message) => { const status = String(message.status); counts[status] = (counts[status] ?? 0) + 1; return counts; }, {}),
      providerAttempts: 0, providerKeysPresent: false, outboundSendingEnabled: false,
      limits: ["Synthetic records and explicitly simulated approvals only.", "Actual compiled HTTP and stdio MCP verified; no public HTTPS/TLS, Safari visual acceptance or live customer pilot.", "No message provider, VIN provider, payment processor, actual email/SMS delivery or payment was activated.", "Existing real TateWay, demo, GigTax and the root-owned server lifecycle were untouched."] };
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
    state.results.summary = summary; delete state.error; save(); console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Compiled acceptance stopped."; save(); throw new Error("Compiled acceptance stopped. Inspect its private checkpoint; do not reseed or reset the fixture.");
  } finally { await client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Compiled acceptance failed."); process.exitCode = 1; });
