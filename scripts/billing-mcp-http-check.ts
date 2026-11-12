/** Actual stdio MCP -> compiled loopback HTTP proof. Disposable synthetic data;
 * no provider credentials, invoice sends, charges or existing services. */
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { saveSecrets } from "../src/lib/connections/vault";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { saveClientBook } from "../src/lib/accounting/client-books";
import type { WorkspaceUser } from "../src/lib/auth/identity";
import { backupWorkspace } from "../src/lib/workspace/backup";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loader = path.join(repository, "node_modules/tsx/dist/loader.mjs");
// /api/backend deliberately sanitizes ordinary service errors (http.ts/jsonError).
// Prove denial plus unchanged state instead of requiring private exception text.
const sanitizedServiceError = /^The backend could not complete this request\.$/;
async function freePort() {
  const server = createServer(); await new Promise<void>((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(ok => server.close(() => ok())); return port;
}
async function stop(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, "exit"), timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.kill("SIGTERM"); try { await ended; } finally { clearTimeout(timer); }
}
type ProofEnv = Record<string, string> & { NODE_ENV: "production" };
function environment(directory: string): ProofEnv {
  const env: Record<string, string> = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"].flatMap(name => process.env[name] ? [[name, process.env[name]!]] : []));
  // Next loads local .env files; neutralize their values in this owned child.
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const file = path.join(repository, name); if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) { const key = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]; if (key) env[key] = ""; }
  }
  return { ...env, NODE_ENV: "production", DEALDESK_DATA_DIR: directory, DEMO_DATA: "false", DATABASE_URL: "", AUTH_ENABLED: "true", SHUUG_REQUIRE_MFA: "false", NEXT_TELEMETRY_DISABLED: "1", WORKSPACE_ACCESS_TOKEN: "", PPC_WORKSPACE_ACCESS_TOKEN: "", SHUUG_BACKEND_TOKEN: "", BACKEND_ACCESS_TOKEN: "", WORKSPACE_OWNER_PASSWORD_HASH: "", STRIPE_SECRET_KEY: "", MAILGUN_API_KEY: "" };
}

async function main() {
  assert.equal(process.argv.length, 2, "This proof creates its own synthetic workspace; no target/data arguments are accepted.");
  const buildId = readFileSync(path.join(repository, ".next/BUILD_ID"), "utf8").trim();
  const root = mkdtempSync(path.join(tmpdir(), "shuug-billing-mcp-proof-")), host = path.join(root, "host"), restored = path.join(root, "restored");
  const blocked = path.join(root, "external-fetch-blocked"), guard = path.join(root, "loopback-only.mjs");
  let base = "", env: ProofEnv;
  let child: ChildProcess | undefined, client: Client | undefined, transport: StdioClientTransport | undefined;
  let checks = 0, closing = false, cleaned = false;
  async function closeMcp() {
    const pid = transport?.pid; try { await client?.close(); } finally { await transport?.close(); client = undefined; transport = undefined; }
    if (pid) {
      let exited = false;
      for (let i = 0; i < 50; i++) { try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") { exited = true; break; } throw error; } await new Promise(ok => setTimeout(ok, 100)); }
      assert(exited, "Owned stdio MCP child did not exit.");
    }
  }
  async function cleanup() {
    if (cleaned) return; closing = true;
    try { await closeMcp(); } finally { try { await stop(child); } finally { rmSync(root, { recursive: true, force: true }); cleaned = true; } }
  }
  const onSignal = () => { void cleanup().finally(() => process.exit(130)); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  async function start(directory: string) {
    const selected = { ...env, DEALDESK_DATA_DIR: directory };
    const running = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", new URL(base).port], { cwd: repository, env: selected, stdio: ["ignore", "pipe", "pipe"] }); child = running;
    let startupError = false; running.once("error", () => { startupError = true; });
    running.stdout?.on("data", () => {}); running.stderr?.on("data", () => {});
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(base + "/api/auth/login", { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      assert(!startupError && running.exitCode === null, "Owned compiled server failed to start."); await new Promise(ok => setTimeout(ok, 100));
    }
    assert(ready, "Owned compiled server was not ready.");
    transport = new StdioClientTransport({ command: process.execPath, args: ["--import", loader, path.join(repository, "scripts/mcp-server.ts")], cwd: repository, env: { ...selected, SHUUG_BACKEND_URL: base }, stderr: "pipe" });
    transport.stderr?.on("data", () => {}); client = new Client({ name: "shuug-compiled-billing-proof", version: "1.0.0" }); await client.connect(transport);
  }
  async function call(name: string, input: Record<string, unknown> = {}, error?: RegExp) {
    assert(client && !closing); const response = await client.callTool({ name, arguments: input });
    const text = (response.content as { type: string; text?: string }[]).filter(item => item.type === "text").map(item => item.text ?? "").join("\n");
    if (error) { assert.equal(response.isError, true); assert.match(text, error); checks++; return null; }
    assert.notEqual(response.isError, true, text); checks++; return JSON.parse(text);
  }
  const command = (bookId: string, action: string, input: object, requestId = randomUUID(), error?: RegExp) => call("billing_command", { bookId, requestId, action, input: { ...input, reviewed: true } }, error);
  try {
    mkdirSync(host, { mode: 0o700 }); base = `http://127.0.0.1:${await freePort()}`;
    writeFileSync(guard, `import {writeFileSync} from 'node:fs';\nconst original=globalThis.fetch;\nglobalThis.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==${JSON.stringify(base)}){try{writeFileSync(${JSON.stringify(blocked)},'Blocked external fetch',{flag:'wx',mode:0o600});}catch{}throw new Error('External fetch is forbidden in this synthetic proof.');}return original(input,init);};\n`, { mode: 0o600, flag: "wx" });
    env = { ...environment(host), APP_BASE_URL: base, NODE_OPTIONS: `--import=${guard}` };
    Object.assign(process.env, environment(host), { APP_BASE_URL: base });
    const owner: WorkspaceUser = { id: "workspace-owner", memberId: "owner", name: "Synthetic owner", email: "", role: "Owner", isOwner: true };
    configureOwnerPassword(`Synthetic-only-${randomUUID()}`);
    saveSecrets({ BACKEND_ACCESS_TOKEN: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "") });
    const books = ["office"];
    for (const label of ["Synthetic client A", "Synthetic client B"]) {
      const clientRecord = saveBusinessRecord({ kind: "client", title: label, fields: { email: "synthetic@example.invalid" } }, owner.id);
      books.push(saveClientBook({ clientId: clientRecord.id, name: `${label} books`, revision: 0, grants: [], reviewed: true }, owner).id);
    }
    await start(host);
    assert.equal((await client!.listTools()).tools.length, 53); checks++;
    const capabilities = await call("business_capabilities"); assert.equal(capabilities.operations.length, 53); checks++;
    const catalog = await call("billing_catalog"); assert.equal(catalog.source, "native-client-books");
    assert(catalog.actions.some((action: { action: string }) => action.action === "billing.delivery.send")); checks++;
    assert.equal((await fetch(base + "/api/backend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "billing_read", arguments: { bookId: "office" } }) })).status, 401); checks++;
    const ids: string[] = [], shares: string[] = [];
    for (const [index, bookId] of books.entries()) {
      const input = { revision: 0, kind: "invoice", number: `SYNTHETIC-${index}`, heading: "Invoice", date: "2026-10-01", due: "2026-10-31", currency: "USD", party: { name: `Synthetic customer ${index}`, email: `synthetic-${index}@example.invalid`, address: "Synthetic address" }, issuer: "Synthetic firm", terms: "Recorded bank transfer", notes: "Synthetic public invoice note", privateNotes: "PRIVATE-COMPILED-MCP-SENTINEL", custom: [], controlAccount: 1200, lines: [{ description: "Synthetic accounting service", quantity: "1", unit: "service", unitCents: 12500, discountCents: 0, taxCents: 0, accountNumber: 4000, taxAccountNumber: 2200 }] };
      const saveId = randomUUID(), saved = await command(bookId, "billing.save", input, saveId); ids.push(saved.id);
      assert.deepEqual(await command(bookId, "billing.save", input, saveId), saved);
      let view = await call("billing_read", { bookId }); assert.equal(view.billing.length, 1); assert.equal(view.billing[0].status, "draft"); assert.equal(view.entries.length, 0); checks++;
      const postId = randomUUID(), post = { id: saved.id, revision: 1 };
      const posted = await command(bookId, "billing.post", post, postId); assert.deepEqual(await command(bookId, "billing.post", post, postId), posted);
      const beforeStale = await call("billing_read", { bookId });
      await command(bookId, "billing.post", post, undefined, sanitizedServiceError);
      view = await call("billing_read", { bookId }); assert.deepEqual(view, beforeStale); assert.equal(view.billing[0].revision, 2); assert.equal(view.entries.length, 1); assert.equal(view.reports.balanceSheet.assets.accountsReceivableCents, 12500); checks++;
      const shareId = randomUUID(), shareInput = { id: saved.id, revision: 2, days: 7 }, shared = await command(bookId, "billing.share", shareInput, shareId); shares.push(shared.url);
      assert.deepEqual(await command(bookId, "billing.share", shareInput, shareId), shared);
      assert.equal(new URL(shared.url).origin, base); const response = await fetch(shared.url), html = await response.text(); assert.equal(response.status, 200); assert(html.includes(input.number)); assert(!html.includes(input.privateNotes)); checks++;
      const beforeUnconfigured = await call("billing_read", { bookId });
      assert.equal(beforeUnconfigured.deliveryConnection.ready, false); assert.match(beforeUnconfigured.deliveryConnection.message, /Mailgun/i); assert.equal(beforeUnconfigured.paymentConnection.enabled, false);
      await command(bookId, "billing.delivery.preview", { id: saved.id, revision: 2 }, undefined, sanitizedServiceError);
      const afterUnconfigured = await call("billing_read", { bookId }); assert.deepEqual(afterUnconfigured, beforeUnconfigured); assert.deepEqual(afterUnconfigured.invoiceDeliveries, []); checks++;
    }
    const beforeWrongBook = await Promise.all(books.map(bookId => call("billing_read", { bookId })));
    await command(books[2], "billing.post", { id: ids[1], revision: 2 }, undefined, sanitizedServiceError);
    for (const [i, bookId] of books.entries()) { const view = await call("billing_read", { bookId }); assert.deepEqual(view, beforeWrongBook[i]); assert.deepEqual(view.billing.map((doc: { id: string }) => doc.id), [ids[i]]); checks++; }
    const partialId = randomUUID(), partial = { id: ids[1], revision: 2, date: "2026-10-02", direction: "payment", amountCents: 4000, accountNumber: 1000, method: "Synthetic recorded bank transfer", reference: "SYNTHETIC-PARTIAL-TRANSFER", evidence: "Synthetic accounting evidence only; no bank transaction was executed." };
    const recorded = await command(books[1], "billing.settle", partial, partialId); assert.deepEqual(await command(books[1], "billing.settle", partial, partialId), recorded);
    const before = await Promise.all(books.map(bookId => call("billing_read", { bookId })));
    assert.equal(before[1].reports.balanceSheet.assets.accountsReceivableCents, 8500); assert.equal(before[1].billing[0].settlements.length, 1); assert.equal(before[1].entries.length, 2); checks++;
    assert(!existsSync(blocked), "An unexpected external fetch was attempted.");
    await closeMcp(); await stop(child); child = undefined;
    const backup = backupWorkspace(host, path.join(root, "backup"));
    const restore = JSON.parse(execFileSync(process.execPath, ["--import", loader, path.join(repository, "scripts/workspace-backup.ts"), "restore", path.join(root, "backup"), restored], { cwd: repository, env, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
    assert.equal(restore.files, backup.files); checks++;
    await start(restored);
    for (const [i, bookId] of books.entries()) { assert.deepEqual(await call("billing_read", { bookId }), before[i]); assert.equal((await fetch(shares[i])).status, 200); checks += 2; }
    assert.deepEqual(await command(books[1], "billing.settle", partial, partialId), recorded);
    const after = await call("billing_read", { bookId: books[1] }); assert.equal(after.billing[0].settlements.length, 1); assert.equal(after.reports.balanceSheet.assets.accountsReceivableCents, 8500); checks++;
    assert(!existsSync(blocked), "An unexpected external fetch was attempted.");
    await cleanup();
    console.log(JSON.stringify({ ok: true, buildId, checks, tools: 53, compiledOperations: 53, transport: "SDK Client -> actual stdio MCP -> compiled /api/backend", syntheticBooks: 3, exactRetriesVerified: true, bookNamespaceIsolationVerified: true, manualPartialSettlementCents: 4000, remainingReceivableCents: 8500, stoppedWriterBackupFiles: backup.files, freshProcessRestoreVerified: true, providerCredentialsConfigured: false, emailSendInvoked: false, realPaymentExecuted: false, externalFetchGuard: true, externalFetchAttempts: 0, ownedChildrenStopped: true, syntheticFilesRemoved: true, installedServiceChanged: false }, null, 2));
  } finally { await cleanup(); process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Compiled billing MCP proof failed."); process.exitCode = 1; });
