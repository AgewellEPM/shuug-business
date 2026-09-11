"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/**
 * Upload an Excel (.xlsx/.xls) or CSV file of invoices/transactions, parse it,
 * and add the rows so they run through the overcharge/anomaly audit. Fail-fast
 * on unreadable files; skipped rows are reported, not silently dropped.
 */
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { rowsToInvoices, type SheetRow } from "@/lib/ops/spreadsheet";
import { addUploadedInvoices } from "@/lib/ops/store";

export interface UploadResult {
  ok: boolean;
  message: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadSpreadsheetAction(formData: FormData): Promise<UploadResult> {
  try {
  await requireSectionAccess("money", "edit");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { ok: false, message: "File too large (max 5 MB)." };
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { ok: false, message: "Upload an .xlsx, .xls, or .csv file." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { ok: false, message: "The file has no sheets." };
    const rows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: "" });

    const parsed = rowsToInvoices(rows);
    if (parsed.invoices.length === 0) {
      return {
        ok: false,
        message: `Read ${parsed.rowsRead} rows but found no priced item lines. Expected columns like vendor, invoice, item code, unit price, quantity.`,
      };
    }
    const record = addUploadedInvoices(file.name, parsed.invoices, parsed);
    revalidatePath("/invoices");
    return {
      ok: true,
      message: `Imported ${record.invoicesAdded} invoices (${record.linesMapped} lines) from ${file.name}${record.skipped ? `, skipped ${record.skipped} rows` : ""}. Now audited below.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not read the file" };
  }
}
