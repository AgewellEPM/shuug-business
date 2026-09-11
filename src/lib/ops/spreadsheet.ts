/**
 * Spreadsheet → invoices. Pure: takes already-parsed rows (from an .xlsx or .csv)
 * and maps them into SupplierInvoices so an uploaded spreadsheet runs through the
 * same overcharge/anomaly audit as everything else. Header matching is fuzzy
 * (case/spacing/synonyms) so real-world sheets Just Work. No file I/O here.
 */
import { parseDollarsToCents } from "../money";
import type { InvoiceLineItem, SupplierInvoice } from "./model";

export type SheetRow = Record<string, unknown>;

const ALIASES: Record<string, string[]> = {
  vendor: ["vendor", "supplier", "company", "seller", "from"],
  invoice: ["invoice", "invoicenumber", "invoiceno", "invoice#", "invoicenum", "bill", "billnumber", "ref"],
  date: ["date", "txndate", "invoicedate", "billdate"],
  itemCode: ["itemcode", "item", "code", "sku", "part", "partno", "partnumber", "productcode"],
  description: ["description", "desc", "product", "name", "details", "lineitem"],
  unitPrice: ["unitprice", "price", "unit", "rate", "cost", "unitcost", "priceeach"],
  quantity: ["quantity", "qty", "units", "count", "cases"],
};

function norm(key: string): string {
  return key.toLowerCase().replace(/[\s_\-#.]/g, "");
}

/** Find a cell for a logical field by fuzzy header match. */
function cell(row: SheetRow, field: keyof typeof ALIASES): unknown {
  const wanted = ALIASES[field];
  for (const rawKey of Object.keys(row)) {
    if (wanted.includes(norm(rawKey))) return row[rawKey];
  }
  return undefined;
}

function toCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  try {
    return parseDollarsToCents(String(v));
  } catch {
    return null;
  }
}

function toQty(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
}

function str(v: unknown, fallback = ""): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || fallback;
}

export interface ParseResult {
  invoices: SupplierInvoice[];
  rowsRead: number;
  linesMapped: number;
  skipped: number;
}

/**
 * Group rows by (vendor, invoice number) into SupplierInvoices. Rows missing an
 * item code or a usable price are skipped (counted, not silently dropped).
 */
export function rowsToInvoices(rows: SheetRow[]): ParseResult {
  const groups = new Map<string, SupplierInvoice>();
  let linesMapped = 0;
  let skipped = 0;

  rows.forEach((row, i) => {
    const itemCode = str(cell(row, "itemCode"));
    const unitPriceCents = toCents(cell(row, "unitPrice"));
    if (!itemCode || unitPriceCents === null) {
      skipped += 1;
      return;
    }
    const vendor = str(cell(row, "vendor"), "Uploaded");
    const invoiceNumber = str(cell(row, "invoice"), `ROW-${i + 1}`);
    const key = `${vendor}::${invoiceNumber}`;

    const line: InvoiceLineItem = {
      itemCode,
      description: str(cell(row, "description"), itemCode),
      unitPriceCents,
      quantity: toQty(cell(row, "quantity")),
    };
    linesMapped += 1;

    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(key, {
        id: `upload-${key}`,
        vendor,
        invoiceNumber,
        date: str(cell(row, "date")),
        lines: [line],
      });
    }
  });

  return { invoices: [...groups.values()], rowsRead: rows.length, linesMapped, skipped };
}
