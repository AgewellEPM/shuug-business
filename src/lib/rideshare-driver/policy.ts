import type { DatabaseSync } from "node:sqlite";
import { customerFromDatabase, type CustomerAccount } from "../customer-access/accounts";
import { customerSettings, customerSettingsFromDatabase } from "../customer-access/service";
import { getBranding } from "../branding/store";
import { visibleItems, catalogWithTools } from "../navigation/catalog";
import { DriverError } from "./model";

export function driverAvailable(db?: DatabaseSync) {
  const brand = getBranding(), settings = db ? customerSettingsFromDatabase(db) : customerSettings();
  return brand.industrySetup?.industryId === "tax-firm" && settings.enabled && settings.servicePortal
    && visibleItems(brand, catalogWithTools()).some(item => item.id === "module:rideshare-tax-records");
}
export function driverAccount(db: DatabaseSync, token: string | undefined): CustomerAccount & { clientId: string } {
  if (!driverAvailable(db)) throw new DriverError(404, "Driver records are not enabled for this workspace.");
  const account = customerFromDatabase(db, token);
  if (!account) throw new DriverError(401, "Sign in to your invited client account.");
  const client = account.clientId ? db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(account.clientId) as { body: string } | undefined : undefined;
  if (!client || ["inactive", "archived", "cancelled"].includes(JSON.parse(client.body).status)) throw new DriverError(403, "Your service-client link is unavailable. Contact the firm.");
  return account as CustomerAccount & { clientId: string };
}
