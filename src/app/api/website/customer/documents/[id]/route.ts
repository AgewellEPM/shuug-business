import { driverToken, privateHeaders, checkDriverOrigin } from "@/lib/rideshare-driver/http";
import { clientTaxDocument, taxDocumentResponse, TaxDocumentError } from "@/lib/customer-access/tax-documents";
import { customerSession } from "@/lib/customer-access/accounts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkDriverOrigin(request); const token = driverToken(request, true); if (!customerSession(token)) throw new TaxDocumentError(401, "Sign in to your client account."); return taxDocumentResponse(clientTaxDocument(token, (await context.params).id)); }
  catch (error) { return new Response(error instanceof TaxDocumentError ? error.message : "Document unavailable.", { status: error instanceof TaxDocumentError ? error.status : 404, headers: privateHeaders }); }
}
