import { z } from "zod";
export const bookIdInput = z.union([z.literal("office"), z.uuid()]);
export function journalStateName(bookId = "office") { return bookIdInput.parse(bookId) === "office" ? "manual-journal" : `client-journal:${bookId}`; }
