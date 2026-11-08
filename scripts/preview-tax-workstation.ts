/** Local visual preview only. All data and the owner session are disposable.
 * The loopback gateway keeps that session out of browser cookies and URLs.
 * Never bind it to a network interface or point it at an existing data volume. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, request as upstreamRequest, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { configureOwnerPassword, signInOwner } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { saveBranding } from "../src/lib/branding/store";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";

async function listen(server: Server) {
  await new Promise<void>((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
  return (server.address() as { port: number }).port;
}
async function stop(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, "exit"), timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.kill("SIGTERM"); try { await done; } finally { clearTimeout(timer); }
}
function samplePdf(label: string) {
  const text = `BT /F1 15 Tf 45 740 Td (SAMPLE ONLY - NOT A FILED RETURN) Tj 0 -30 Td (${label}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
  let pdf = "%PDF-1.4\n", offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function main() {
  const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
  const directory = mkdtempSync(`${tmpdir()}/shuug-workstation-preview-`);
  let child: ChildProcess | undefined, gateway: Server | undefined, stopping = false, startupLog = "";
  const cleanup = async () => {
    if (stopping) return; stopping = true;
    if (gateway?.listening) { gateway.closeAllConnections(); await new Promise<void>(ok => gateway!.close(() => ok())); }
    await stop(child); rmSync(directory, { recursive: true, force: true });
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void cleanup().then(() => process.exit(0)); });
  try {
    // Whitelist the child environment; also neutralize Next's local .env files.
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production", ...Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : [])) };
    for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      let contents = ""; try { contents = readFileSync(name, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      for (const line of contents.split("\n")) { const key = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]; if (key) env[key] = ""; }
    }
    Object.assign(env, { NODE_ENV: "production", AUTH_ENABLED: "true", DEMO_DATA: "false", DATABASE_URL: "", SHUUG_REQUIRE_MFA: "false", DEALDESK_DATA_DIR: directory, NEXT_TELEMETRY_DISABLED: "1" });
    Object.assign(process.env, { DEALDESK_DATA_DIR: directory, DEMO_DATA: "false", DATABASE_URL: "", SHUUG_REQUIRE_MFA: "false" });
    const password = `Sample-only-${randomUUID()}`;
    configureOwnerPassword(password); importBusinessTemplate(gigTaxProsTemplate);
    saveBranding({ businessName: "Shuug Sample Office · DEMO DATA", tagline: "Local workstation preview · fictional records", logoText: "S" });
    const token = signInOwner(password);
    let base = "", backend = "";
    gateway = createServer((incoming, outgoing) => {
      if (incoming.headers.host !== new URL(base).host || incoming.headers["x-forwarded-host"]
        || (incoming.headers.origin && incoming.headers.origin !== base)
        || (!["GET", "HEAD", "OPTIONS"].includes(incoming.method ?? "GET") && incoming.headers.origin !== base)) {
        outgoing.writeHead(403); outgoing.end("Local sample preview only."); return;
      }
      if (incoming.url === "/__preview_status") {
        outgoing.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        outgoing.end(JSON.stringify({ sampleData: true, buildId, installedServiceChanged: false })); return;
      }
      const headers = { ...incoming.headers, host: new URL(base).host, cookie: `dd_session=${token}` };
      delete headers.authorization;
      const forwarded = upstreamRequest(backend + (incoming.url ?? "/"), { method: incoming.method, headers }, response => {
        const responseHeaders = { ...response.headers }; delete responseHeaders["set-cookie"];
        outgoing.writeHead(response.statusCode ?? 502, responseHeaders); response.pipe(outgoing);
      });
      forwarded.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Sample preview is starting or stopped."); });
      incoming.on("aborted", () => forwarded.destroy()); incoming.pipe(forwarded);
    });
    const gatewayPort = await listen(gateway); base = `http://127.0.0.1:${gatewayPort}`;
    const reservation = createServer(); const backendPort = await listen(reservation);
    await new Promise<void>(ok => reservation.close(() => ok())); backend = `http://127.0.0.1:${backendPort}`;
    env.APP_BASE_URL = base;
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(backendPort)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", data => { startupLog = (startupLog + String(data)).slice(-4000); });
    child.once("error", error => { console.error(error.message); void cleanup().then(() => process.exit(1)); });
    child.once("exit", () => { if (!stopping) { console.error("The owned preview server stopped."); void cleanup().then(() => process.exit(1)); } });
    let ready = false;
    for (let i = 0; i < 150; i++) { try { if ((await fetch(backend + "/api/auth/login")).ok) { ready = true; break; } } catch {} await new Promise(ok => setTimeout(ok, 100)); }
    assert(ready, startupLog);
    async function json(route: string, input?: unknown) {
      const response = await fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(15000), ...(input === undefined ? {} : { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(input) }) });
      const value = await response.json(); assert(response.ok, value.error ?? route); return value;
    }
    const command = (action: string, input: unknown) => json("/api/tax-office", { requestId: randomUUID(), action, input });
    const cases = async () => (await json("/api/tax-office")).engagements;
    async function mutate(id: string, action: string, input: Record<string, unknown>) {
      const current = (await cases()).find((c: { engagement: { id: string } }) => c.engagement.id === id);
      assert(current); return command(action, { id, revision: current.workflow.revision, ...input, reviewed: true });
    }
    async function requestDocument(id: string, name: string, purpose = "Client records", reviewed = false) {
      await mutate(id, "request.create", { name, purpose, due: "", shareWithClient: false });
      const current = (await cases()).find((c: { engagement: { id: string } }) => c.engagement.id === id);
      const request = current.requests.find((r: { values: { name: string } }) => r.values.name === name); assert(request);
      if (!reviewed) return;
      const form = new FormData(); form.set("requestId", request.id); form.set("file", new File([samplePdf(name)], `${name}.pdf`, { type: "application/pdf" }));
      const upload = await fetch(`${base}/api/tax-office/${id}/documents`, { method: "POST", headers: { Origin: base }, body: form });
      const uploaded = await upload.json(); assert(upload.ok, uploaded.error);
      await json(`/api/tax-documents/${uploaded.document.id}`, { status: "reviewed" });
    }
    const bookIds: string[] = [];
    for (const [name, stage] of [["Parker household", "documents"], ["Cedar Street Cafe", "preparation"], ["Morgan Driver", "review"]] as const) {
      const client = saveBusinessRecord({ kind: "client", title: `Sample · ${name}`, fields: { email: `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid` } }, "workspace-owner");
      const { book } = await json("/api/accounting/books", { clientId: client.id, name: `Sample · ${name} books`, revision: 0, grants: [], reviewed: true }); bookIds.push(book.id);
      await json(`/api/accounting/books/${book.id}`, { requestId: randomUUID(), action: "journal.post", input: { date: "2026-11-01", memo: "Sample opening owner contribution", reviewed: true, lines: [{ accountNumber: 1000, debitCents: 500000, creditCents: 0 }, { accountNumber: 3000, debitCents: 0, creditCents: 500000 }] } });
      await json(`/api/accounting/books/${book.id}`, { requestId: randomUUID(), action: "journal.post", input: { date: "2026-11-02", memo: "Sample customer receipts", reviewed: true, lines: [{ accountNumber: 1000, debitCents: 120000, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 120000 }] } });
      const created = await command("engagement.create", { clientId: client.id, name: `Sample · ${name} · 2026 return work`, taxYear: 2026, accountantId: "workspace-owner", due: "", shareWithClient: false, reviewed: true });
      const id = created.result.id;
      await requestDocument(id, "Sample income records", "Client records", true);
      await requestDocument(id, stage === "documents" ? "Sample missing prior-year return" : "Sample expense and mileage records", "Client records", stage !== "documents");
      if (stage !== "documents") await mutate(id, "workflow.stage", { stage, notes: "Sample records only. Staff target dates are not statutory deadlines." });
      if (stage === "review") { await requestDocument(id, "Sample prepared return", "Prepared return", true); await requestDocument(id, "Sample client authorization evidence", "Client authorization", true); await mutate(id, "workflow.stage", { stage: "review", notes: "Sample accountant review; no return has been filed." }); }
    }
    for (const [route, marker] of [["/tax-office", "Tax work"], ["/accounting", "Client books"], [`/accounting/${bookIds[1]}`, "Sample"]]) {
      const response = await fetch(base + route); assert.equal(response.status, 200); assert((await response.text()).includes(marker));
    }
    assert.equal((await fetch(backend + "/tax-office", { redirect: "manual" })).status, 307, "Actual Next app must still require sign-in.");
    assert.equal((await fetch(base + "/tax-office", { headers: { Origin: "https://foreign.example.invalid" } })).status, 403);
    assert.equal((await fetch(base + "/__preview_status")).headers.has("set-cookie"), false);
    console.log(JSON.stringify({ ok: true, workstation: base + "/tax-office", clientBooks: base + "/accounting", exampleLedger: `${base}/accounting/${bookIds[1]}`, buildId, sampleClients: 3, dataDirectory: directory, gatewayPid: process.pid, backendPid: child.pid, loopbackOnly: true, actualApplicationAuthEnforced: true, browserSessionCookiesChanged: false, installedServiceChanged: false, encryptedOfficeEditingDemonstrated: false, stop: "Ctrl-C removes this owned preview and its fictional data." }, null, 2));
    await new Promise<void>(() => {});
  } finally { await cleanup(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sample preview failed."); process.exitCode = 1; });
