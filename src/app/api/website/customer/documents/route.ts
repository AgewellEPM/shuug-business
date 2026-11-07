import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/connections/vault";
import { escapeHtml } from "@/lib/auth/forms";
import { customerSession, CUSTOMER_PATH } from "@/lib/customer-access/accounts";
import { customerPage } from "@/lib/customer-access/page";
import { MAX_TAX_DOCUMENT_BYTES, TaxDocumentError, assertTaxDocumentRequest, submitTaxDocument } from "@/lib/customer-access/tax-documents";
import { boundedBytes, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { DriverError } from "@/lib/rideshare-driver/model";
import { assertPlaintextTaxAllowed } from "@/lib/secure-tax/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const json = request.headers.get("accept")?.includes("application/json");
  try {
    const origin = request.headers.get("origin"), native = request.headers.get("authorization")?.startsWith("Bearer ");
    if (origin !== new URL(appBaseUrl()).origin && !(native && !origin)) throw new TaxDocumentError(403, "Return to your client workspace to upload a document.");
    const token = driverToken(request, true);
    const account = customerSession(token);
    if (!account) throw new TaxDocumentError(401, "Sign in to your client account.");
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId });
    const type = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new TaxDocumentError(415, "Use the document upload form.");
    const bytes = await boundedBytes(request, MAX_TAX_DOCUMENT_BYTES + 16_384);
    const form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } }).formData();
    if (form.getAll("requestId").length !== 1 || form.getAll("file").length !== 1 || [...form.keys()].some(key => !["requestId", "file"].includes(key))) throw new TaxDocumentError(400, "Choose one document for this request.");
    const requestId = z.uuid().parse(form.get("requestId")), file = form.get("file");
    assertTaxDocumentRequest(token, requestId);
    if (!file || typeof file === "string") throw new TaxDocumentError(400, "Choose a PDF, JPEG or PNG document.");
    const document = submitTaxDocument(token, requestId, file.name, Buffer.from(await file.arrayBuffer()));
    if (json) return Response.json({ document }, { status: 201, headers: privateHeaders });
    const response = NextResponse.redirect(new URL(`${CUSTOMER_PATH}#tax-work`, appBaseUrl()), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    const status = error instanceof TaxDocumentError || error instanceof DriverError ? error.status : 400;
    const message = error instanceof TaxDocumentError || error instanceof DriverError ? error.message : error instanceof z.ZodError ? "Choose an available document request." : "The document could not be submitted. Keep your original and try again.";
    return json ? Response.json({ error: message }, { status, headers: privateHeaders }) : customerPage("Document not submitted", `<section><p role="alert">${escapeHtml(message)}</p><a href="${CUSTOMER_PATH}#tax-work">Return to your client workspace</a></section>`, status);
  }
}
