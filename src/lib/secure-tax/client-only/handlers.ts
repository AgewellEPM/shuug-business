import { z } from "zod";
import { workspaceDatabase } from "../../workspace/database";
import { requireSecureBrowserOrigin, secureRequestToken, secureJson, secureResponse, secureFailure } from "../http";
import { staffApiToken } from "../staff-http";
import { changePrivateAccountPassword, revokePrivateAccountSessions } from "../account-access";
import { clientOnlyAccount, clientOnlyStatus, clientOnlyRenewalRequest, enrollClientOnly, readClientOnlyObject, writeClientOnlyObject, deleteClientOnlyObject, listClientOnlyChanges } from "./store";
import { issueClientOnlyInvitation, revokeClientOnlyInvitation, clientOnlyActivationChallenge, activateClientOnlyAccount } from "./activation";

function authenticate(request: Request, mutation = false) {
  const token = secureRequestToken(request, mutation); workspaceDatabase(db => clientOnlyAccount(db, token)); return token;
}
function activationSurface(request: Request) {
  // Native callers still need the one-use invitation and cryptographic key proof.
  // The absence of browser headers does not identify or trust an installed app.
  if (!request.headers.has("origin") && !request.headers.has("sec-fetch-site") && !request.headers.has("cookie")) return;
  requireSecureBrowserOrigin(request);
}
export function status(request: Request) {
  try { return secureResponse(request, clientOnlyStatus(authenticate(request))); } catch (error) { return secureFailure(request, error); }
}
export async function enroll(request: Request) {
  try { const token = authenticate(request, true); return secureResponse(request, enrollClientOnly(token, await secureJson(request, 16384))); } catch (error) { return secureFailure(request, error); }
}
export function renewalRequest(request: Request) {
  try { return secureResponse(request, clientOnlyRenewalRequest(authenticate(request))); } catch (error) { return secureFailure(request, error); }
}
export async function renew(request: Request) {
  try { const token = authenticate(request, true), input = z.object({ manifest: z.unknown() }).strict().parse(await secureJson(request, 16384)); return secureResponse(request, enrollClientOnly(token, input.manifest)); } catch (error) { return secureFailure(request, error); }
}
export function changes(request: Request) {
  try { const token = authenticate(request), query = new URL(request.url).searchParams; return secureResponse(request, listClientOnlyChanges(token, Number(query.get("after") ?? 0), Number(query.get("limit") ?? 100))); } catch (error) { return secureFailure(request, error); }
}
type Context = { params: Promise<{ id: string }> };
export async function readObject(request: Request, context: Context) {
  try { return secureResponse(request, readClientOnlyObject(authenticate(request), (await context.params).id)); } catch (error) { return secureFailure(request, error); }
}
export async function putObject(request: Request, context: Context) {
  try { const token = authenticate(request, true), id = (await context.params).id; return secureResponse(request, writeClientOnlyObject(token, id, await secureJson(request, 24 * 1024 * 1024))); } catch (error) { return secureFailure(request, error); }
}
export async function deleteObject(request: Request, context: Context) {
  try { const token = authenticate(request, true), id = (await context.params).id; return secureResponse(request, deleteClientOnlyObject(token, id, await secureJson(request, 1024))); } catch (error) { return secureFailure(request, error); }
}
export async function invitation(request: Request) {
  try { const token = staffApiToken(request, true); z.object({}).strict().parse(await secureJson(request, 1024)); return secureResponse(request, issueClientOnlyInvitation(token)); } catch (error) { return secureFailure(request, error); }
}
export async function revokeInvitation(request: Request) {
  try { const token = staffApiToken(request, true); return secureResponse(request, revokeClientOnlyInvitation(token, await secureJson(request, 1024))); } catch (error) { return secureFailure(request, error); }
}
export async function activationChallenge(request: Request) {
  try { activationSurface(request); return secureResponse(request, await clientOnlyActivationChallenge(await secureJson(request, 16384))); } catch (error) { return secureFailure(request, error); }
}
export async function activate(request: Request) {
  try { activationSurface(request); return secureResponse(request, await activateClientOnlyAccount(await secureJson(request, 131072))); } catch (error) { return secureFailure(request, error); }
}
export async function accountPassword(request: Request) {
  try { requireSecureBrowserOrigin(request); const token = authenticate(request, true); return secureResponse(request, changePrivateAccountPassword(token, await secureJson(request, 2048))); } catch (error) { return secureFailure(request, error); }
}
export function accountSessions(request: Request) {
  try { requireSecureBrowserOrigin(request); return secureResponse(request, revokePrivateAccountSessions(authenticate(request, true))); } catch (error) { return secureFailure(request, error); }
}
