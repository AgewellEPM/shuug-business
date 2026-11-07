import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { bookView } from "@/lib/accounting/book-service";
import { financialReports } from "@/lib/accounting/reports";
import { requireBook } from "@/lib/accounting/client-books";
import { listEmployeeAccounts } from "@/lib/auth/employees";
import { AccountingWorkspace } from "@/components/AccountingWorkspace";
import { ClientBookForm } from "@/components/ClientBooks";
export const dynamic="force-dynamic";
export default async function BookPage({params,searchParams}:{params:Promise<{bookId:string}>;searchParams:Promise<{from?:string;through?:string;tool?:string}>}) {
  await requireSectionAccess("money","view");const user=await requireIdentity(),{bookId}=await params,query=await searchParams;
  let book;try{book=requireBook(bookId,user);}catch{notFound();}
  const data=await bookView(bookId,user);let canEdit=false;try{await requireSectionAccess("money","edit");requireBook(bookId,user,true);canEdit=true;}catch{}
  try{data.reports=financialReports(data.entries,data.accounts,{...(query.from?{from:query.from}:{}),...(query.through?{through:query.through}:{})});}catch{return <p role="alert">Invalid report dates. Choose a start date on or before the end date.</p>;}
  return <div className="space-y-6"><AccountingWorkspace data={data} canEdit={canEdit} owner={user.isOwner} initialTab={["bank","billing","journal","close"].includes(query.tool??"")?query.tool!:"reports"}/>{user.isOwner&&book&&<details className="dd-card"><summary>Client access</summary><ClientBookForm existing={book} clients={[]} employees={listEmployeeAccounts().filter(e=>e.status==="active").map(e=>({id:e.id,name:e.name}))}/></details>}</div>;
}
