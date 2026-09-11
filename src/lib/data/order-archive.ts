import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import type { CustomerDeal, Order } from "./model";
function directory(){const dir=path.join(dataDirectory(),"local-orders");mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
/** New local orders keep their prices, costs and customer after a server restart. */
export function archiveLocalOrder(order:Order,deal:CustomerDeal) {
  if(!/^ORD-[a-f0-9-]{36}$/.test(order.id))throw new Error("Invalid local order ID.");
  const temp=path.join(directory(),`${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify({order,deal}),{mode:0o600});renameSync(temp,path.join(directory(),`${order.id}.json`));
}
export function archivedLocalOrders():{order:Order;deal:CustomerDeal}[] {
  return readdirSync(directory()).filter(s=>/^ORD-[a-f0-9-]{36}\.json$/.test(s)).map(s=>{const row=JSON.parse(readFileSync(path.join(directory(),s),"utf8"));if(!row.order||!Array.isArray(row.order.lines)||row.order.id!==s.slice(0,-5)||row.deal?.customer?.id!==row.order.customerId)throw new Error("A saved order could not be read. Restore its record before continuing.");return row;});
}
