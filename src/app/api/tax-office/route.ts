import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedBytes, privateHeaders } from "@/lib/rideshare-driver/http";
import { executeTaxOfficeCommand, taxOfficeView, taxOfficeEngagement } from "@/lib/tax-office/service";
export const dynamic="force-dynamic";
export async function GET(){
  try{await requireSectionAccess("services","view");return Response.json({engagements:taxOfficeView(await requireIdentity())},{headers:privateHeaders});}
  catch{return Response.json({error:"Tax-office access required."},{status:403,headers:privateHeaders});}
}
export async function POST(request:Request){
  let user;try{await requireSectionAccess("services","edit");user=await requireIdentity();}catch{return Response.json({error:"Tax-office edit access required."},{status:403,headers:privateHeaders});}
  if(request.headers.get("origin")!==new URL(appBaseUrl()).origin)return Response.json({error:"Origin not permitted."},{status:403,headers:privateHeaders});
  try{const input=JSON.parse((await boundedBytes(request,100000)).toString("utf8"));if(input.action==="workflow.approve"&&taxOfficeEngagement(String(input.input?.id),user,true).books)await requireSectionAccess("money","view");return Response.json({result:executeTaxOfficeCommand(input,user)},{headers:privateHeaders});}
  catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to update tax work."},{status:400,headers:privateHeaders});}
}
