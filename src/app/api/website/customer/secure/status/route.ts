import { secureTaxStatus } from "@/lib/secure-tax/store";
import { secureRequestToken, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return secureResponse(request, secureTaxStatus(secureRequestToken(request))); } catch (error) { return secureFailure(request, error); } }
export const OPTIONS = secureOptions;
