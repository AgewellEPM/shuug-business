import { z } from "zod";
export interface StatementRow { id: string; date: string; description: string; amountCents: number; reference: string }
export function moneyCents(value: string): number {
  const text = value.trim();
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(text)) throw new Error("Use a signed dollar amount with at most two decimal places, without currency symbols or separators.");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return text.startsWith("-") ? -cents : cents;
}
function csvRows(text: string): string[][] {
  if (Buffer.byteLength(text) > 2_000_000) throw new Error("Import at most 2 MB per statement.");
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === undefined) throw new Error("Unclosed CSV quote."); if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += ch; }
    else if (ch === '"') { if (field || closed) throw new Error("Invalid CSV quote."); quoted = true; }
    else if (ch === "," || ch === "\n" || ch === "\r" || ch === undefined) {
      row.push(field); field = ""; closed = false;
      if (ch !== ",") { if (row.some(v => v.trim())) rows.push(row); row = []; if (ch === "\r" && text[i+1] === "\n") i++; }
    } else { if (closed) throw new Error("Unexpected text after CSV quote."); field += ch; }
    if (rows.length > 5001 || field.length > 2000) throw new Error("The statement exceeds the import limits.");
  }
  return rows;
}
export function parseStatementCsv(text: string): StatementRow[] {
  const rows = csvRows(text.replace(/^\uFEFF/, "")), header = rows.shift()?.map(v => v.trim().toLowerCase());
  if (!header || header.join(",") !== "date,description,amount,reference") throw new Error("CSV columns must be date,description,amount,reference. Dates use YYYY-MM-DD; deposits are positive and withdrawals negative. Each bank reference must be unique.");
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
