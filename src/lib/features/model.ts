import { z } from "zod";

export const fieldTypes = ["text", "notes", "number", "money", "date", "select", "checkbox"] as const;
export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).refine(s => !["constructor", "prototype", "__proto__"].includes(s)),
  label: z.string().trim().min(1).max(60),
  type: z.enum(fieldTypes),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
}).strict().refine(f => f.type !== "select" || (f.options.length >= 2 && new Set(f.options).size === f.options.length), "Choices need 2–20 different options.");
export const trackerDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().max(240),
  fields: z.array(fieldSchema).min(1).max(16),
}).strict().refine(t => new Set(t.fields.map(f => f.id)).size === t.fields.length, "Field IDs must be unique.")
  .refine(t => new Set(t.fields.map(f => f.label.toLowerCase())).size === t.fields.length, "Give each field a different name.");
export type Field = z.infer<typeof fieldSchema>;
export type TrackerDefinition = z.infer<typeof trackerDefinitionSchema>;
export type Cell = string | number | boolean;
export const channelSchema = z.enum(["bulk", "stores", "online"]);
export type TrackerChannel = z.infer<typeof channelSchema>;
export const recordSchema = z.object({
  id: z.uuid(), revision: z.number().int().positive(), channel: channelSchema,
  values: z.record(z.string(), z.union([z.string().max(4000), z.number().finite(), z.boolean()])),
  archived: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export type TrackerRecord = z.infer<typeof recordSchema>;
export const trackerSchema = z.object({
  id: z.uuid(), name: z.string().min(2).max(70), description: z.string().max(240),
  templateId: z.string().nullable(), enabled: z.boolean(), fields: z.array(fieldSchema).min(1).max(16),
  records: z.array(recordSchema).max(5000), createdAt: z.iso.datetime(),
}).strict();
export type Tracker = z.infer<typeof trackerSchema>;
export const featureStateSchema = z.object({
  version: z.literal(1), enabled: z.array(z.string()).max(100), trackers: z.array(trackerSchema).max(100),
  activity: z.array(z.object({ id: z.uuid(), at: z.iso.datetime(), action: z.string(), label: z.string().max(140), href: z.string() })).max(200),
}).strict();
export type FeatureState = z.infer<typeof featureStateSchema>;
export type ToolLink = { id: string; label: string; href: string };

export function validateValues(fields: Field[], input: unknown): Record<string, Cell> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter values for this tracker.");
  const raw = input as Record<string, unknown>, result: Record<string, Cell> = {};
  if (Object.keys(raw).some(key => !fields.some(f => f.id === key))) throw new Error("The tracker fields changed. Reload this page.");
  for (const f of fields) {
    const value = raw[f.id];
    if (value === undefined || value === "") {
      if (f.required) throw new Error(`${f.label} is required.`);
      continue;
    }
    if (f.type === "checkbox") {
      if (typeof value !== "boolean") throw new Error(`${f.label} must be checked or unchecked.`);
      result[f.id] = value; continue;
    }
    if (f.type === "number" || f.type === "money") {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e10) throw new Error(`${f.label} needs a valid number.`);
      if (f.type === "money" && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error(`${f.label} supports two decimal places.`);
      result[f.id] = value; continue;
    }
    if (typeof value !== "string" || value.length > (f.type === "notes" ? 4000 : 500)) throw new Error(`${f.label} is too long or invalid.`);
    const text = value.trim();
    if (f.required && !text) throw new Error(`${f.label} is required.`);
    if (f.type === "select" && !f.options.includes(text)) throw new Error(`Choose an available ${f.label.toLowerCase()}.`);
    if (f.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error(`${f.label} needs a valid date.`);
    result[f.id] = text;
  }
  return result;
}
