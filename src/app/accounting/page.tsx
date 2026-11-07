import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { clientBooks } from "@/lib/accounting/client-books";
import { listBusinessRecords } from "@/lib/workspace/store";
import { listEmployeeAccounts } from "@/lib/auth/employees";
import { ClientBookForm } from "@/components/ClientBooks";
export const dynamic="force-dynamic";
export default async function AccountingPage() {
  await requireSectionAccess("money","view");const user=await requireIdentity(),books=clientBooks(user);
  const clients=user.isOwner?listBusinessRecords(["client"]).filter(c=>!["archived","inactive"].includes(c.status)).map(c=>({id:c.id,title:c.title})):[];
  const employees=user.isOwner?listEmployeeAccounts().filter(a=>a.status==="active").map(a=>({id:a.id,name:a.name})):[];
  return <div className="space-y-6"><header><p className="dd-eyebrow">Shuug accounting</p><h1 className="text-2xl font-bold">Client books</h1><p className="mt-2">Open the office ledger or a client's separate books, statements and closing history.</p></header><Link href="/accounting/office" className="dd-primary inline-block">Office books</Link><div className="grid gap-4 sm:grid-cols-2">{books.map(b=><Link key={b.id} href={`/accounting/${b.id}`} className="dd-card"><h2 className="font-semibold">{b.name}</h2><p>Journal · Bank reconciliation · Reports</p></Link>)}</div>{user.isOwner&&<section className="dd-card"><h2 className="mb-4 text-xl font-semibold">Add client books</h2><ClientBookForm clients={clients} employees={employees}/><Link className="mt-3 block underline" href="/modules/service-clients">Manage service clients</Link></section>}</div>;
}
