import { socialAction } from "@/app/social/actions";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { boundedJson } from "@/lib/social/http";
export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){try{await requireSectionAccess("marketing", "edit");}catch{return Response.json({error:"Owner access required."},{status:403});}try{const input=await boundedJson(new Response(request.body),15000),result=await socialAction("discover",input);return Response.json(result,{status:result.ok?200:400,headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"Send a links string and brand or competitor role."},{status:400});}}
