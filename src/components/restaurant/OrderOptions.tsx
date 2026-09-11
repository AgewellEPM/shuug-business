"use client";
import type { MenuItem } from "@/lib/restaurant/business-model";
export function OrderOptions({ item, selected, onChange }: { item: MenuItem | undefined; selected: string[]; onChange: (ids: string[]) => void }) {
  if (!item?.modifierGroups?.length) return null;
  return <div className="w-full space-y-3">{item.modifierGroups.map(g => <fieldset className="rounded border p-3" key={g.id}><legend>{g.name} · Choose {g.min === g.max ? g.min : `${g.min}–${g.max}`}</legend>{g.options.filter(o => o.active).map(o => <label className="my-2 flex gap-2 text-sm" key={o.id}><input type="checkbox" checked={selected.includes(o.id)} onChange={e => onChange(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))}/><span>{o.name} · {o.priceDelta < 0 ? "−" : "+"}${(Math.abs(o.priceDelta) / 100).toFixed(2)}<br/>{o.allergens}</span></label>)}</fieldset>)}<p className="text-sm">Selections apply to every portion on this line. Add another line for different choices.</p></div>;
}
