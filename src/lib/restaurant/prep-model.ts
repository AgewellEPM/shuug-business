import { z } from "zod";
import type { Ingredient } from "./business-model";

const quantity = z.number().int().min(1).max(1_000_000_000);
const ingredientLine = z.object({ ingredientId: z.uuid(), quantity }).strict();
const version = { id: z.uuid(), revision: z.number().int().positive() };
const evidence = z.string().trim().min(3).max(2000);
export const prepRecipeInput = z.object({
  id: z.uuid().optional(), revision: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100), outputIngredientId: z.uuid(), expectedQuantity: quantity,
  inputs: z.array(ingredientLine).min(1).max(100), instructions: z.string().trim().max(5000), active: z.boolean(),
}).strict();
export const prepStartInput = z.object({
  recipeId: z.uuid(), recipeRevision: z.number().int().positive(), batches: z.number().int().min(1).max(1000),
  reference: z.string().trim().min(1).max(100), inputs: z.array(ingredientLine).min(1).max(100),
  evidence, reviewed: z.literal(true),
}).strict();
export const prepCompleteInput = z.object({ ...version, quantity, expires: z.iso.date(), evidence, reviewed: z.literal(true) }).strict();
export const prepDiscardInput = z.object({ ...version, evidence, reviewed: z.literal(true) }).strict();
export interface PrepRecipe extends Omit<z.infer<typeof prepRecipeInput>, "id" | "revision"> { id: string; revision: number }
export interface PrepBatch {
  id: string; revision: number; reference: string; recipe: PrepRecipe; batches: number;
  output: { id: string; name: string; unit: Ingredient["unit"] }; expectedQuantity: number;
  inputs: { ingredientId: string; name: string; unit: Ingredient["unit"]; plannedQuantity: number; quantity: number }[];
  consumed: { ingredientId: string; lotId: string; quantity: number; cost: number }[];
  foodCost: number; status: "preparing" | "completed" | "discarded";
  startedDate: string; startedAt: string; startedBy: string; startEvidence: string;
  completedDate: string | null; completedAt: string | null; completedBy: string | null; completionEvidence: string | null;
  actualQuantity: number | null; expires: string | null; outputLotId: string | null;
}
