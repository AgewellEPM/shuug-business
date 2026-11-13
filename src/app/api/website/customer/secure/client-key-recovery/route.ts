import {requestClientKeyRecovery,completeClientKeyRecovery} from '@/lib/secure-tax/client-key-recovery';
import {requireSecureBrowserOrigin,secureRequestToken,authenticateSecureRequest,secureJson,secureResponse,secureFailure,secureOptions} from '@/lib/secure-tax/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{requireSecureBrowserOrigin(request);const token=secureRequestToken(request,true);authenticateSecureRequest(token);return secureResponse(request,requestClientKeyRecovery(token,await secureJson(request,4096)));}catch(error){return secureFailure(request,error);}}
export async function PUT(request:Request){try{requireSecureBrowserOrigin(request);const token=secureRequestToken(request,true);authenticateSecureRequest(token);return secureResponse(request,await completeClientKeyRecovery(token,await secureJson(request,8*1024*1024)));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
