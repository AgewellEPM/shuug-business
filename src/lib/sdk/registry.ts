/**
 * Module registry — the pure runtime view of every registered module. NO node:fs
 * here (the record store lives in ./records), so this is safe to pull into the
 * edge middleware graph via catalog → permissions. Enforces globally-unique ids.
 */
import { registeredModules } from "@/modules";
import type { AppModule } from "./types";

const byId = (() => {
  const map = new Map<string, AppModule>();
  for (const m of registeredModules) {
    if (map.has(m.id)) throw new Error(`Duplicate module id "${m.id}" — module ids must be globally unique`);
    map.set(m.id, m);
  }
  return map;
})();

export function appModules(): AppModule[] {
  return [...byId.values()];
}

export function moduleById(id: string): AppModule | null {
  return byId.get(id) ?? null;
}

/** Route a module lives at. */
export function modulePath(id: string): string {
  return `/m/${id}`;
}

/** The section governing a /m/<id> path, or null if it isn't a module path. */
export function appModuleSectionForPath(path: string): string | null {
  const clean = path.split("?")[0];
  const m = clean.startsWith("/m/") ? byId.get(clean.slice(3).split("/")[0]) : null;
  return m?.section ?? null;
}
