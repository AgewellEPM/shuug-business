import { getBranding } from "../branding/store";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { listRecords } from "../sdk/records";
import type { ModuleRecord } from "../sdk/types";

const text = (row: ModuleRecord, key: string) => typeof row.values[key] === "string" ? row.values[key] as string : "";
const year = (row: ModuleRecord) => Number.isInteger(row.values.tax_year) && Number(row.values.tax_year) >= 1900 && Number(row.values.tax_year) <= 9999 ? Number(row.values.tax_year) : null;
const date = (row: ModuleRecord, key: string) => /^\d{4}-\d{2}-\d{2}$/.test(text(row, key)) ? text(row, key) : "";

/** Server-only projection. Called after customer authentication with its linked service client.
 * Legacy records are private by default. Children require their own explicit share
 * flag AND an unarchived, shared parent belonging to the same client. */
export function clientTaxSummary(clientId: string) {
  const brand = getBranding();
  if (brand.industrySetup?.industryId !== "tax-firm") return null;
  const visible = new Set(visibleItems(brand, catalogWithTools()).map(item => item.id));
  const shared = (moduleId: string) => visible.has(`module:${moduleId}`)
    ? listRecords(moduleId).filter(row => !row.archived && row.values.client_visible === true && row.values.client_id === clientId) : [];
  const documents = shared("tax-document-requests");
  const records = shared("rideshare-tax-records");
  return {
    engagements: shared("tax-engagements").map(row => ({
      name: text(row, "name"), year: year(row), stage: text(row, "stage"), message: text(row, "client_message"),
      documents: documents.filter(item => item.values.engagement_id === row.id).map(item => ({
        name: text(item, "name"), status: text(item, "status"), requestedBy: date(item, "due"), message: text(item, "client_message"),
      })),
      records: records.filter(item => item.values.engagement_id === row.id).map(item => ({
        name: text(item, "name"), platform: text(item, "platform"), income: text(item, "income_records"),
        mileage: text(item, "mileage_records"), expenses: text(item, "expense_records"), message: text(item, "client_message"),
      })),
    })),
    quarterly: shared("tax-quarterly-reviews").map(row => ({
      name: text(row, "name"), year: year(row), quarter: text(row, "quarter"), status: text(row, "status"),
      reviewOn: date(row, "due"), message: text(row, "client_message"),
    })),
  };
}

export type ClientTaxSummary = NonNullable<ReturnType<typeof clientTaxSummary>>;
