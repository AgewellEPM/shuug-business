"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientBook } from "@/lib/accounting/client-books";
export function ClientBookForm({ clients, employees, existing }: { clients: {id:string;title:string}[]; employees:{id:string;name:string}[]; existing?:ClientBook }) {
  const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError("");try{
    const response=await fetch("/api/accounting/books",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...(existing?{id:existing.id}:{}),revision:existing?.revision??0,clientId:existing?.clientId??String(form.get("clientId")),name:String(form.get("name")),grants:employees.flatMap(employee=>{const level=String(form.get(employee.id));return level==="view"||level==="edit"?[{accountId:employee.id,level}]:[];}),reviewed:true})});
    const body=await response.json();if(!response.ok)throw new Error(body.error);router.push(`/accounting/${body.book.id}`);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not save.");}finally{setBusy(false);}}}>
    <fieldset disabled={busy} className="space-y-3">{!existing&&<label className="grid">Service client<select className="rounded border p-2" name="clientId" required><option value="">Choose client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}<label className="grid">Book name<input className="rounded border p-2" name="name" defaultValue={existing?.name} required maxLength={140}/></label>
    <p className="text-sm">Each client has a separate ledger. Staff also need Money permission; assignments below control access to this client's books.</p>{employees.map(e=><label key={e.id} className="flex justify-between gap-3">{e.name}<select name={e.id} defaultValue={existing?.grants.find(g=>g.accountId===e.id)?.level??"none"} className="rounded border p-2"><option value="none">No access</option><option value="view">View</option><option value="edit">Edit</option></select></label>)}<label className="flex gap-2"><input type="checkbox" required/>I reviewed the client and access assignments.</label><button className="dd-primary">{busy?"Saving…":existing?"Save access":"Create client books"}</button></fieldset>{error&&<p role="alert" className="text-red-700">{error}</p>}
  </form>;
}
