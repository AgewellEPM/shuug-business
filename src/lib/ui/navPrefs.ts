"use client";

/**
 * Personal nav preferences — which sidebar categories are hidden AND the order
 * the user arranged them in. Per-person display choice (localStorage), separate
 * from role permissions. External-store pattern so components read via
 * useSyncExternalStore (no setState-in-effect, stable server snapshot).
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY = "dd_nav_prefs";
const EMPTY: NavPrefs = { hidden: [], order: [], hiddenItems: [] };

export interface NavPrefs { hidden: string[]; order: string[]; hiddenItems: string[] }

let cache: NavPrefs | null = null;
const listeners = new Set<() => void>();

function read(): NavPrefs {
  if (cache) return cache;
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? JSON.parse(s) : null;
    cache = v && Array.isArray(v.hidden) && Array.isArray(v.order) ? { hidden: v.hidden, order: v.order, hiddenItems: Array.isArray(v.hiddenItems) ? v.hiddenItems : [] } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}
function write(next: NavPrefs) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage off */ }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useNavPrefs() {
  const prefs = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggle = useCallback((label: string) => {
    const p = read();
    write({ ...p, hidden: p.hidden.includes(label) ? p.hidden.filter((x) => x !== label) : [...p.hidden, label] });
  }, []);

  const toggleItem = useCallback((href: string) => {
    const p = read();
    write({ ...p, hiddenItems: p.hiddenItems.includes(href) ? p.hiddenItems.filter((x) => x !== href) : [...p.hiddenItems, href] });
  }, []);

  /** Move a category up/down in a known full ordering; seeds order from `all` first. */
  const move = useCallback((label: string, dir: "up" | "down", all: string[]) => {
    const p = read();
    const base = p.order.length ? [...p.order] : [...all];
    // ensure every current group is present in the order
    for (const g of all) if (!base.includes(g)) base.push(g);
    const i = base.indexOf(label);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= base.length) return;
    [base[i], base[j]] = [base[j], base[i]];
    write({ ...p, order: base });
  }, []);

  return { hidden: prefs.hidden, order: prefs.order, hiddenItems: prefs.hiddenItems, toggle, toggleItem, move };
}

/** Apply a saved manual order to groups; empty order → caller's default sort. */
export function applyNavOrder<T extends { label: string }>(groups: T[], order: string[]): T[] {
  if (order.length === 0) return groups;
  const rank = (label: string) => { const i = order.indexOf(label); return i === -1 ? order.length + 1 : i; };
  return [...groups].sort((a, b) => rank(a.label) - rank(b.label));
}
