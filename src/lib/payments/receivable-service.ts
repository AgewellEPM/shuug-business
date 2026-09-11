import { applyReceivableCommand } from "./ar-store";
import { receivableInvoices } from "./load";
export async function executeReceivableCommand(raw: unknown, actor: string) { return applyReceivableCommand(raw, actor, await receivableInvoices()); }
