import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { appBaseUrl, setting } from "../../connections/vault";

export type SocialProvider = "google" | "apple";
export class SocialSignInError extends Error {
  constructor(message = "Sign-in could not be verified. Start again.", readonly status = 400, readonly code?: "provider_not_connected") { super(message); }
}
export const providerName = (value: unknown): SocialProvider => {
  if (value !== "google" && value !== "apple") throw new SocialSignInError("Choose Google or Apple.");
  return value;
};
const definitions = {
  google: { authorization: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs", issuer: ["https://accounts.google.com", "accounts.google.com"] },
  apple: { authorization: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token", jwks: "https://appleid.apple.com/auth/keys", issuer: ["https://appleid.apple.com"] },
} as const;
const resolvers = new Map<SocialProvider, JWTVerifyGetKey>();
export function callbackUrl(provider: SocialProvider) {
  const base = new URL(appBaseUrl());
  if (base.protocol !== "https:" || base.username || base.password) throw new SocialSignInError("Configure the public HTTPS sign-in address.", 503);
  return new URL(`/api/auth/social/${provider}/callback`, base).toString();
}
export function providerClientId(provider: SocialProvider): string {
  const value = setting(provider === "google" ? "GIGTAX_GOOGLE_SIGNIN_CLIENT_ID" : "GIGTAX_APPLE_SIGNIN_CLIENT_ID");
  if (!value || value.length > 255 || !/^[A-Za-z0-9._-]+$/.test(value)) throw new SocialSignInError(`${provider === "google" ? "Google" : "Apple"} sign-in still needs its developer configuration.`, 503);
  return value;
}
export function configuredProviders() {
  return Object.fromEntries((["google", "apple"] as const).map(provider => {
    try { providerClientId(provider); const ready = provider === "google" ? !!setting("GIGTAX_GOOGLE_SIGNIN_CLIENT_SECRET") : ["GIGTAX_APPLE_SIGNIN_TEAM_ID", "GIGTAX_APPLE_SIGNIN_KEY_ID", "GIGTAX_APPLE_SIGNIN_PRIVATE_KEY"].every(key => !!setting(key)); return [provider, ready]; }
    catch { return [provider, false]; }
  }));
}
export function authorizationUrl(provider: SocialProvider, state: string, nonce: string, pkceChallenge: string) {
  if (!configuredProviders()[provider]) throw new SocialSignInError("This sign-in provider is not configured yet.", 503);
  const url = new URL(definitions[provider].authorization);
  const query: Record<string, string> = { client_id: providerClientId(provider), redirect_uri: callbackUrl(provider), response_type: "code", state, nonce };
  if (provider === "google") Object.assign(query, { scope: "openid", code_challenge: pkceChallenge, code_challenge_method: "S256", prompt: "select_account" });
  // Apple permits query/code without name/email scopes. We need a stable subject,
  // never profile permissions or automatic email-based account linking.
  else query.response_mode = "query";
  url.search = new URLSearchParams(query).toString(); return url.toString();
}
async function clientSecret(provider: SocialProvider) {
  if (provider === "google") {
    const secret = setting("GIGTAX_GOOGLE_SIGNIN_CLIENT_SECRET");
    if (!secret) throw new SocialSignInError("Google sign-in needs developer configuration.", 503);
    return secret;
  }
  const team = setting("GIGTAX_APPLE_SIGNIN_TEAM_ID"), keyId = setting("GIGTAX_APPLE_SIGNIN_KEY_ID"), pem = setting("GIGTAX_APPLE_SIGNIN_PRIVATE_KEY");
  if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Z0-9]{10}$/.test(keyId) || pem.length > 8192) throw new SocialSignInError("Apple sign-in needs developer configuration.", 503);
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId }).setIssuer(team).setSubject(providerClientId(provider)).setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("5m").sign(key);
}
export async function verifyIdentityToken(provider: SocialProvider, token: string, nonce: string, resolver?: JWTVerifyGetKey) {
  if (token.length > 16384 || nonce.length < 32 || nonce.length > 128) throw new SocialSignInError();
  let key = resolver ?? resolvers.get(provider);
  if (!key) { key = createRemoteJWKSet(new URL(definitions[provider].jwks), { timeoutDuration: 10000, cooldownDuration: 30000, cacheMaxAge: 3600000 }); resolvers.set(provider, key); }
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"], issuer: [...definitions[provider].issuer], audience: providerClientId(provider), requiredClaims: ["sub", "iat", "exp", "nonce"], maxTokenAge: "10m", clockTolerance: 30 });
    const expected = Buffer.from(nonce), actual = Buffer.from(typeof payload.nonce === "string" ? payload.nonce : "");
    if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected) || typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 255) throw new SocialSignInError();
    if (payload.azp !== undefined && payload.azp !== providerClientId(provider)) throw new SocialSignInError();
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== providerClientId(provider)) throw new SocialSignInError();
    return { issuer: definitions[provider].issuer[0], subject: payload.sub };
  } catch { throw new SocialSignInError(); }
}
async function boundedJson(response: Response) {
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("application/json")) throw new SocialSignInError();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let count = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; count += value.length; if (count > 65536) throw new SocialSignInError(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { throw new SocialSignInError(); }
}
export async function exchangeAuthorizationCode(provider: SocialProvider, code: string, nonce: string, verifier: string) {
  if (!code || code.length > 4096) throw new SocialSignInError();
  const body = new URLSearchParams({ client_id: providerClientId(provider), client_secret: await clientSecret(provider), code, grant_type: "authorization_code", redirect_uri: callbackUrl(provider), ...(provider === "google" ? { code_verifier: verifier } : {}) });
  const response = await fetch(definitions[provider].token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  const result = await boundedJson(response);
  if (typeof result.id_token !== "string") throw new SocialSignInError();
  const identity = await verifyIdentityToken(provider, result.id_token, nonce);
  return { ...identity, refreshToken: provider === "apple" && typeof result.refresh_token === "string" && result.refresh_token.length <= 8192 ? result.refresh_token : null };
}
export async function revokeAppleAuthorization(refreshToken: string) {
  if (!refreshToken || refreshToken.length > 8192) throw new SocialSignInError();
  const body = new URLSearchParams({ client_id: providerClientId("apple"), client_secret: await clientSecret("apple"), token: refreshToken, token_type_hint: "refresh_token" });
  const response = await fetch("https://appleid.apple.com/auth/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  await response.body?.cancel();
  if (!response.ok) throw new SocialSignInError("Apple could not confirm revocation. Your connection was kept so you can retry.", 502);
}
