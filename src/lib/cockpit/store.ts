"use client";

/**
 * Client-side cockpit persistence — the source of truth for a role's dashboards,
 * backed by localStorage and exposed as an external store so components read it
 * via useSyncExternalStore (no setState-in-effect, no hydration mismatch). The
 * server snapshot is a STABLE per-role default (cached) to avoid render loops.
 */
import { defaultWorkspace, normalizeWorkspace, type Workspace } from "./boards";

const keyFor = (role: string) => `dd_cockpit_v2_${role}`;

const clientCache = new Map<string, Workspace>();
const serverDefaults = new Map<string, Workspace>();
const listeners = new Set<() => void>();

/** Stable default per role for the server/initial snapshot. */
export function serverSnapshot(role: string): Workspace {
  let ws = serverDefaults.get(role);
  if (!ws) { ws = defaultWorkspace(role); serverDefaults.set(role, ws); }
  return ws;
}

/** Client snapshot: cached workspace from localStorage (stable ref until write). */
export function readWorkspace(role: string): Workspace {
  const hit = clientCache.get(role);
  if (hit) return hit;
  let ws: Workspace;
  try {
    const s = localStorage.getItem(keyFor(role));
    ws = s ? normalizeWorkspace(JSON.parse(s), role) : defaultWorkspace(role);
  } catch {
    ws = defaultWorkspace(role);
  }
  clientCache.set(role, ws);
  return ws;
}

export function writeWorkspace(role: string, ws: Workspace) {
  clientCache.set(role, ws);
  try { localStorage.setItem(keyFor(role), JSON.stringify(ws)); } catch { /* storage off */ }
  listeners.forEach((l) => l());
}

export function subscribeWorkspace(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
