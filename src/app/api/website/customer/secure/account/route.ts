import {changePrivateAccountPassword,revokePrivateAccountSessions} from "@/lib/secure-tax/account-access";
import {requireSecureBrowserOrigin,secureRequestToken,secureJson,secureResponse,secureFailure,secureOptions} from "@/lib/secure-tax/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{requireSecureBrowserOrigin(request);return secureResponse(request,changePrivateAccountPassword(secureRequestToken(request,true),await secureJson(request,2048)));}catch(error){return secureFailure(request,error);}}
export async function DELETE(request:Request){try{requireSecureBrowserOrigin(request);return secureResponse(request,revokePrivateAccountSessions(secureRequestToken(request,true)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
