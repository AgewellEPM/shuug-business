"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { configureShopifyAction } from "@/app/settings/backend/actions";
export function ShopifyBackendSettings({ enabled, writesEnabled, canEdit }: { enabled: boolean; writesEnabled: boolean; canEdit: boolean }) {
  const [sync, setSync] = useState(enabled), [writes, setWrites] = useState(writesEnabled), [pending, start] = useTransition(), [message, setMessage] = useState("");
  const router = useRouter();
  return <form onSubmit={event => { event.preventDefault(); start(async () => { const result = await configureShopifyAction({ enabled: sync, writesEnabled: writes }); setMessage(result.message); if (result.ok) router.refresh(); }); }} className="mt-5 space-y-3">
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)} disabled={!canEdit || pending} className="accent-emerald-700"/>Enable Shopify synchronization</label>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={writes} onChange={event => setWrites(event.target.checked)} disabled={!canEdit || pending} className="accent-emerald-700"/>Allow queued product and inventory changes</label>
    <p className="text-xs leading-6 text-slate-500">The client still needs to connect their own store and approve the requested permissions. A supervised sync worker processes deliveries and queued changes.</p>
    {canEdit && <button type="submit" disabled={pending} className="dd-primary">{pending ? "Saving…" : "Save Shopify settings"}</button>}
    {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
  </form>;
}
