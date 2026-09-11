import { z } from "zod";
import type { MenuItem, RestaurantBusiness, RestaurantOrder } from "./business-model";
const id = z.uuid();
export const modifierGroupsInput = z.array(z.object({
  id, name: z.string().trim().min(1).max(60), min: z.number().int().min(0).max(4), max: z.number().int().min(1).max(4),
  options: z.array(z.object({ id, name: z.string().trim().min(1).max(60), active: z.boolean(), priceDelta: z.number().int().min(-99_999_999).max(99_999_999), allergens: z.string().trim().min(1).max(300),
    recipe: z.array(z.object({ ingredientId: id, quantity: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine(v => v !== 0, "Use a nonzero ingredient adjustment.") }).strict()).max(8),
  }).strict()).min(1).max(8),
}).strict()).max(6);
export type ModifierGroup = z.infer<typeof modifierGroupsInput>[number];
export const optionSelectionInput = z.array(id).max(12).default([]);
export const restaurantOrderLineInput = z.object({ menuId: id, qty: z.number().int().min(1).max(99), options: optionSelectionInput }).strict();
export interface CapturedModifier { id: string; groupId: string; group: string; name: string; priceDelta: number; allergens: string }
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
export function validateMenuModifiers(b: RestaurantBusiness, groups: ModifierGroup[]) {
  const ids = groups.flatMap(g => [g.id, ...g.options.map(o => o.id)]);
  must(new Set(ids).size === ids.length, "Use a different ID for every option and option group.");
  must(new Set(groups.map(g => g.name.toLowerCase())).size === groups.length, "Use unique option group names.");
  must(groups.reduce((n, g) => n + g.min, 0) <= 12, "Required choices cannot exceed 12 per portion.");
  for (const g of groups) {
    must(g.min <= g.max && g.options.filter(o => o.active).length >= g.min, `Provide enough active choices for ${g.name}.`);
    must(new Set(g.options.map(o => o.name.toLowerCase())).size === g.options.length, `Use unique choice names in ${g.name}.`);
    for (const o of g.options) {
      must(new Set(o.recipe.map(r => r.ingredientId)).size === o.recipe.length, "Combine repeated ingredient adjustments in each choice.");
      for (const r of o.recipe) must(b.ingredients.some(i => i.id === r.ingredientId && i.active), "Choose active ingredients for option adjustments.");
    }
  }
}
export function selectionKey(line: { menuId: string; options?: string[] }) { return JSON.stringify([line.menuId, [...(line.options ?? [])].sort()]); }
/** Resolve only server-owned choices. Quantities are signed adjustments to one
 * base portion; the final recipe cannot contain a negative ingredient balance. */
export function resolveMenuOptions(item: MenuItem, raw: string[] = []) {
  const selection = optionSelectionInput.parse(raw), groups = item.modifierGroups ?? [];
  must(new Set(selection).size === selection.length, "Choose each menu option once.");
  const choices: CapturedModifier[] = [], recipe = new Map(item.recipe.map(r => [r.ingredientId, r.quantity])); let price = item.price;
  for (const g of groups) {
    const picked = g.options.filter(o => selection.includes(o.id));
    must(picked.length >= g.min && picked.length <= g.max, `Choose ${g.min === g.max ? g.min : `${g.min}–${g.max}`} from ${g.name} for ${item.name}.`);
    for (const o of picked) {
      must(o.active, `${o.name} is unavailable. Choose another option.`);
      choices.push({ id: o.id, groupId: g.id, group: g.name, name: o.name, priceDelta: o.priceDelta, allergens: o.allergens }); price += o.priceDelta;
      for (const r of o.recipe) recipe.set(r.ingredientId, (recipe.get(r.ingredientId) ?? 0) + r.quantity);
    }
  }
  must(choices.length === selection.length, "A selected option does not belong to this menu item.");
  must(Number.isSafeInteger(price) && price > 0 && price <= 99_999_999, "The selected options need a positive supported menu price.");
  must([...recipe.values()].every(q => Number.isSafeInteger(q) && q >= 0 && q <= 1_000_000_000), "These choices remove too much of an ingredient or exceed the supported recipe quantity. Review the menu options.");
  const resolved = [...recipe].filter(([, quantity]) => quantity > 0).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
  must(resolved.length > 0, "The selected options must retain a costed recipe.");
  return { choices, price, recipe: resolved, allergens: [item.allergens, ...choices.map(c => `${c.group}: ${c.name} — ${c.allergens}`)].join("; ") };
}
export function optionLabels(line: { modifiers?: CapturedModifier[] }) { return (line.modifiers ?? []).map(m => `${m.group}: ${m.name}`); }
export function orderLineLabel(line: RestaurantOrder["lines"][number]) { const labels = optionLabels(line); return line.name + (labels.length ? ` (${labels.join("; ")})` : ""); }
export function orderLineId(line: RestaurantOrder["lines"][number]) { return line.id ?? line.menuId; }
