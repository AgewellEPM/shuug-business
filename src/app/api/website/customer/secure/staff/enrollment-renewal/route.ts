import {staffRenewalRequest,staffRenewEnrollment} from "@/lib/secure-tax/enrollment-renewal";
import {staffApiToken} from "@/lib/secure-tax/staff-http";
import {secureJson,secureResponse,secureFailure,secureOptions} from "@/lib/secure-tax/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const token=staffApiToken(request,true);return secureResponse(request,staffRenewalRequest(token,new URL(request.url).searchParams.get('accountId')));}catch(error){return secureFailure(request,error);}}
export async function POST(request:Request){try{const token=staffApiToken(request,true);return secureResponse(request,staffRenewEnrollment(token,await secureJson(request,16384)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
