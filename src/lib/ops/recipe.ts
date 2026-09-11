/**
 * Recipe / BOM engine — ingredient cost roll-up to a true cost-per-case, batch
 * scaling for a production run, yield tracking, and the allergen roll-up that
 * drives the label. Pure and deterministic.
 */
import type { Recipe, RecipeIngredient } from "./model";

/** Total ingredient cost for one batch, cents. */
export function batchCostCents(recipe: Recipe): number {
  return recipe.ingredients.reduce((n, i) => n + i.costCents, 0);
}

/**
 * Cost to make one case, cents. Uses actual yield when provided (a low yield
 * raises unit cost), else the recipe's expected batch yield.
 */
export function costPerCaseCents(recipe: Recipe, actualYieldCases?: number): number {
  const cases = actualYieldCases ?? recipe.batchYieldCases;
  if (!cases || cases <= 0) throw new RangeError("yield cases must be > 0");
  return Math.round(batchCostCents(recipe) / cases);
}

/** Yield as a fraction of expected (1.0 = on target; 0.9 = 10% loss). */
export function yieldFraction(recipe: Recipe, actualYieldCases: number): number {
  if (recipe.batchYieldCases <= 0) return 0;
  return actualYieldCases / recipe.batchYieldCases;
}

export interface ScaledRun {
  batches: number;
  producedCases: number;
  ingredients: RecipeIngredient[]; // scaled quantities + cost
  totalCostCents: number;
}

/**
 * Scale a recipe to produce at least `targetCases` (whole batches), returning
 * the shopping list and total cost. Rounds batches up so you never under-make.
 */
export function scaleForCases(recipe: Recipe, targetCases: number): ScaledRun {
  if (!Number.isInteger(targetCases) || targetCases <= 0) {
    throw new RangeError("targetCases must be a positive integer");
  }
  const batches = Math.ceil(targetCases / recipe.batchYieldCases);
  const ingredients = recipe.ingredients.map((i) => ({
    ...i,
    quantity: i.quantity * batches,
    costCents: i.costCents * batches,
  }));
  return {
    batches,
    producedCases: batches * recipe.batchYieldCases,
    ingredients,
    totalCostCents: ingredients.reduce((n, i) => n + i.costCents, 0),
  };
}

/** Distinct major allergens across a recipe's ingredients (for the label). */
export function recipeAllergens(recipe: Recipe): string[] {
  return [
    ...new Set(recipe.ingredients.map((i) => i.allergen).filter((a): a is string => !!a && a.trim().length > 0)),
  ].sort();
}
