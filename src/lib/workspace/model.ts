import { z } from "zod";
import { definitionFor } from "./catalog";
export type FieldValue = string | number | boolean;
export interface BusinessRecord {
  id: string; kind: string; title: string; currency: string; status: string;
  fields: Record<string, FieldValue>; revision: number; createdAt: string; updatedAt: string;
  computed?: Record<string, unknown>;
}
export const saveRecordSchema = z.object({
  id: z.uuid().optional(), kind: z.string().max(50), title: z.string().trim().min(1).max(200),
  requestId: z.uuid().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"), revision: z.number().int().positive().optional(),
  fields: z.record(z.string(), z.union([z.string().max(12000), z.number().finite(), z.boolean()])),
}).strict();
export function validateFields(kind: string, input: Record<string, FieldValue>): Record<string, FieldValue> {
  const definition = definitionFor(kind);
  const shape: Record<string, z.ZodType> = {};
  for (const field of definition.fields) {
    let schema: z.ZodType;
    if (field.type === "money" || field.type === "number") schema = z.number().int().min(0).max(1_000_000_000_000);
    else if (field.type === "boolean") schema = z.boolean();
    else if (field.type === "select") schema = z.enum(field.options as [string, ...string[]]);
    else if (field.type === "ref") schema = z.uuid();
    else if (field.type === "date") schema = z.iso.date();
    else if (field.type === "datetime") schema = z.iso.datetime({ offset: true });
    else if (field.type === "email") schema = z.email().max(200);
    else schema = z.string().trim().min(field.required ? 1 : 0).max(field.type === "long" ? 12000 : 500);
    shape[field.key] = field.required ? schema : schema.optional();
  }
  return z.object(shape).strict().parse(input) as Record<string, FieldValue>;
}
export const numberField = (r: BusinessRecord, key: string) => typeof r.fields[key] === "number" ? r.fields[key] as number : 0;
export const textField = (r: BusinessRecord, key: string) => typeof r.fields[key] === "string" ? r.fields[key] as string : "";
export const isPosted = (r: BusinessRecord) => ["confirmed", "reconciled"].includes(r.status);
export function paymentTotal(records: BusinessRecord[], kind: string, key: string, id: string, cashOnly = false) {
  return records.filter(r => r.kind === kind && r.fields[key] === id && isPosted(r)).reduce((total, r) => {
    const direction = textField(r, "direction");
    return total + (cashOnly && direction === "credit" ? 0 : direction === "refund" ? -1 : 1) * numberField(r, "amount");
  }, 0);
}
