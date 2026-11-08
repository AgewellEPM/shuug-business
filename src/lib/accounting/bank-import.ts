import { z } from "zod";
export interface StatementRow { id: string; date: string; description: string; amountCents: number; reference: string }
const column = z.number().int().min(0).max(99);
const mappingFields = { dateColumn: column, descriptionColumn: column, referenceColumn: column.nullable(), dateFormat: z.enum(["iso", "mdy", "dmy"]), headerRow: z.number().int().min(0).max(20) };
export const statementMappingInput = z.discriminatedUnion("mode", [
  z.object({ ...mappingFields, mode: z.literal("signed"), amountColumn: column, positiveMeans: z.enum(["deposit", "withdrawal"]) }).strict(),
  z.object({ ...mappingFields, mode: z.literal("split"), debitColumn: column, creditColumn: column }).strict(),
]).superRefine((value, context) => {
  const columns = [value.dateColumn, value.descriptionColumn, ...(value.referenceColumn === null ? [] : [value.referenceColumn]), ...(value.mode === "signed" ? [value.amountColumn] : [value.debitColumn, value.creditColumn])];
  if (new Set(columns).size !== columns.length) context.addIssue({ code: "custom", message: "Choose a different column for each field." });
});
export type StatementMapping = z.infer<typeof statementMappingInput>;
export function moneyCents(value: string): number {
  const text = value.trim();
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(text)) throw new Error("Use a signed dollar amount with at most two decimal places, without currency symbols or separators.");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return text.startsWith("-") ? -cents : cents;
}
function csvRows(text: string, keepEmpty = false): string[][] {
  if (new TextEncoder().encode(text).byteLength > 2_000_000) throw new Error("Import at most 2 MB per statement.");
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === undefined) throw new Error("Unclosed CSV quote."); if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += ch; }
    else if (ch === '"') { if (field || closed) throw new Error("Invalid CSV quote."); quoted = true; }
    else if (ch === "," || ch === "\n" || ch === "\r" || ch === undefined) {
      row.push(field); field = ""; closed = false;
      if (ch !== ",") { if (row.some(v => v.trim()) || (keepEmpty && ch !== undefined)) rows.push(row); row = []; if (ch === "\r" && text[i+1] === "\n") i++; }
    } else { if (closed) throw new Error("Unexpected text after CSV quote."); field += ch; }
    if (rows.length > 5021 || row.length > 100 || field.length > 2000) throw new Error("The statement exceeds the import limits.");
  }
  return rows;
}
export function statementCsvColumns(text: string, headerRow = 0): string[] {
  const rows = csvRows(text.replace(/^\uFEFF/, ""), true);
  return rows[headerRow]?.map((label, i) => label.trim() || `Column ${i + 1}`) ?? [];
}
function mappedMoney(value: string): number {
  let text = value.trim(), negative = false;
  if (text.startsWith("(") && text.endsWith(")")) { negative = true; text = text.slice(1, -1).trim(); }
  text = text.replace(/^\$/, "").replace(/^([-+])\$/, "$1");
  if (!/^[+-]?(?:\d{1,9}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text) || (negative && /^[+-]/.test(text))) throw new Error("Use USD amounts with valid grouping, two decimal places, and one sign or parentheses.");
  return moneyCents((negative ? "-" : "") + text.replace(/^\+/, "").replaceAll(",", ""));
}
function mappedDate(value: string, format: StatementMapping["dateFormat"]) {
  if (format === "iso") return z.iso.date().parse(value);
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error("Use the selected date format with a four-digit year.");
  const month = (format === "mdy" ? match[1] : match[2]).padStart(2, "0"), day = (format === "mdy" ? match[2] : match[1]).padStart(2, "0");
  return z.iso.date().parse(`${match[3]}-${month}-${day}`);
}
function mappedRows(text: string, raw: StatementMapping, referencePrefix: string): StatementRow[] {
  const parsed = statementMappingInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Choose valid statement columns.");
  const mapping = parsed.data, cells = csvRows(text.replace(/^\uFEFF/, ""), true);
  const header = cells[mapping.headerRow], rows = cells.slice(mapping.headerRow + 1).filter(row => row.some(value => value.trim()));
  if (!header || header.length > 100 || !rows.length || rows.length > 5000) throw new Error("Choose a header followed by 1 to 5,000 transaction rows.");
  const selected = [mapping.dateColumn, mapping.descriptionColumn, ...(mapping.referenceColumn === null ? [] : [mapping.referenceColumn]), ...(mapping.mode === "signed" ? [mapping.amountColumn] : [mapping.debitColumn, mapping.creditColumn])];
  if (selected.some(index => index >= header.length)) throw new Error("A mapped column is missing. Choose the columns again.");
  const references = new Set<string>();
  return rows.map((cells, index) => {
    try {
      if (cells.length !== header.length) throw new Error("Column count differs from the header.");
      const row = cells.map(value => value.trim());
      const date = mappedDate(row[mapping.dateColumn], mapping.dateFormat), description = z.string().min(1).max(500).parse(row[mapping.descriptionColumn]);
      let amountCents: number;
      if (mapping.mode === "signed") amountCents = mappedMoney(row[mapping.amountColumn]) * (mapping.positiveMeans === "deposit" ? 1 : -1);
      else {
        const debit = row[mapping.debitColumn] ? mappedMoney(row[mapping.debitColumn]) : 0, credit = row[mapping.creditColumn] ? mappedMoney(row[mapping.creditColumn]) : 0;
        if (debit < 0 || credit < 0 || (debit && credit)) throw new Error("Use nonnegative debit/credit columns with exactly one populated amount per row.");
        amountCents = credit - debit;
      }
      if (!amountCents) throw new Error("Zero-amount rows are not transactions. Remove statement headings or totals before importing.");
      const reference = z.string().min(1).max(160).parse(mapping.referenceColumn === null ? `${referencePrefix}:${index + 1}` : row[mapping.referenceColumn]);
      if (references.has(reference)) throw new Error(`Duplicate bank reference: ${reference}`);
      references.add(reference);return { id: String(index + 1), date, description, amountCents, reference };
    } catch (error) { throw new Error(`CSV row ${mapping.headerRow + index + 2}: ${error instanceof z.ZodError ? "Check the selected date, description and reference fields." : error instanceof Error ? error.message : "Invalid transaction."}`); }
  });
}
export function parseStatementCsv(text: string, mapping?: StatementMapping, referencePrefix = "shuug-statement"): StatementRow[] {
  if (mapping) return mappedRows(text, mapping, referencePrefix);
  const rows = csvRows(text.replace(/^\uFEFF/, "")), header = rows.shift()?.map(v => v.trim().toLowerCase());
  if (!header || header.join(",") !== "date,description,amount,reference") throw new Error("CSV columns must be date,description,amount,reference. Dates use YYYY-MM-DD; deposits are positive and withdrawals negative. Each bank reference must be unique.");
  if (!rows.length || rows.length > 5000) throw new Error("Import 1 to 5,000 transaction rows.");
  const references = new Set<string>();
  return rows.map((row, i) => {
    if (row.length !== 4) throw new Error(`Row ${i + 2} must contain four columns.`);
    const [date, description, amount, reference] = row.map(v => v.trim());
    z.iso.date().parse(date); z.string().min(1).max(500).parse(description); z.string().min(1).max(160).parse(reference);
    const amountCents = moneyCents(amount);
    if (!amountCents) throw new Error(`Row ${i + 2} has a zero amount.`);
    if (references.has(reference)) throw new Error(`Duplicate bank reference: ${reference}`);
    references.add(reference); return { id: String(i + 1), date, description, amountCents, reference };
  });
}
