import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedBytes, privateHeaders } from "@/lib/rideshare-driver/http";
import { taxOfficeEngagement } from "@/lib/tax-office/service";
import { submitTaxDocument, MAX_TAX_DOCUMENT_BYTES } from "@/lib/customer-access/tax-documents";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  let user;try{await requireSectionAccess("services","edit");user=await requireIdentity();}catch{return Response.json({error:"Document upload access required."},{status:403,headers:privateHeaders});}
  if(request.headers.get("origin")!==new URL(appBaseUrl()).origin)return Response.json({error:"Origin not permitted."},{status:403,headers:privateHeaders});
  try{
    const {id}=await context.params,engagement=taxOfficeEngagement(id,user,true);
    const bytes=await boundedBytes(request,MAX_TAX_DOCUMENT_BYTES+64000);
    const form=await new Response(new Uint8Array(bytes),{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData();
    const requestId=String(form.get("requestId")),files=form.getAll("file");
    if(files.length!==1||!(files[0] instanceof File)||form.getAll("requestId").length!==1)throw new Error("Choose one requested PDF, JPEG or PNG document.");
    if(!engagement.requests.some(r=>r.id===requestId))throw new Error("Choose a request in this engagement.");
    const file=files[0],document=submitTaxDocument(undefined,requestId,file.name,Buffer.from(await file.arrayBuffer()),{user,clientId:String(engagement.engagement.values.client_id)});
    return Response.json({document},{status:201,headers:privateHeaders});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to save document."},{status:400,headers:privateHeaders});}
}
