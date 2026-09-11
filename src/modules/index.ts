/**
 * Module barrel — the ONE place a developer registers a new module.
 *
 *   1. Create src/modules/<your-id>.ts exporting `default defineModule({...})`
 *   2. Import it here and add it to the array below.
 *
 * That's it. Nav item, permission section, API resource, and the records UI are
 * all derived from the manifest — no core files to edit. See docs/MODULES.md.
 */
import type { AppModule } from "@/lib/sdk/types";
import customerFeedback from "./customer-feedback";
import equipmentLog from "./equipment-log";
import { industryRecords } from "./industry-records";

export const registeredModules: AppModule[] = [
  customerFeedback,
  equipmentLog,
  ...industryRecords,
];
