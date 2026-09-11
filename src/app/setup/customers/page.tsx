import Link from "next/link";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { CustomerAccessSetup } from "@/components/CustomerAccessSetup";
import { listCustomerAccounts } from "@/lib/customer-access/accounts";
import { customerSettings } from "@/lib/customer-access/service";
import { getDealStore } from "@/lib/data/store";
import { listBusinessRecords } from "@/lib/workspace/store";
import { appBaseUrl } from "@/lib/connections/vault";
export const dynamic = "force-dynamic";
export default async function CustomerSetupPage() {
  await requireOwnerAccess();
  return <div className="mx-auto max-w-5xl"><Link href="/setup#attach" className="text-sm underline">Back to website setup</Link><Link href="/setup/payments" className="ml-4 text-sm underline">Website payments</Link><h1 className="my-4 text-3xl font-semibold">Customer website access</h1><p className="mb-6 text-slate-600">Invite customers, manage access, and choose what your connected website offers.</p><CustomerAccessSetup baseUrl={appBaseUrl()} initial={{ accounts: listCustomerAccounts(), settings: customerSettings(), customers: await (await getDealStore()).listCustomers(), clients: listBusinessRecords(["client"]).map(r => ({ id: r.id, title: r.title })) }}/></div>;
}
