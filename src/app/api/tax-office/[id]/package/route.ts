import { requireBook } from "@/lib/accounting/client-books";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { privateHeaders } from "@/lib/rideshare-driver/http";
import { taxPackageManifest } from "@/lib/tax-office/service";
import { staffTaxDocument } from "@/lib/customer-access/tax-documents";
import { zipFiles } from "@/lib/tax-office/zip";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try{
    await requireSectionAccess("services","view");const user=await requireIdentity(),{id}=await context.params,manifest=taxPackageManifest(id,user);
    if(manifest.books){await requireSectionAccess("money","view");requireBook(manifest.books.bookId,user);}
    const ids=manifest.documents.filter(d=>d.status==="reviewed"&&((manifest.requests.some(r=>r.id===d.requestId&&r.purpose==="Client records")&&!manifest.waivers.some(w=>w.requestId===d.requestId))||[manifest.approval.returnDocumentId,manifest.approval.authorizationDocumentId].includes(d.id))).map(d=>d.id);
    const files=ids.map(id=>{const file=staffTaxDocument(id,user);return{name:`documents/${id}.${file.mime==="application/pdf"?"pdf":file.mime==="image/png"?"png":"jpg"}`,bytes:file.bytes};});
    files.unshift({name:"manifest.json",bytes:Buffer.from(JSON.stringify(manifest,null,2))});
    const bytes=zipFiles(files);if(taxPackageManifest(id,user).digest!==manifest.digest)throw new Error("The reviewed package changed during export. Review it again.");
    return new Response(new Uint8Array(bytes),{headers:{...privateHeaders,"Content-Type":"application/zip","Content-Disposition":`attachment; filename="shuug-reviewed-tax-${id}.zip"`}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"Package unavailable."},{status:400,headers:privateHeaders});}
}
