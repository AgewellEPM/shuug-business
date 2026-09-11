import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { receivableData, receivableJournals } from "../src/lib/payments/ar-store";
import { trialBalance, accountBalance } from "../src/lib/accounting/ledger";
export async function receivableHttpCheck(base: string, ownerCookie: string, staffCookie: string, backendToken: string) {
  assert.ok(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Receivable checks require the disposable workspace.");
  const request = (route: string, init: RequestInit = {}, cookie = ownerCookie) => fetch(base + route, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000), headers: { Cookie: cookie, ...init.headers } });
  const post = (command: unknown, cookie = ownerCookie, origin = base) => request("/api/accounting/receivables", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(command) }, cookie);
  const initial = await (await request("/api/accounting/receivables")).json();
  const invoice = initial.statuses.find((s: { balanceCents: number; status: string }) => s.balanceCents > 1000 && s.status !== "void"); assert.ok(invoice, "The customer acceptance run must create a real product invoice.");
  const date = new Date().toISOString().slice(0, 10), amount = Math.floor(invoice.balanceCents / 2);
  const command = { requestId: randomUUID(), action: "payment.record", input: { invoiceId: invoice.invoiceId, amountCents: amount, feeCents: 100, method: "check", receivedAtISO: date, reference: "Installed receipt A", evidence: "Synthetic bank receipt evidence", reviewed: true } };
  assert.equal((await post(command, staffCookie)).status, 403); assert.equal((await request("/api/accounting/receivables", {}, staffCookie)).status, 403); assert.equal((await request("/api/v1/receivables", {}, staffCookie)).status, 403);
  assert.equal((await post(command, ownerCookie, "https://foreign.invalid")).status, 403);
  const race = await Promise.all([post(command), post(command), post(command)]); for (const r of race) assert.equal(r.status, 200); const results = await Promise.all(race.map(r => r.json())); assert.deepEqual(results[0], results[1]); assert.deepEqual(results[0], results[2]);
  const paymentId = results[0].result.id; assert.equal(receivableData().payments.filter(p => p.id === paymentId).length, 1);
  const originalJournals = receivableJournals().entries;
  const client = new Client({ name: "receivable-acceptance", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base), { requestInit: { headers: { Authorization: `Bearer ${backendToken}` } } }));
    const mcpCommand = { requestId: randomUUID(), action: "payment.record", input: { ...command.input, amountCents: invoice.balanceCents - amount, feeCents: 0, reference: "Installed receipt B" } };
    const call = () => client.callTool({ name: "receivable_command", arguments: mcpCommand }); const first = await call(); assert.notEqual(first.isError, true); assert.deepEqual(await call(), first);
    const afterPay = await (await request("/api/accounting/receivables")).json(); assert.equal(afterPay.statuses.find((s: { invoiceId: string }) => s.invoiceId === invoice.invoiceId).status, "paid");
    const returnCommand = { requestId: randomUUID(), action: "payment.return", input: { paymentId, date, reference: "Installed return A", reason: "Synthetic returned check", evidence: "Synthetic bank return evidence", bankFeeCents: 250, customerFeeCents: 550, customerFeeTaxCents: 50, customerFeeEvidence: "Synthetic reviewed terms and tax", reviewed: true } };
    const attempts = await Promise.all([post(returnCommand), post({ ...returnCommand, requestId: randomUUID() })]); assert.deepEqual(attempts.map(r => r.status).sort(), [200, 400]);
    const current = await (await request("/api/accounting/receivables")).json(), status = current.statuses.find((s: { invoiceId: string }) => s.invoiceId === invoice.invoiceId);
    assert.equal(status.balanceCents, amount + 550); assert.equal(status.feeCents, 100); assert.equal(status.returnFeeCents, 250);
    const journals = receivableJournals(); for (const original of originalJournals) assert.deepEqual(journals.entries.find(e => e.id === original.id), original);
    const balance = trialBalance(journals.entries); assert.equal(balance.balanced, true); assert.equal(accountBalance(balance, 6400), 350); assert.equal(accountBalance(balance, 2200), 50);
    const replacement = { requestId: randomUUID(), action: "payment.record", input: { ...command.input, amountCents: amount + 550, feeCents: 0, reference: "Installed replacement" } };
    assert.equal((await post(replacement)).status, 200); assert.equal((await post({ ...replacement, requestId: randomUUID() })).status, 400);
    const reminder = { requestId: randomUUID(), action: "reminder.record", input: { invoiceId: invoice.invoiceId, date, note: "Synthetic follow-up already made" } };
    assert.equal((await post(reminder)).status, 200); assert.equal((await post(reminder)).status, 200);
    const final = await (await request("/api/accounting/receivables")).json(); assert.equal(final.statuses.find((s: { invoiceId: string }) => s.invoiceId === invoice.invoiceId).reminders, 1);
    const page = await request("/collections"), html = await page.text(); assert.equal(page.status, 200); assert.ok(html.includes("Include paid and cancelled invoices") && !html.includes(">Send reminder<"));
    const ledger = await request("/ledger"), ledgerHtml = await ledger.text(); assert.equal(ledger.status, 200); assert.ok(ledgerHtml.includes("Installed return A") && ledgerHtml.includes("Processing fee"));
    console.log("Installed receivables: concurrent receipts and return, genuine MCP posting/retry, retained fees and tax, replacement settlement, private roles, reminder history and cross-process journals passed. No money or messages sent.");
  } finally { await client.close(); }
}
