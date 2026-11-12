import { z } from "zod";
import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { workspaceDatabase } from "@/lib/workspace/database";
import { issueAcceptedShopInvoice, saveShopInvoiceSettings, shopInvoiceSettings } from "@/lib/shop-invoicing/service";
import { createShopInvoiceGrantInDatabase, revokeShopInvoiceGrant } from "@/lib/shop-invoicing/invoice-link";
import { transactionRecords } from "@/lib/shop-invoicing/tax-snapshot";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireSectionAccess("money", "view"); return json({ settings: shopInvoiceSettings(), invoices: workspaceDatabase(db => transactionRecords(db).filter(r => r.kind === "invoice").map(r => ({ id: r.id, jobId: r.fields.job, title: r.title, status: r.status, amount: r.fields.amount, currency: r.currency, due: r.fields.due, tax: (r.computed?.reviewedTaxSnapshot as { tax?: number } | undefined)?.tax ?? null }))) }); }
  catch { return json({ error: "Money access required." }, 403); }
}
export async function POST(request: Request) {
  let user; try { user = await requireIdentity(); await requireSectionAccess("money", "edit"); } catch { return json({ error: "Money edit access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const command = z.object({ action: z.enum(["settings", "issue", "share", "revoke"]), input: z.record(z.string(), z.unknown()), reviewed: z.literal(true) }).strict().parse(await boundedJson(new Response(request.body), 16000));
    if (command.action === "settings") return json({ result: saveShopInvoiceSettings({ ...command.input, reviewed: true }, user) });
    if (command.action === "issue") return json({ result: issueAcceptedShopInvoice(command.input, `${user.name} (${user.id})`) });
    if (command.action === "revoke") return json({ result: revokeShopInvoiceGrant(z.object({ id: z.uuid() }).strict().parse(command.input).id) });
    const input = z.object({ invoiceId: z.uuid(), days: z.number().int().min(1).max(90) }).strict().parse(command.input);
    return json({ result: workspaceDatabase(db => {
      const invoice = transactionRecords(db).find(r => r.id === input.invoiceId && r.kind === "invoice");
      if (!invoice) throw new Error("Invoice unavailable.");
      return createShopInvoiceGrantInDatabase(db, invoice, input.days);
    }, true) });
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invoice automation needs review." }, 400); }
}
