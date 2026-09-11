import { z } from "zod";
import { industries, packs } from "./catalog";
export const packIdSchema = z.enum(packs.map(p => p.id) as [typeof packs[number]["id"], ...typeof packs[number]["id"][]]);
export const industrySetupSchema = z.object({
  industryId: z.string().refine(id => industries.some(i => i.id === id), "Choose an installed industry template."),
  templateVersion: z.number().int().positive(),
  answers: z.record(z.string().max(60), z.boolean()),
  packs: z.array(packIdSchema).min(1).max(packs.length),
  templateName: z.string().trim().min(1).max(120), revision: z.number().int().min(1).max(10000),
}).strict();
export type IndustrySetup = z.infer<typeof industrySetupSchema>;
export const industryRequestSchema = z.object({ industryId: z.string(), answers: z.record(z.string(), z.boolean()), addedPacks: z.array(packIdSchema).max(packs.length).default([]), removedPacks: z.array(packIdSchema).max(packs.length).default([]), templateName: z.string().trim().min(1).max(120), revision: z.number().int().min(1).max(10000).default(1) }).strict();
export function assembleIndustry(raw: unknown) {
  const input = industryRequestSchema.parse(raw), template = industries.find(i => i.id === input.industryId);
  if (!template) throw new Error("Choose an installed industry template.");
  if (Object.keys(input.answers).some(id => !template.questions.some(q => q.id === id))) throw new Error("These answers belong to a different industry template.");
  const answers = Object.fromEntries(template.questions.map(q => [q.id, input.answers[q.id] ?? q.default]));
  const enabled = new Set(template.packs);
  for (const question of template.questions) if (question.pack) { if (answers[question.id]) enabled.add(question.pack); else enabled.delete(question.pack); }
  for (const id of input.addedPacks) enabled.add(id);
  for (const id of input.removedPacks) enabled.delete(id);
  const setup = industrySetupSchema.parse({ industryId: template.id, templateVersion: template.version, answers, packs: [...enabled], templateName: input.templateName, revision: input.revision });
  const profiles = new Set(template.profiles);
  for (const pack of packs) if (enabled.has(pack.id)) for (const profile of pack.profiles) profiles.add(profile);
  return { setup, organizationTypes: [...profiles], serviceTypes: template.serviceTypes, connections: template.questions.filter(q => q.connection && answers[q.id]).map(q => q.connection!) };
}
