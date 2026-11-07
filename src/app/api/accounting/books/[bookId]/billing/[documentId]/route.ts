import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { requireBook } from "@/lib/accounting/client-books";
import { billingDocuments } from "@/lib/accounting/billing-store";
import { billingHtml, billingHtmlHeaders } from "@/lib/accounting/billing-html";
type Context={params:Promise<{bookId:string;documentId:string}>};
export async function GET(request:Request,context:Context) {
  try {await requireSectionAccess("money","view");const user=await requireIdentity(),{bookId,documentId}=await context.params;requireBook(bookId,user);const doc=billingDocuments(bookId).find(d=>d.id===documentId);if(!doc)throw new Error("Unavailable");return new Response(billingHtml(doc),{headers:billingHtmlHeaders});}
  catch{return new Response("Document unavailable.",{status:403,headers:billingHtmlHeaders});}
}
