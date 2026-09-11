import { readFile } from "node:fs/promises";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { readExpense, receiptHash, receiptPath } from "@/lib/expenses/store";
export const runtime="nodejs";
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}) {
  try{await requireSectionAccess("money", "view");}catch{return new Response("Owner access required",{status:403});}
  try {
    const row=readExpense((await ctx.params).id),file=row.receipt;if(!file)return new Response("No receipt attached",{status:404});
    const bytes=await readFile(receiptPath(file));if(receiptHash(bytes)!==file.hash)throw new Error("Receipt checksum changed.");
    const attachment=new URL(request.url).searchParams.has("download");
    return new Response(bytes,{headers:{"Content-Type":file.mime,"Content-Length":String(bytes.length),"Content-Disposition":`${attachment?"attachment":"inline"}; filename="receipt-${row.fields.date}.${file.extension}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
  }catch{return new Response("Receipt unavailable",{status:404});}
}
