/**
 * Cockpit widget registry — the catalog of dashboard tiles and the default board
 * each role sees. Pure metadata + board math so it's testable and shared by the
 * server (which data to compute) and the client (what to render / offer to pin).
 *
 * A "board" is just an ordered list of widget ids. Each role starts with a
 * sensible board; the user then pins/unpins/reorders to build their own.
 */
export type WidgetSize = "sm" | "lg";
export type WidgetSection = "sales" | "distribution" | "marketing" | "operations" | "money" | "team" | "home";

export interface WidgetDef {
  id: string;
  title: string;
  /** which business area — used for role relevance + grouping in the gallery. */
  section: WidgetSection;
  /** sm = one column, lg = full width (tables/big lists). */
  size: WidgetSize;
  blurb: string;
}

export const WIDGETS: WidgetDef[] = [
  { id: "kpis", title: "Business KPIs", section: "home", size: "lg", blurb: "Sales, orders, customers, to-fulfill" },
  { id: "needs-attention", title: "Needs attention", section: "home", size: "lg", blurb: "Everything that needs you now" },
  { id: "recent-orders", title: "Recent orders", section: "sales", size: "lg", blurb: "Newest orders across channels" },
  { id: "new-accounts", title: "New stores & accounts", section: "sales", size: "sm", blurb: "Customers you just added" },
  { id: "channels", title: "Sales channels", section: "sales", size: "lg", blurb: "Revenue by bulk / stores / online" },
  { id: "coverage-gaps", title: "Coverage gaps", section: "distribution", size: "sm", blurb: "Territories missing top sellers" },
  { id: "territories", title: "Territories", section: "distribution", size: "sm", blurb: "Where you sell, by region" },
  { id: "contracts", title: "Contracts to renew", section: "sales", size: "sm", blurb: "Agreements expiring soon" },
  { id: "team-activity", title: "Team activity", section: "team", size: "sm", blurb: "What your team just shipped" },
  { id: "my-tasks", title: "Open tasks", section: "team", size: "sm", blurb: "Work in flight, by due date" },
  { id: "low-stock", title: "Low stock", section: "operations", size: "sm", blurb: "Products to reorder" },
  { id: "marketing", title: "Marketing & website", section: "marketing", size: "sm", blurb: "Website sales + Amazon ROAS" },
  { id: "top-products", title: "Top products", section: "sales", size: "sm", blurb: "Best sellers by revenue" },
  { id: "onboarding", title: "Get set up", section: "home", size: "sm", blurb: "Finish connecting your business" },
];

export const WIDGET_IDS = WIDGETS.map((w) => w.id);
export function widgetById(id: string): WidgetDef | undefined { return WIDGETS.find((w) => w.id === id); }

/** Tableau-style widths on a 6-column desktop grid: third / half / full. */
export type WidgetWidth = "small" | "medium" | "large";
export const WIDGET_WIDTHS: WidgetWidth[] = ["small", "medium", "large"];

/** A tile on a board: which widget + how wide the user made it. */
export interface BoardItem { id: string; w: WidgetWidth }

/** Sensible starting width — big lists/tables go full, stat tiles go third. */
export function defaultWidth(widgetId: string): WidgetWidth {
  return widgetById(widgetId)?.size === "lg" ? "large" : "small";
}

/** Next width in the cycle small → medium → large → small. */
export function cycleWidth(w: WidgetWidth): WidgetWidth {
  return WIDGET_WIDTHS[(WIDGET_WIDTHS.indexOf(w) + 1) % WIDGET_WIDTHS.length];
}

/** Default board per role. Owner sees the whole cockpit; staff see their lane. */
export const DEFAULT_BOARDS: Record<string, string[]> = {
  Owner: ["kpis", "needs-attention", "channels", "recent-orders", "team-activity", "coverage-gaps", "contracts", "marketing"],
  Manager: ["kpis", "needs-attention", "recent-orders", "team-activity", "coverage-gaps", "low-stock", "contracts"],
  Sales: ["kpis", "recent-orders", "new-accounts", "coverage-gaps", "contracts", "my-tasks", "marketing"],
  Warehouse: ["needs-attention", "low-stock", "recent-orders", "territories", "my-tasks"],
  Viewer: ["kpis", "channels", "recent-orders", "top-products"],
};

export function defaultBoard(role: string): string[] {
  return DEFAULT_BOARDS[role] ?? DEFAULT_BOARDS.Owner;
}

/** Sanitize a saved board: keep only known ids, drop dupes, preserve order. */
export function normalizeBoard(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (WIDGET_IDS.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Widgets not currently on the board — what the "add" gallery offers. */
export function availableToAdd(board: string[]): WidgetDef[] {
  const on = new Set(board);
  return WIDGETS.filter((w) => !on.has(w.id));
}

/** Move an id from one index to another (drag reorder), returning a new array. */
export function moveWidget(board: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= board.length || to >= board.length) return board;
  const next = [...board];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
