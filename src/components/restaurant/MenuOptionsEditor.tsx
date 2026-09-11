"use client";
import type { Ingredient } from "@/lib/restaurant/business-model";
import type { ModifierGroup } from "@/lib/restaurant/modifier-model";
const cls = "dd-input mt-1 block w-full";
const option = (): ModifierGroup["options"][number] => ({ id: crypto.randomUUID(), name: "", priceDelta: 0, active: true, allergens: "", recipe: [] });
export function MenuOptionsEditor({ groups, onChange, ingredients }: { groups: ModifierGroup[]; onChange: (groups: ModifierGroup[]) => void; ingredients: Ingredient[] }) {
  const group = (index: number, change: Partial<ModifierGroup>) => onChange(groups.map((g, i) => i === index ? { ...g, ...change } : g));
  const choice = (gi: number, oi: number, change: Partial<ModifierGroup["options"][number]>) => group(gi, { options: groups[gi].options.map((o, i) => i === oi ? { ...o, ...change } : o) });
  return <section className="space-y-3"><h3 className="font-semibold">Sizes, sides and extras</h3>
    <p className="text-sm">Choices adjust the base price and recipe per portion. Use negative ingredient quantities to remove a base ingredient, positive quantities to add it. An empty adjustment list is suitable for a preparation preference. Allergen notes remain visible with the base menu notes.</p>
    {groups.map((g, gi) => <fieldset className="space-y-3 rounded-lg border p-3" key={g.id}><legend>Option group {gi + 1}</legend>
      <label className="block text-sm">Group name<input className={cls} value={g.name} maxLength={60} required onChange={e => group(gi, { name: e.target.value })}/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Minimum choices<input className={cls} type="number" min={0} max={4} required value={g.min} onChange={e => group(gi, { min: Number(e.target.value) })}/></label><label className="block text-sm">Maximum choices<input className={cls} type="number" min={1} max={4} required value={g.max} onChange={e => group(gi, { max: Number(e.target.value) })}/></label></div>
      {g.options.map((o, oi) => <fieldset className="space-y-3 rounded border p-3" key={o.id}><legend>Choice {oi + 1}</legend>
        <label className="block text-sm">Choice name<input className={cls} value={o.name} maxLength={60} required onChange={e => choice(gi, oi, { name: e.target.value })}/></label>
        <label className="block text-sm">Price adjustment per portion (USD)<input className={cls} type="number" step="0.01" min={-999999.99} max={999999.99} required value={o.priceDelta / 100} onChange={e => choice(gi, oi, { priceDelta: Math.round(Number(e.target.value) * 100) })}/></label>
        <label className="block text-sm">Reviewed allergen notes for this choice<textarea className={cls} maxLength={300} required value={o.allergens} onChange={e => choice(gi, oi, { allergens: e.target.value })}/></label>
        {o.recipe.map((r, ri) => <div className="grid gap-2 sm:grid-cols-3" key={ri}><label className="block text-sm">Adjusted ingredient<select className={cls} required value={r.ingredientId} onChange={e => choice(gi, oi, { recipe: o.recipe.map((x, n) => n === ri ? { ...x, ingredientId: e.target.value } : x) })}><option value="">Choose ingredient</option>{ingredients.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label><label className="block text-sm">Base-unit adjustment per portion<input className={cls} type="number" step={1} min={-1_000_000_000} max={1_000_000_000} value={r.quantity} required onChange={e => choice(gi, oi, { recipe: o.recipe.map((x, n) => n === ri ? { ...x, quantity: Number(e.target.value) } : x) })}/></label><button type="button" className="dd-secondary self-end" onClick={() => choice(gi, oi, { recipe: o.recipe.filter((_, n) => n !== ri) })}>Remove adjustment</button></div>)}
        <button type="button" className="dd-secondary" disabled={o.recipe.length >= 8} onClick={() => choice(gi, oi, { recipe: [...o.recipe, { ingredientId: "", quantity: 1 }] })}>Add ingredient adjustment</button>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={o.active} onChange={e => choice(gi, oi, { active: e.target.checked })}/>Choice available</label>
        <button type="button" className="dd-secondary" disabled={g.options.length === 1} onClick={() => group(gi, { options: g.options.filter((_, n) => n !== oi) })}>Remove choice</button>
      </fieldset>)}
      <div className="flex gap-2"><button type="button" className="dd-secondary" disabled={g.options.length >= 8} onClick={() => group(gi, { options: [...g.options, option()] })}>Add choice</button><button type="button" className="dd-secondary" onClick={() => onChange(groups.filter((_, n) => n !== gi))}>Remove option group</button></div>
    </fieldset>)}
    <button type="button" className="dd-secondary" disabled={groups.length >= 6} onClick={() => onChange([...groups, { id: crypto.randomUUID(), name: "", min: 0, max: 1, options: [option()] }])}>Add option group</button>
  </section>;
}
