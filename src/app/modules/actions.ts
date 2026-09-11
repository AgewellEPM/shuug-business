"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveBusinessRecord, transitionBusinessRecord, recordHistory } from "@/lib/workspace/store";
import { readableBusinessRecords, authorizeRecord } from "@/lib/workspace/access";
import { saveRecordSchema } from "@/lib/workspace/model";
export async function businessRecordAction(command: "save" | "transition", input: unknown) {
  try {
    let result;
    if (command === "save") {
      const parsed = saveRecordSchema.parse(input), identity = await authorizeRecord(parsed.kind, "edit", parsed.fields);
      result = saveBusinessRecord(parsed, identity.actor);
    } else if (command === "transition") {
      const id = z.object({ id: z.uuid() }).parse(input).id;
      const old = (await readableBusinessRecords()).find(r => r.id === id);
      if (!old) throw new Error("Record not available.");
      const identity = await authorizeRecord(old.kind, "edit", old.fields);
      result = transitionBusinessRecord(input, identity.actor);
    } else throw new Error("Unknown operation.");
    revalidatePath("/modules", "layout");
    return { ok: true as const, record: result, records: await readableBusinessRecords() };
  } catch (error) {
    return { ok: false as const, error: error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : error instanceof Error ? error.message : "Could not save the record." };
  }
}
export async function businessHistoryAction(id: string) {
  const record = (await readableBusinessRecords()).find(r => r.id === id);
  if (!record) throw new Error("Record not available.");
  return recordHistory(id);
}
