import {clientRenewalRequest,clientRenewEnrollment} from "@/lib/secure-tax/enrollment-renewal";
import {requireSecureBrowserOrigin,secureRequestToken,secureJson,secureResponse,secureFailure,secureOptions} from "@/lib/secure-tax/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return secureResponse(request,clientRenewalRequest(secureRequestToken(request)));}catch(error){return secureFailure(request,error);}}
export async function POST(request:Request){try{requireSecureBrowserOrigin(request);return secureResponse(request,clientRenewEnrollment(secureRequestToken(request,true),await secureJson(request,16384)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
