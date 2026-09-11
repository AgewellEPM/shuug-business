import { z } from "zod";
export const journalLineInput = z.object({ accountNumber: z.number().int().positive(), debitCents: z.number().int().min(0).max(99_999_999_999), creditCents: z.number().int().min(0).max(99_999_999_999) }).strict();
export const journalPostInput = z.object({ date: z.iso.date(), memo: z.string().trim().min(1).max(1000), lines: z.array(journalLineInput).min(2).max(100), reviewed: z.literal(true) }).strict();
export const journalReverseInput = z.object({ id: z.string().min(1).max(100), revision: z.literal(1), date: z.iso.date(), reason: z.string().trim().min(3).max(1000), reviewed: z.literal(true) }).strict();
export const journalCommandInput = z.object({ requestId: z.uuid(), action: z.enum(["journal.post", "journal.reverse"]), input: z.record(z.string(), z.unknown()) }).strict();
export function journalCatalog() { return [{ action: "journal.post", inputSchema: z.toJSONSchema(journalPostInput) }, { action: "journal.reverse", inputSchema: z.toJSONSchema(journalReverseInput) }]; }
