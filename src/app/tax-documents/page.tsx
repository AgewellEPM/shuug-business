import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { staffTaxDocuments, reviewTaxDocument } from "@/lib/customer-access/tax-documents";
import { taxDocumentStatusLabel } from "@/lib/customer-access/tax-document-html";
import { listBusinessRecords } from "@/lib/workspace/store";
import { getActiveRole } from "@/lib/permissions/active";
import { getMatrix } from "@/lib/permissions/store";
import { can } from "@/lib/permissions/model";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
async function review(form: FormData) {
  "use server";
  await requireSectionAccess("services", "edit");
  const user=await requireIdentity(); reviewTaxDocument(String(form.get("id")), String(form.get("status")), user.id, user);
  revalidatePath("/tax-documents");
}
export default async function TaxDocumentInbox() {
  await requireSectionAccess("services", "view");
  const user=await requireIdentity();
  const documents = (() => { try { return staffTaxDocuments(user); } catch { notFound(); } })(), clients = listBusinessRecords(["client"]);
  const canReview = can(getMatrix(), await getActiveRole(), "services", "edit");
  return <div className="space-y-6">
    <header><p className="dd-eyebrow">Private client submissions</p><h1 className="text-2xl font-bold">Tax documents</h1><p className="mt-2 text-sm text-slate-600">Files clients sent for explicitly shared document requests. Receipt confirms storage; review status is entered by staff and does not confirm filing or acceptance of a return.</p></header>
    {!documents.length && <p className="rounded-xl border bg-white p-6">No documents have been submitted for active requests yet. Share an engagement and its document request with the linked client to offer private upload.</p>}
    {documents.map(document => <article key={document.id} className="space-y-3 rounded-xl border bg-white p-5">
      <div><h2 className="text-lg font-semibold">{document.requestName}</h2><p className="text-sm text-slate-600">{clients.find(client => client.id === document.clientId)?.title ?? "Linked client"} · {document.engagementName}</p></div>
      <p><a className="underline" href={`/api/tax-documents/${document.id}`}>{document.name}</a> · {(document.size / 1024).toFixed(1)} KB · Submitted {document.createdAt.slice(0, 10)}</p>
      <p className="text-sm">{taxDocumentStatusLabel(document.status)}{document.reviewedAt && ` · Updated ${document.reviewedAt.slice(0, 10)}`}</p>
      {canReview && <form action={review} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={document.id}/><label className="grid gap-1 text-sm">Document review<select className="rounded border p-2" name="status" defaultValue={document.status}><option value="received">Received · awaiting staff review</option><option value="reviewed">Staff reviewed</option><option value="replacement_requested">Replacement requested</option></select></label><button className="rounded bg-purple-700 px-4 py-2 text-white">Save review status</button></form>}
    </article>)}
    {documents.length === 2000 && <p>Showing the latest 2,000 submissions. Earlier files remain stored; narrow the review through their client engagement.</p>}
    <div className="flex gap-4"><Link className="underline" href="/m/tax-document-requests">Document requests</Link><Link className="underline" href="/m/tax-engagements">Tax engagements</Link><Link className="underline" href="/rideshare">Driver journals</Link></div>
  </div>;
}
