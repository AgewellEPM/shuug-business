import { enrollSecureTax } from "@/lib/secure-tax/store";
import { authenticateSecureRequest, secureRequestToken, secureJson, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { const token = secureRequestToken(request, true); authenticateSecureRequest(token); return secureResponse(request, enrollSecureTax(token, await secureJson(request, 16_384))); } catch (error) { return secureFailure(request, error); } }
export const OPTIONS = secureOptions;
