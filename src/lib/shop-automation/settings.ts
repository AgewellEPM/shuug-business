import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { saveSecrets } from "../connections/vault";

export const shopSettingsInput = z.object({
  revision: z.number().int().nonnegative(), reviewed: z.literal(true), enabled: z.boolean(),
  bookingConfirmations: z.boolean(), appointmentReminders: z.boolean(), jobUpdates: z.boolean(),
  paymentReceipts: z.boolean().default(true),
  reminderHours: z.number().int().min(1).max(72),
  timeZone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; } }, "Choose a valid time zone."),
}).strict();
export type ShopSettings = Omit<z.infer<typeof shopSettingsInput>, "reviewed"> & { updatedAt: string | null; updatedBy: string | null };
const defaults: ShopSettings = { revision: 0, enabled: false, bookingConfirmations: true, appointmentReminders: true,
  jobUpdates: true, paymentReceipts: true, reminderHours: 24, timeZone: "America/New_York", updatedAt: null, updatedBy: null };
export function shopSettingsInDatabase(db: DatabaseSync): ShopSettings {
  const row = db.prepare("SELECT body FROM documents WHERE id='shop-automation:settings' AND kind='shop-automation'").get() as { body: string } | undefined;
  return row ? { ...defaults, ...JSON.parse(row.body) } : structuredClone(defaults);
}
export function shopSettings() { return workspaceDatabase(shopSettingsInDatabase); }
export function saveShopSettings(raw: unknown, actor: string) {
  const input = shopSettingsInput.parse(raw);
  const saved = workspaceDatabase(db => {
    const previous = shopSettingsInDatabase(db);
    if (input.revision !== previous.revision) throw new Error("Automation settings changed. Refresh before saving.");
    const { reviewed: _, ...fields } = input;
    const settings: ShopSettings = { ...fields, revision: previous.revision + 1, updatedAt: new Date().toISOString(), updatedBy: actor };
    db.prepare("INSERT INTO documents VALUES('shop-automation:settings','shop-automation',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(settings));
    return settings;
  }, true);
  // The native intake and notification hooks share this explicit per-workspace
  // switch. Provider dispatch has its own separate Connections authorization.
  saveSecrets({ SHOP_AUTOMATION_ENABLED: String(saved.enabled) });
  return saved;
}
