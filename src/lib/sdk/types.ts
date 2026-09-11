/**
 * Module SDK — public types. PURE (no node:fs, no zod) so this file is safe to
 * import from the edge middleware graph (permissions → catalog → registry).
 *
 * A "module" is a self-contained feature a developer (or a power user) adds in ONE
 * file: a data schema (reusing the no-code field types), optional computed summary
 * panels, and an optional pure API payload. Registering it wires the nav item,
 * permission section, API resource, and a full records UI automatically.
 */
import type { SectionKey } from "../permissions/model";
import type { Field, Cell } from "../features/model";

/** One stored row of a module's data. Mirrors the tracker record shape, minus the channel. */
export interface ModuleRecord {
  vinReviews?: import("../vehicles/model").VinReviewEvidence[];
  id: string;
  values: Record<string, Cell>;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A computed summary card shown at the top of the module — pure, derived from records. */
export interface ModulePanel {
  id: string;
  label: string;
  /** Pure: turn the live records into small label/value stat rows. Never throws. */
  compute: (records: ModuleRecord[]) => { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
}

/** The manifest a developer writes. `group`/`section` place it in the app; `fields` define its data. */
export interface AppModuleManifest {
  /** kebab-case, globally unique. Becomes the route /m/<id> and the API /api/v1/m/<id>. */
  id: string;
  label: string;
  description: string;
  /** Nav group label (validated against the app's navigation groups at registration). */
  group: string;
  /** Which permission section governs access (reuses the RBAC matrix). */
  section: SectionKey;
  icon?: string;
  /** Restrict to org types (product/service/nonprofit); omit = all. */
  organizations?: string[];
  /** Default visibility in industry setup requires all of these capability packs. */
  capabilityPacks?: string[];
  version: string;
  author?: string;
  /** Data schema. May be empty for a compute-only module. */
  fields: Field[];
  /** Optional summary cards computed from the records. */
  panels?: ModulePanel[];
  /** Optional pure API payload (served at /api/v1/m/<id>). Receives the live records. */
  api?: (records: ModuleRecord[]) => unknown;
}

/** A validated, registered module (same shape — the brand marks it as vetted). */
export interface AppModule extends AppModuleManifest {
  readonly __validated: true;
}
