import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { blankExpense } from "@/lib/expenses/model";
import { extractReceipt, MAX_RECEIPT_BYTES, receiptType } from "@/lib/expenses/ocr";
import { receiptSuggestions } from "@/lib/expenses/extract";
import { createReceiptExpense, findReceipt, receiptHash } from "@/lib/expenses/store";
import { businessDay } from "@/lib/history/dates";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
  let actor;try {await requireSectionAccess("money", "edit");actor=await requireIdentity();}catch{return Response.json({error:"Accounting edit access required."},{status:403});}
  if(request.headers.get("origin")!==new URL(appBaseUrl()).origin)return Response.json({error:"Origin not permitted."},{status:403});
  try {
    const type=request.headers.get("content-type")??"";
    if(!type.startsWith("multipart/form-data;"))throw new Error("Upload a receipt file using the upload form.");
    const reader=request.body?.getReader();if(!reader)throw new Error("Choose a receipt to upload.");
    // Enforce actual streamed bytes, including when Content-Length is absent or false.
    const chunks:Uint8Array[]=[];let length=0;
    const timeout=setTimeout(()=>void reader.cancel(),20000);
    try {while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>MAX_RECEIPT_BYTES+65536){await reader.cancel();return Response.json({error:"Choose a receipt up to 10 MB."},{status:413});}chunks.push(part.value);}}finally{clearTimeout(timeout);reader.releaseLock();}
    const body=Buffer.concat(chunks),form=await new Response(body,{headers:{"Content-Type":type}}).formData();
    const file=form.get("file");if(!(file instanceof File))throw new Error("Choose a receipt to upload.");
    const bytes=Buffer.from(await file.arrayBuffer()),format=receiptType(bytes),hash=receiptHash(bytes);
    const duplicate=findReceipt(hash);if(duplicate)return Response.json({expense:duplicate,duplicate:true});
    const extracted=await extractReceipt(bytes,format);
    const fields={...blankExpense(businessDay(new Date().toISOString())),...receiptSuggestions(extracted.text)};
    const result=createReceiptExpense(fields,{hash,name:file.name.replace(/[\u0000-\u001f\u007f]/g,"").slice(0,180)||`receipt.${format.extension}`,...format,bytes:bytes.length,...extracted},bytes,`${actor.name} (${actor.id})`);
    return Response.json(result,{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(e) {return Response.json({error:e instanceof Error?e.message:"Receipt upload failed. Try again."},{status:400});}
}
