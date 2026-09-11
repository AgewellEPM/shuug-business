/**
 * defineModule() — the one call a developer makes. Validates the manifest with the
 * same rules the no-code tracker builder uses, so a hand-written module and a
 * UI-built one are held to an identical standard. Fails fast and loudly on a bad
 * manifest (thrown at import time = the dev sees it immediately, never at runtime).
 */
import { z } from "zod";
import { fieldSchema } from "../features/model";
import type { AppModule, AppModuleManifest } from "./types";

const ID = /^[a-z][a-z0-9-]{1,39}$/;

const manifestSchema = z.object({
  id: z.string().regex(ID, "Module id must be kebab-case (a-z, 0-9, dashes), 2–40 chars"),
  label: z.string().trim().min(2).max(70),
  description: z.string().trim().max(240).default(""),
  group: z.string().trim().min(2).max(40),
  section: z.enum(["home", "sales", "distribution", "marketing", "operations", "money", "team", "admin", "services", "fundraising", "programs", "volunteers", "governance"]),
  icon: z.string().trim().max(40).optional(),
  organizations: z.array(z.string()).max(8).optional(),
  capabilityPacks: z.array(z.string().regex(/^[a-z_]+$/)).max(8).optional(),
  version: z.string().trim().min(1).max(20),
  author: z.string().trim().max(80).optional(),
  fields: z.array(fieldSchema).max(24).default([]),
  // Functions can't be validated by zod cleanly across versions — accept, then check by hand below.
  panels: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), compute: z.any() })).max(12).optional(),
  api: z.any().optional(),
}).strict()
  .refine((m) => new Set(m.fields.map((f) => f.id)).size === m.fields.length, "Field ids must be unique")
  .refine((m) => new Set(m.fields.map((f) => f.label.toLowerCase())).size === m.fields.length, "Field names must be unique");

/**
 * Validate + brand a module manifest. Call at module top level:
 *   export default defineModule({ id: "...", label: "...", section: "...", fields: [...] })
 */
export function defineModule(manifest: AppModuleManifest): AppModule {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`Invalid module "${(manifest as { id?: string })?.id ?? "?"}": ${first?.path.join(".")} — ${first?.message}`);
  }
  for (const p of manifest.panels ?? []) {
    if (typeof p.compute !== "function") throw new Error(`Invalid module "${manifest.id}": panel "${p.id}" needs a compute function`);
  }
  if (manifest.api !== undefined && typeof manifest.api !== "function") throw new Error(`Invalid module "${manifest.id}": api must be a function`);
  // Zod strips the function bodies via z.function(); keep the originals from the input.
  return { ...manifest, description: manifest.description ?? "", fields: manifest.fields ?? [], __validated: true };
}
