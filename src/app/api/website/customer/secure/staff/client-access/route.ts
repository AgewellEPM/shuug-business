import {setPrivateAccountAccess} from "@/lib/secure-tax/account-access";
import {staffApiToken} from "@/lib/secure-tax/staff-http";
import {secureJson,secureResponse,secureFailure,secureOptions} from "@/lib/secure-tax/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{const token=staffApiToken(request,true);return secureResponse(request,setPrivateAccountAccess(token,await secureJson(request,1024)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
