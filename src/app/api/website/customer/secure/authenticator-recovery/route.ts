import {completeAuthenticatorRecovery} from "@/lib/secure-tax/authenticator-recovery";
import {requireSecureBrowserOrigin,secureJson,secureResponse,secureFailure,secureOptions} from "@/lib/secure-tax/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{requireSecureBrowserOrigin(request);return secureResponse(request,await completeAuthenticatorRecovery(await secureJson(request,16384)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
