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
import { workspaceCatalog, previewWorkspace, applyWorkspace } from "../industry/mcp-builder";
import { ownerIdentity } from "../auth/identity";
import { bookIdInput } from "../accounting/book-scope";
import { bookView, bookCommand } from "../accounting/book-service";
import { billingSchemas } from "../accounting/billing-model";
import { invoiceDeliverySchemas } from "../accounting/invoice-delivery-model";

export const billingReadInput = z.object({ bookId: bookIdInput }).strict();
const billingShareInput = z.object({ id: z.uuid(), revision: z.number().int().positive(), days: z.number().int().min(1).max(90).default(30), reviewed: z.literal(true) }).strict();
export const billingActionSchemas = {
  ...billingSchemas, ...invoiceDeliverySchemas,
  "billing.share": billingShareInput,
  "billing.share.revoke": billingShareInput,
  "billing.connection": z.object({ enabled: z.boolean(), secretKey: z.string().max(500).optional(), reviewed: z.literal(true) }).strict(),
} as const;
export const billingMcpCommandInput = z.object({
  bookId: bookIdInput, requestId: z.uuid(),
  action: z.enum(Object.keys(billingActionSchemas) as [keyof typeof billingActionSchemas, ...(keyof typeof billingActionSchemas)[]]),
  input: z.record(z.string(), z.unknown()),
}).strict();
function billingCatalog(raw: unknown) {
  z.object({}).strict().parse(raw);
  return {
    version: 1, source: "native-client-books", currency: "USD", bookScope: "office or an existing client-book UUID",
    actions: Object.entries(billingActionSchemas).map(([action, schema]) => ({ action, inputSchema: z.toJSONSchema(schema) })),
    workflow: ["billing_read", "billing.save", "billing_read", "billing.post", "billing.delivery.preview", "review exact recipient and preview", "billing.delivery.send"],
    boundaries: [
      "The authenticated backend credential has owner authority for this workspace. Existing book access, active-client, encryption-enrollment, revision, period and accounting guards remain enforced.",
      "billing.save creates or edits a draft; billing.post records its balanced native ledger entry. Neither sends an invoice or charges a card.",
      "billing.settle records an externally verified payment or refund with actual date, reference and evidence; it does not move money or establish provider acceptance.",
      "billing.share creates a private expiring invoice link. Sharing and delivery expose only the public invoice rendering, excluding private notes; keep the link confidential.",
      "Delivery preview does not send. Explicit reviewed delivery send can contact the configured mail provider; uncertain attempts require provider review and are never automatically resent. Provider acceptance does not prove mailbox delivery or reading.",
      "Payment acceptance requires the business's configured Stripe account, a shared posted invoice and verified provider state. Configuring a connection or returning a checkout link is not proof of a charge. Test mode is not a real payment.",
      "Client books enrolled in offhost encryption remain unavailable through this legacy plaintext billing interface; the MCP token cannot decrypt them.",
    ],
  };
}
// These operations use the same deliberately owner-authorized backend boundary
// as the existing MCP commands. Native book services still enforce client scope.
const backendBillingOwner = () => ({ ...ownerIdentity(), name: "Authenticated backend" });

export const operationSchema = z.object({ operation: z.enum(operations), arguments: z.record(z.string(), z.unknown()).default({}) }).strict();
export async function executeOperation(operation: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const parsed = operationSchema.parse({ operation, arguments: args });
  if (operation === "workspace_catalog") return workspaceCatalog(args);
  if (operation === "workspace_preview") return previewWorkspace(args);
  if (operation === "workspace_apply") return applyWorkspace(args);
  if (operation === "billing_catalog") return billingCatalog(args);
  if (operation === "billing_read") return bookView(billingReadInput.parse(args).bookId, backendBillingOwner());
  if (operation === "billing_command") {
    const { bookId, ...command } = billingMcpCommandInput.parse(args);
    const input = billingActionSchemas[command.action].parse(command.input);
    return bookCommand(bookId, { ...command, input }, backendBillingOwner());
  }
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
