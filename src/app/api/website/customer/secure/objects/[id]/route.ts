import { readSecureTaxObject, writeSecureTaxObject, deleteSecureTaxObject } from "@/lib/secure-tax/store";
import { authenticateSecureRequest, secureRequestToken, secureJson, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { try { return secureResponse(request, readSecureTaxObject(secureRequestToken(request), (await context.params).id)); } catch (error) { return secureFailure(request, error); } }
export async function PUT(request: Request, context: Context) { try { const token = secureRequestToken(request, true), id = (await context.params).id; authenticateSecureRequest(token); return secureResponse(request, writeSecureTaxObject(token, id, await secureJson(request, 24 * 1024 * 1024))); } catch (error) { return secureFailure(request, error); } }
export async function DELETE(request: Request, context: Context) { try { const token = secureRequestToken(request, true), id = (await context.params).id; authenticateSecureRequest(token); return secureResponse(request, deleteSecureTaxObject(token, id, await secureJson(request, 1024))); } catch (error) { return secureFailure(request, error); } }
export const OPTIONS = secureOptions;
