import { setPrivateAccountAccess } from "@/lib/secure-tax/account-access";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureJson, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
import { workspaceDatabase } from "@/lib/workspace/database";
import { hasClientOnlyBinding } from "@/lib/secure-tax/client-only/guard";
import { SecureTaxError } from "@/lib/secure-tax/manifest";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const token = staffApiToken(request, true), input = z.object({ accountCode: z.uuid(), enabled: z.boolean() }).strict().parse(await secureJson(request, 1024));
    if (!workspaceDatabase(db => hasClientOnlyBinding(db, { accountId: input.accountCode }))) throw new SecureTaxError(409, "Use the matching client-owned account code.");
    return secureResponse(request, setPrivateAccountAccess(token, input));
  } catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
