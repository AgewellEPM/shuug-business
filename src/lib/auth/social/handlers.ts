import { cookies } from "next/headers";
import { z } from "zod";
import { authPage } from "../forms";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "../config";
import { completeLoginFactor } from "../mfa/store";
import { configuredProviders, providerName, SocialSignInError } from "./providers";
import { claimSocialResult, finishSocialCallback, cancelSocialCallback, socialResultInput, socialStartInput, startSocialSignIn, linkedSocialProviders, unlinkSocialProvider, socialConnectionInput } from "./store";
import { socialCallbackUrl, socialFailure, socialJson, socialRequestSurface, socialResponse } from "./http";

function token(request: Request, surface: string) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (bearer) return bearer;
  if (surface !== "owner") return undefined;
  return request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}
export function socialConfig(request: Request) {
  try { socialRequestSurface(request); return socialResponse(request, { apiVersion: 1, providers: configuredProviders() }); }
  catch (error) { return socialFailure(request, error); }
}
export async function socialStart(request: Request) {
  try {
    const surface = socialRequestSurface(request), input = socialStartInput.parse(await socialJson(request));
    if (surface === "native" && input.audience !== "secure-customer") throw new SocialSignInError("Use the business website for owner sign-in.", 403);
    return socialResponse(request, startSocialSignIn(input, token(request, surface)));
  } catch (error) { return socialFailure(request, error); }
}
export async function socialResult(request: Request) {
  try {
    const surface = socialRequestSurface(request), input = socialResultInput.parse(await socialJson(request));
    return socialResponse(request, claimSocialResult(input, token(request, surface)));
  } catch (error) { return socialFailure(request, error); }
}
export async function socialConnections(request:Request) {
  try {
    const surface=socialRequestSurface(request),input=z.object({audience:z.enum(["owner","secure-customer"])}).strict().parse(await socialJson(request));
    if(surface==="native"&&input.audience!=="secure-customer")throw new SocialSignInError("Use the business website for owner settings.",403);
    return socialResponse(request,{apiVersion:1,providers:linkedSocialProviders(input.audience,token(request,surface))});
  }catch(error){return socialFailure(request,error);}
}
export async function socialUnlink(request:Request) {
  try {
    const surface=socialRequestSurface(request),input=socialConnectionInput.parse(await socialJson(request));
    if(surface==="native"&&input.audience!=="secure-customer")throw new SocialSignInError("Use the business website for owner settings.",403);
    return socialResponse(request,{apiVersion:1,...await unlinkSocialProvider(input,token(request,surface))});
  }catch(error){return socialFailure(request,error);}
}
export async function socialOwnerFactor(request: Request) {
  try {
    if (socialRequestSurface(request) !== "owner") throw new SocialSignInError("Continue from the business sign-in page.", 403);
    const input = z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(40) }).strict().parse(await socialJson(request));
    const result = completeLoginFactor(input.challengeToken, input.code, "staff");
    (await cookies()).set(SESSION_COOKIE, result.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
    return socialResponse(request, { apiVersion: 1, signedIn: true, destination: result.kind === "owner" ? "/" : "/me", recoveryCodes: result.recoveryCodes });
  } catch (error) { return socialFailure(request, error); }
}
export async function socialCallback(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerName((await context.params).provider), url = socialCallbackUrl(request, provider);
    const parameters = request.method === "GET" ? url.searchParams : new URLSearchParams(await boundedCallbackForm(request));
    if (parameters.has("error")) { cancelSocialCallback(provider,parameters.get("state")??""); throw new SocialSignInError("Sign-in was cancelled. Return to the app or previous tab and start again."); }
    await finishSocialCallback(provider, parameters.get("state") ?? "", parameters.get("code") ?? "");
    const appReturn = /Android/i.test(request.headers.get("user-agent") ?? "") ? '<p><a href="gigtaxpros://signin">Return to Gig Tax Pros</a></p>' : "";
    return authPage("Sign-in confirmed", `<p>Return to Gig Tax Pros in the app or your previous browser tab to finish signing in.</p>${appReturn}<p>This page does not contain your account session or encryption key.</p>`);
  } catch (error) {
    return authPage("Sign-in was not completed", `<p>${error instanceof SocialSignInError && error.message.includes("cancelled") ? "Sign-in was cancelled." : "The request expired or could not be verified."} Return to the app or your previous browser tab and start again.</p>`, 400);
  }
}
async function boundedCallbackForm(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded" || !request.body) throw new SocialSignInError();
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 16384) throw new SocialSignInError(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
