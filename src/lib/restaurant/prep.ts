import { randomUUID } from "node:crypto";
import type { Ingredient, RestaurantBusiness } from "./business-model";
import { restaurantCalendarDay, restaurantDay } from "./business-model";
import type { JournalLine } from "../accounting/ledger";
import { prepRecipeInput, prepStartInput, prepCompleteInput, prepDiscardInput, type PrepRecipe, type PrepBatch } from "./prep-model";

function must(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const debit = (accountNumber: number, debitCents: number): JournalLine => ({ accountNumber, debitCents, creditCents: 0 });
const credit = (accountNumber: number, creditCents: number): JournalLine => ({ accountNumber, creditCents, debitCents: 0 });
type Effects = {
  consume: (ingredient: Ingredient, quantity: number, reference: string) => PrepBatch["consumed"];
  journal: (date: string, source: string, memo: string, lines: JournalLine[]) => void;
};

/** Runs inside the restaurant transaction. Batches preserve physical input lots,
 * recipe versions and integer-cent carrying value; they never create payables. */
export function executePrepAction(b: RestaurantBusiness, action: string, raw: unknown, actor: string, effects: Effects) {
  if (action === "prep.recipe.save") {
    const input = prepRecipeInput.parse(raw), recipes = b.prepRecipes ??= [], old = recipes.find(r => r.id === input.id);
    must(!input.id || old?.revision === input.revision, "This prep recipe changed. Reload before saving.");
    must(!recipes.some(r => r.id !== input.id && r.name.toLowerCase() === input.name.toLowerCase()), "Use a unique prep recipe name.");
    must(b.ingredients.some(i => i.id === input.outputIngredientId && i.active), "Choose an active output ingredient for prepared stock.");
    must(new Set(input.inputs.map(i => i.ingredientId)).size === input.inputs.length, "Combine repeated prep ingredients.");
    for (const line of input.inputs) {
      must(line.ingredientId !== input.outputIngredientId, "A prep recipe cannot consume its own output ingredient.");
      must(b.ingredients.some(i => i.id === line.ingredientId && i.active), "Choose active ingredients for every prep input.");
    }
    const recipe: PrepRecipe = { ...input, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 };
    b.prepRecipes = [...recipes.filter(r => r.id !== recipe.id), recipe]; return recipe.id;
  }
  const today = restaurantDay(b.config), calendar = restaurantCalendarDay(b.config), batches = b.prepBatches ??= [];
  must(!b.closes.some(c => c.date >= today), "This business day is closed. Record preparation in an open period.");
  if (action === "prep.start") {
    must(b.config.taxReviewed, "Review the restaurant operating settings before starting prep batches.");
    const input = prepStartInput.parse(raw), recipe = b.prepRecipes?.find(r => r.id === input.recipeId);
    must(recipe?.active && recipe.revision === input.recipeRevision, "The prep recipe changed or is inactive. Reload and review it.");
    must(!batches.some(v => v.reference.toLowerCase() === input.reference.toLowerCase()), "This batch reference already exists. Retry the original request or choose a new reference.");
    const output = b.ingredients.find(i => i.id === recipe.outputIngredientId);
    must(output?.active, "The prepared output ingredient is inactive or unavailable.");
    must(input.inputs.length === recipe.inputs.length && new Set(input.inputs.map(l => l.ingredientId)).size === recipe.inputs.length && input.inputs.every(l => recipe.inputs.some(r => r.ingredientId === l.ingredientId)), "Record actual quantities for each prep recipe ingredient exactly once.");
    const expectedQuantity = recipe.expectedQuantity * input.batches;
    must(expectedQuantity <= 1_000_000_000, "Split this preparation into smaller batches.");
    const inputs = recipe.inputs.map(line => {
      const ingredient = b.ingredients.find(i => i.id === line.ingredientId);
      must(ingredient?.active, "A prep input ingredient is inactive or unavailable.");
      const plannedQuantity = line.quantity * input.batches;
      must(plannedQuantity <= 1_000_000_000, "Split this preparation into smaller batches.");
      return { ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.unit, plannedQuantity, quantity: input.inputs.find(i => i.ingredientId === line.ingredientId)!.quantity };
    });
    const id = randomUUID(), consumed = inputs.flatMap(i => effects.consume(b.ingredients.find(v => v.id === i.ingredientId)!, i.quantity, id));
    const foodCost = consumed.reduce((total, lot) => total + lot.cost, 0);
    must(Number.isSafeInteger(foodCost) && foodCost <= 99_999_999, "Split this preparation into smaller batches.");
    batches.push({ id, revision: 1, reference: input.reference, recipe: structuredClone(recipe), batches: input.batches,
      output: { id: output.id, name: output.name, unit: output.unit }, expectedQuantity, inputs, consumed, foodCost,
      status: "preparing", startedDate: today, startedAt: new Date().toISOString(), startedBy: actor, startEvidence: input.evidence,
      completedDate: null, completedAt: null, completedBy: null, completionEvidence: null, actualQuantity: null, expires: null, outputLotId: null });
    effects.journal(today, `restaurant-prep-start:${id}`, `Prep started: ${input.reference}`, [debit(1320, foodCost), credit(1300, foodCost)]);
    return id;
  }
  const input = action === "prep.complete" ? prepCompleteInput.parse(raw) : prepDiscardInput.parse(raw);
  const batch = batches.find(v => v.id === input.id);
  must(batch?.revision === input.revision && batch.status === "preparing", "This batch changed or is already finished. Reload before continuing.");
  must(today >= batch.startedDate, "A batch cannot finish before its recorded start date.");
  if (action === "prep.complete") {
    const completed = prepCompleteInput.parse(raw), output = b.ingredients.find(i => i.id === batch.output.id);
    must(output?.active && output.unit === batch.output.unit, "Restore the prepared ingredient with its original unit before completing this batch.");
    must(completed.expires >= calendar, "Review a use-by date on or after the current restaurant calendar date.");
    const lotId = randomUUID();
    b.lots.push({ id: lotId, ingredientId: output.id, supplierId: "", invoiceReference: batch.reference,
      receivedDate: today, expires: completed.expires, receivedQuantity: completed.quantity, remainingQuantity: completed.quantity,
      receivedCost: batch.foodCost, remainingCost: batch.foodCost, purchaseId: null, prepBatchId: batch.id });
    b.movements.push({ id: randomUUID(), ingredientId: output.id, lotId, date: today, kind: "prep_output", quantity: completed.quantity, cost: batch.foodCost, reference: batch.id, reason: completed.evidence });
    batch.actualQuantity = completed.quantity; batch.expires = completed.expires; batch.outputLotId = lotId; batch.status = "completed";
    effects.journal(today, `restaurant-prep-complete:${batch.id}`, `Prep completed: ${batch.reference}`, [debit(1300, batch.foodCost), credit(1320, batch.foodCost)]);
  } else {
    must(action === "prep.discard", "Unknown prep action.");
    batch.status = "discarded"; batch.actualQuantity = 0;
    effects.journal(today, `restaurant-prep-discard:${batch.id}`, `Prep discarded: ${batch.reference} · ${input.evidence}`, [debit(6910, batch.foodCost), credit(1320, batch.foodCost)]);
  }
  batch.revision++; batch.completedDate = today; batch.completedAt = new Date().toISOString(); batch.completedBy = actor; batch.completionEvidence = input.evidence;
  return batch.id;
}
