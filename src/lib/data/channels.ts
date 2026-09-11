import type { CustomerChannel } from "./model";
export type SalesChannel = "all" | "bulk" | "stores" | "online";
export function salesChannel(channel: CustomerChannel | undefined): Exclude<SalesChannel,"all"> {
  return channel === "wholesale_bulk" ? "bulk" : channel === "online" || channel === "amazon" ? "online" : "stores";
}
export const SALES_LABELS = { all: "All channels", bulk: "Bulk", stores: "Stores", online: "Online" };
