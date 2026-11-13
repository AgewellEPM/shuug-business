import {z} from 'zod';
import {ownerKeyRecoverySnapshot,stageClientKeyRecovery,stageClientKeyRecoveryObject,revokeClientKeyRecovery} from '@/lib/secure-tax/client-key-recovery';
import {staffApiToken} from '@/lib/secure-tax/staff-http';
import {secureTaxId,secureTaxEnvelope} from '@/lib/secure-tax/envelope';
import {secureJson,secureResponse,secureFailure,secureOptions} from '@/lib/secure-tax/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const token=staffApiToken(request,true),query=new URL(request.url).searchParams;return secureResponse(request,ownerKeyRecoverySnapshot(token,query.get('requestId'),query.has('objectId')?query.get('objectId'):undefined));}catch(error){return secureFailure(request,error);}}
export async function POST(request:Request){try{const token=staffApiToken(request,true);return secureResponse(request,await stageClientKeyRecovery(token,await secureJson(request,8*1024*1024)));}catch(error){return secureFailure(request,error);}}
export async function PUT(request:Request){try{const token=staffApiToken(request,true),input=z.object({requestId:secureTaxId,envelope:secureTaxEnvelope}).strict().parse(await secureJson(request,24*1024*1024));return secureResponse(request,stageClientKeyRecoveryObject(token,input.requestId,{envelope:input.envelope}));}catch(error){return secureFailure(request,error);}}
export async function DELETE(request:Request){try{const token=staffApiToken(request,true),input=z.object({requestId:secureTaxId}).strict().parse(await secureJson(request,1024));return secureResponse(request,revokeClientKeyRecovery(token,input.requestId));}catch(error){return secureFailure(request,error);}}
export const OPTIONS=secureOptions;
