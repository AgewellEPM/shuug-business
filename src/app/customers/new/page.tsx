import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { NewCustomerForm } from "@/components/NewCustomerForm";
import { createCustomerAction } from "./actions";
import { SKUS } from "@/lib/data/seed";

export default async function NewCustomerPage() {
  await requireSectionAccess("sales", "view");

  return (
    <div>
      <Link href="/customers" className="text-sm text-slate-500 hover:text-slate-800">
        ← All customers
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Add customer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add a buyer for Bulk, Stores or Online. Keep their contacts, pricing and orders together.
        </p>
      </header>
      <NewCustomerForm createAction={createCustomerAction} catalog={SKUS} />
    </div>
  );
}
