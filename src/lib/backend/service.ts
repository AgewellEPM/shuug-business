import { expenseAccountingCatalog } from "../expenses/accounting-model";
import { executeExpenseAccountingCommand } from "../expenses/accounting";
import { receivableCatalog } from "../payments/receivable-model";
import { executeReceivableCommand } from "../payments/receivable-service";
import { accountCatalog } from "../accounting/account-model";
import { executeAccountCommand } from "../accounting/journal-store";
import { journalCatalog } from "../accounting/journal-model";
import { executeJournalCommand } from "../accounting/journal-store";
import { QBD_REQUIREMENTS, QBD_MANUAL_URL, manualCoverage } from "../quickbooks/manual";
import { reportQuery } from "../restaurant/report-model";
import { restaurantReportData } from "../restaurant/report-service";
import { inspectionCatalog } from "../auto-repair/inspection-model";
import { executeInspectionCommand } from "../auto-repair/inspections";
import { executeRepairCommand } from "../auto-repair/service";
import { repairCatalog } from "../auto-repair/model";
import { reviewVehicleVin, applyVehicleVin } from "../vehicles/service";
import { z } from "zod";
import { executeDiningCommand } from "../restaurant/dining";
import { diningCatalog } from "../restaurant/dining-model";
import { executeScheduleCommand } from "../timeclock/schedule";
import { scheduleCommandCatalog } from "../timeclock/schedule-model";
import { restaurantCommandCatalog } from "../restaurant/commands";
import { executeRestaurantCommand } from "../restaurant/business";
import { businessHandlers } from "./resources";
import { businessResources, operations } from "./catalog";
import { readFeatures, createTracker, saveRecord } from "../features/store";
import { trackerDefinitionSchema, channelSchema } from "../features/model";
import { FEATURES, TEMPLATES } from "../features/catalog";
import { QB_FEATURES } from "../quickbooks/features";
import { shopifyOperation } from "../shopify-backend/service";
import { recordDefinitions, definitionFor } from "../workspace/catalog";
import { listBusinessRecords, saveBusinessRecord, transitionBusinessRecord } from "../workspace/store";

export const operationSchema = z.object({ operation: z.enum(operations), arguments: z.record(z.string(), z.unknown()).default({}) }).strict();
export async function executeOperation(operation: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const parsed = operationSchema.parse({ operation, arguments: args });
  if (parsed.operation.startsWith("shopify_")) return shopifyOperation(parsed.operation, args);
  if (operation === "expense_catalog") return expenseAccountingCatalog();
  if (operation === "expense_command") return executeExpenseAccountingCommand(args, "Authenticated backend");
  if (operation === "receivable_catalog") return receivableCatalog();
  if (operation === "receivable_command") return executeReceivableCommand(args, "Authenticated backend");
  if (operation === "account_catalog") return accountCatalog();
  if (operation === "account_command") return executeAccountCommand(args, "Authenticated backend");
  if (operation === "journal_catalog") return journalCatalog();
  if (operation === "journal_command") return executeJournalCommand(args, "Authenticated backend");
  if (operation === "inspection_catalog") return inspectionCatalog();
  if (operation === "inspection_command") return executeInspectionCommand(args, { id: "backend", memberId: "owner", name: "Authenticated backend" }, true);
  if (operation === "repair_catalog") return repairCatalog();
  if (operation === "repair_command") return executeRepairCommand(args, { id: "backend", name: "Authenticated backend" });
  if (operation === "vehicle_vin_lookup") return reviewVehicleVin(args, "backend");
  if (operation === "vehicle_vin_apply") return applyVehicleVin(args, { id: "backend", name: "Authenticated backend" });
  if (operation === "dining_catalog") return diningCatalog();
  if (operation === "dining_command") return executeDiningCommand(args, "Authenticated backend", true);
  if (operation === "schedule_catalog") return scheduleCommandCatalog();
  if (operation === "schedule_command") return executeScheduleCommand(args, { memberId: "owner", name: "Authenticated backend" }, true);
  if (operation === "restaurant_report") return restaurantReportData(reportQuery.parse(args));
  if (operation === "restaurant_catalog") return restaurantCommandCatalog();
  if (operation === "restaurant_command") return executeRestaurantCommand(args, "Authenticated backend");
  if (operation === "workflow_catalog") return recordDefinitions;
  if (operation === "workflow_records") {
    const { kind } = z.object({ kind: z.string().max(50).optional() }).strict().parse(args);
    if (kind) definitionFor(kind);
    return listBusinessRecords(kind ? [kind] : undefined);
  }
  if (operation === "workflow_save") return saveBusinessRecord(args, "Authenticated backend");
  if (operation === "workflow_transition") return transitionBusinessRecord(args, "Authenticated backend");
  if (operation === "capabilities") return {
    name: "Shuug Business Backend", version: "1.0.0", shopifyRequired: false,
    transports: { http: "/api/backend", mcp: "/api/mcp", stdio: "npm run mcp" },
    resources: businessResources, features: FEATURES, workflows: recordDefinitions, accountingCoverage: QB_FEATURES, accountingManual: { source: QBD_MANUAL_URL, summary: manualCoverage(), requirements: QBD_REQUIREMENTS },
    templates: TEMPLATES, operations,
    dataBoundaries: ["Service/nonprofit workflows use dedicated durable record contracts. Legacy resource limitations remain; see the release capability guide.", "Shopify records are available through shopify_records with their native IDs, units and currencies.", "Commerce snapshots are not posted as bookkeeping entries or case-priced orders without a reviewed mapping.", "Deploy a separate authenticated workspace and private volume for each client."],
  };
  if (operation === "business_read") {
    const { resource } = z.object({ resource: z.enum(businessResources) }).strict().parse(args);
    return { resource, source: "shuug_workspace", data: await businessHandlers()[resource].load(), generatedAt: new Date().toISOString() };
  }
  if (operation === "trackers_list") return readFeatures().trackers;
  if (operation === "tracker_create") {
    const input = z.object({ requestId: z.uuid(), definition: trackerDefinitionSchema }).strict().parse(args);
    return createTracker(input.definition, input.requestId);
  }
  const input = z.object({ trackerId: z.uuid(), id: z.uuid(), revision: z.number().int().nonnegative(), channel: channelSchema, values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).strict().parse(args);
  const { trackerId, ...record } = input;
  return saveRecord(trackerId, record);
}
