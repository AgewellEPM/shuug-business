"use client";

/**
 * Nav usage tracking — the rail reorders itself by how much you actually use
 * each button. Counts live in the browser (localStorage), so it's per-device and
 * private. Categories sort by total use; items sort within their category.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";

const KEY = "shuug.navUsage.v1";
const EVENT = "shuug:nav-usage";
let fallback = "{}";

function snapshot() {
  try { return localStorage.getItem(KEY) || fallback; }
  catch { return fallback; }
}
function serverSnapshot() { return "{}"; }
function parseCounts(raw: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([href, count]) => href.startsWith("/") && typeof count === "number" && Number.isSafeInteger(count) && count >= 0));
  } catch { return {}; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) notify(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, notify);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, notify); };
}

export function useNavUsage() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const counts = useMemo(() => parseCounts(raw), [raw]);

  const record = useCallback((href: string) => {
    const previous = parseCounts(snapshot());
    fallback = JSON.stringify({ ...previous, [href]: Math.min((previous[href] || 0) + 1, Number.MAX_SAFE_INTEGER) });
    try { localStorage.setItem(KEY, fallback); }
    catch { /* Storage disabled: retain this session's counts. */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { counts, record };
}

/** Stable sort of items by usage count (desc); ties keep original order. */
export function byUsage<T extends { href: string }>(items: T[], counts: Record<string, number>): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (counts[b.item.href] || 0) - (counts[a.item.href] || 0) || a.i - b.i)
    .map((x) => x.item);
}

/** Total usage across a category's items (used to order the categories). */
export function groupScore(items: { href: string }[], counts: Record<string, number>): number {
  return items.reduce((n, it) => n + (counts[it.href] || 0), 0);
}
