import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { blankExpense } from "../src/lib/expenses/model";
import { archiveExpense, readExpense } from "../src/lib/expenses/store";
import { expenseAccountingData } from "../src/lib/expenses/accounting";
import { expenseOutstanding } from "../src/lib/expenses/accounting-model";
export async function expenseAccountingHttpCheck(base: string, cookie: string, staffCookie: string, backendToken: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Expense acceptance requires disposable fixture data.");
  const request = (route: string, body?: unknown, identity = cookie, origin = base) => fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { Cookie: identity, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const path = "/api/accounting/expenses", initial = await (await request(path)).json(), date = initial.today as string;
  const create = { requestId: randomUUID(), action: "expense.create", input: { fields: { ...blankExpense(date), merchant: "Installed expense vendor", amountCents: 10000, paymentStatus: "unpaid", reference: "HTTP-BILL-1" }, dueDate: date, homeAmountCents: 10000, conversionEvidence: "", allocations: [{ purpose: "operating", accountNumber: 6300, amountCents: 10000 }], settlement: null, evidence: "Synthetic reviewed subscription bill", reviewed: true } };
  assert.equal((await request(path, create, staffCookie)).status, 403); assert.equal((await request(path, create, cookie, "https://foreign.test")).status, 403);
  const response = await request(path, create), first = await response.json(); assert(response.ok, first.error); const id = first.expense.id as string;
  assert((await request(path, create)).ok); assert.equal(expenseAccountingData().entries.filter(e => e.source === `expense:${id}`).length, 1);
  const payment = { id, revision: first.expense.revision, amountCents: 5000, homeAmountCents: 5000, date, feeCents: 17, accountNumber: 1000, fxAccountNumber: null, reference: "HTTP-BILL-PAY-1", evidence: "Synthetic verified bank settlement", reviewed: true };
  const attempts = [randomUUID(), randomUUID()].map(requestId => ({ requestId, action: "expense.settle", input: payment }));
  const race = await Promise.all(attempts.map(p => request(path, p))); assert.equal(race.filter(r => r.ok).length, 1); assert.equal(race.filter(r => r.status === 400).length, 1);
  assert((await request(path, attempts[race.findIndex(r => r.ok)])).ok); assert.equal(expenseOutstanding(readExpense(id).accounting!).amountCents, 5000);
  const mcp = new Client({ name: "expense-accounting-acceptance", version: "1" });
  try {
    await mcp.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base), { requestInit: { headers: { Authorization: `Bearer ${backendToken}` } } }));
    const catalog = await mcp.callTool({ name: "expense_catalog", arguments: {} }); assert.notEqual(catalog.isError, true); assert(JSON.stringify(catalog).includes("expense.create"));
    const remaining = { requestId: randomUUID(), action: "expense.settle", input: { ...payment, revision: readExpense(id).revision, feeCents: 0, reference: "HTTP-BILL-PAY-2" } };
    const paid = await mcp.callTool({ name: "expense_command", arguments: remaining }); assert.notEqual(paid.isError, true); assert.deepEqual(await mcp.callTool({ name: "expense_command", arguments: remaining }), paid);
    assert.equal(expenseOutstanding(readExpense(id).accounting!).amountCents, 0);
    const current = readExpense(id), settlement = current.accounting!.settlements[0];
    const returned = { requestId: randomUUID(), action: "expense.settlement.reverse", input: { id, revision: current.revision, settlementId: settlement.id, date, homeAmountCents: 5000, feeRefundCents: 0, additionalFeeCents: 23, fxAccountNumber: null, reference: "HTTP-BILL-RETURN", evidence: "Synthetic actual returned payment, fees not refunded", reviewed: true } };
    const returnedResponse = await request(path, returned); assert(returnedResponse.ok, JSON.stringify(await returnedResponse.json())); assert((await request(path, returned)).ok);
    assert.equal(expenseOutstanding(readExpense(id).accounting!).amountCents, 5000);
    const after = expenseAccountingData().entries.filter(e => e.source.includes(id) || readExpense(id).accounting!.settlements.some(p => e.source.endsWith(p.id)));
    assert.equal(after.length, 4); assert.equal(after.flatMap(e => e.lines).filter(l => l.accountNumber === 6400).reduce((n, l) => n + l.debitCents - l.creditCents, 0), 40);
    // A second process performs the same archive action used by the receipt UI.
    const row = readExpense(id); archiveExpense(id, row.revision, false, "Synthetic cross-process archive");
    const read = await request(path), data = await read.json(); assert.equal(read.headers.get("cache-control"), "private, no-store"); assert.equal(data.records.find((r: { id: string }) => r.id === id).status, "archived"); assert.equal(data.entries.length, initial.entries.length + 4);
    assert.equal((await request(path, undefined, staffCookie)).status, 403);
    const expenses = await request("/expenses"), html = await expenses.text(); assert(expenses.ok && html.includes("Unsettled bills") && html.includes("Needs ledger review"));
    const ledger = await request("/ledger"); assert(ledger.ok && (await ledger.text()).includes("Vendor bill: Installed expense vendor"));
    const resource = await mcp.callTool({ name: "business_read", arguments: { resource: "expense-accounting" } }); assert.notEqual(resource.isError, true); assert(JSON.stringify(resource).includes("HTTP-BILL-RETURN"));
  } finally { await mcp.close(); }
  console.log("Installed expense accounting: atomic bill creation, dated partial payment, competing settlement protection, genuine MCP settlement/retry, returned funds with retained fees, archived outstanding bill, shared ledger, Money/origin restrictions and cross-process history passed. No payments sent.");
}
