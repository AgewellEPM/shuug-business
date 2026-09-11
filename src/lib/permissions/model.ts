/**
 * Role-based access control — the model. Pure and dependency-free so both the
 * server (enforcement) and the client nav (hiding sections) can import it.
 *
 * A "section" is a group of pages (Sales, Money, …). A role gets a permission
 * LEVEL per section: none (can't see it), view (read-only), or edit (full use).
 * `can()` is the single gate everything else defers to.
 */

import { specialistModules, appModuleSectionForPath } from "../navigation/catalog";
export type PermissionLevel = "none" | "view" | "edit";
export type SectionKey =
  | "home" | "sales" | "distribution" | "marketing" | "operations" | "money" | "team" | "admin"
  | "services" | "fundraising" | "programs" | "volunteers" | "governance";
export type Action = "view" | "edit";

/** Matrix: role -> section -> level. Roles are plain strings (match team roles). */
export type PermissionMatrix = Record<string, Partial<Record<SectionKey, PermissionLevel>>>;

export interface SectionDef { key: SectionKey; label: string; prefixes: string[] }

/** Every section and the route prefixes that belong to it. `home` is always on. */
export const SECTIONS: SectionDef[] = [
  { key: "home", label: "Home & assistant", prefixes: ["/", "/me", "/notes", "/today", "/calendar", "/copilot"] },
  { key: "sales", label: "Sales", prefixes: ["/orders", "/customers", "/products", "/contracts", "/samples", "/pipeline"] },
  { key: "distribution", label: "Distribution", prefixes: ["/distribution", "/visits"] },
  { key: "marketing", label: "Marketing", prefixes: ["/marketing", "/ads", "/amazon-marketing", "/social"] },
  { key: "operations", label: "Operations", prefixes: ["/amazon", "/operations", "/production", "/costs", "/traceability", "/restaurant", "/assessments", "/childcare", "/workorders"] },
  { key: "money", label: "Money", prefixes: ["/restaurant/finance", "/finance", "/books", "/ledger", "/cashflow", "/collections", "/reconcile", "/billing", "/expenses", "/invoices", "/analytics"] },
  { key: "team", label: "Team", prefixes: ["/team", "/performance", "/benchmark", "/worktrack", "/timeclock", "/tasks", "/inbox"] },
  { key: "admin", label: "Admin & setup", prefixes: ["/admin", "/features", "/setup", "/settings", "/integrations", "/branding", "/documents", "/automation", "/developer", "/handlers", "/platform", "/blueprint"] },
  { key: "services", label: "Service delivery", prefixes: [] },
  { key: "fundraising", label: "Fundraising", prefixes: [] },
  { key: "programs", label: "Programs & participants", prefixes: [] },
  { key: "volunteers", label: "Volunteers", prefixes: [] },
  { key: "governance", label: "Board & governance", prefixes: [] },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const PERMISSION_LEVELS: PermissionLevel[] = ["none", "view", "edit"];

/** Which section a path belongs to. Longest matching prefix wins; default home. */
export function sectionForPath(path: string): SectionKey {
  const clean = path.split("?")[0];
  const specialist = specialistModules.find(module => module.href === clean);
  if (specialist) return specialist.section;
  const moduleSection = appModuleSectionForPath(clean);
  if (moduleSection) return moduleSection as SectionKey;
  if (clean.startsWith("/modules/") || clean.startsWith("/trackers/")) return "admin";
  let best: SectionDef | null = null;
  let bestLen = -1;
  for (const s of SECTIONS) {
    for (const p of s.prefixes) {
      const matches = p === "/" ? clean === "/" : clean === p || clean.startsWith(`${p}/`) || clean.startsWith(p);
      if (matches && p.length > bestLen) { best = s; bestLen = p.length; }
    }
  }
  return best?.key ?? "home";
}

/** Default roles shipped with the app. Owner is all-powerful. */
export const DEFAULT_ROLES = ["Owner", "Manager", "Sales", "Warehouse", "Viewer", "Employee"] as const;

const A = (level: PermissionLevel) => Object.fromEntries(SECTION_KEYS.map((k) => [k, level])) as Record<SectionKey, PermissionLevel>;

/** Sensible starting matrix. The owner tunes it in the admin screen. */
export const DEFAULT_MATRIX: PermissionMatrix = {
  Owner: A("edit"),
  Employee: { home: "view" },
  Manager: { ...A("edit"), admin: "view" },
  Sales: { home: "edit", sales: "edit", distribution: "edit", marketing: "edit", operations: "view", money: "view", team: "view", admin: "none" },
  Warehouse: { home: "view", sales: "view", distribution: "edit", marketing: "none", operations: "edit", money: "none", team: "view", admin: "none" },
  Viewer: { ...A("view"), money: "none", admin: "none" },
};

const rank: Record<PermissionLevel, number> = { none: 0, view: 1, edit: 2 };

/** The single access gate. Unknown role/section defaults to no access. */
export function can(matrix: PermissionMatrix, role: string, section: SectionKey, action: Action): boolean {
  const level = matrix[role]?.[section] ?? "none";
  return rank[level] >= rank[action === "edit" ? "edit" : "view"] && level !== "none";
}

/** Sections a role may at least view — used to hide nav. `home` is always in. */
export function allowedSections(matrix: PermissionMatrix, role: string): SectionKey[] {
  const set = new Set<SectionKey>(["home"]);
  for (const key of SECTION_KEYS) if (can(matrix, role, key, "view")) set.add(key);
  return [...set];
}

/**
 * Coarse route gate for middleware (edge-safe: pure, uses the baseline matrix).
 * True when `role` may view the section the path belongs to. Fine-grained,
 * matrix-edit-aware enforcement still happens in-page via requireSectionAccess.
 */
export function canAccessPath(path: string, role: string, matrix: PermissionMatrix = DEFAULT_MATRIX): boolean {
  return can(matrix, role, sectionForPath(path), "view") || sectionForPath(path) === "home";
}
