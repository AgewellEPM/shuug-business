// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyIdentityToken, authorizationUrl } from "./providers";
let key: Awaited<ReturnType<typeof generateKeyPair>>, resolver: ReturnType<typeof createLocalJWKSet>;
const nonce = "n".repeat(43), clientId = "synthetic-web.apps.googleusercontent.com";
beforeEach(async () => {
  vi.stubEnv("DEALDESK_DATA_DIR", "/tmp/gigtax-social-no-customer-vault");vi.stubEnv("APP_BASE_URL", "https://workspace.example.com");
  vi.stubEnv("GIGTAX_GOOGLE_SIGNIN_CLIENT_ID", clientId);vi.stubEnv("GIGTAX_GOOGLE_SIGNIN_CLIENT_SECRET", "synthetic-client-secret");
  key = await generateKeyPair("RS256");resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(key.publicKey), kid: "synthetic", alg: "RS256" }] });
});
afterEach(() => vi.unstubAllEnvs());
const signed = (claims: Record<string, unknown> = {}, issuer = "https://accounts.google.com", audience = clientId, expiration = "5m") => new SignJWT({ sub: "synthetic-provider-subject", nonce, ...claims }).setProtectedHeader({ alg: "RS256", kid: "synthetic" }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(key.privateKey);
it("verifies the real JWT signature, issuer, audience and nonce before returning only the stable provider subject", async () => {
  const token = await signed({ email: "synthetic@example.net", email_verified: true, name: "Synthetic name" });
  expect(await verifyIdentityToken("google", token, nonce, resolver)).toEqual({ issuer: "https://accounts.google.com", subject: "synthetic-provider-subject" });
  for (const invalid of [await signed({}, "https://foreign.example"), await signed({}, undefined, "another-client"), await signed({ nonce: "different-nonce" }), await signed({}, undefined, undefined, "-1m"), await signed({ azp: "another-client" }), token.slice(0, -12) + "tamperedtoken"]) {
    await expect(verifyIdentityToken("google", invalid, nonce, resolver)).rejects.toThrow("could not be verified");
  }
});
it("uses exact fixed HTTPS callbacks and minimal identity scope with a nonce, state and S256 PKCE", () => {
  const url = new URL(authorizationUrl("google", "s".repeat(43), nonce, "c".repeat(43)));
  expect(url.origin).toBe("https://accounts.google.com");expect(url.searchParams.get("scope")).toBe("openid");expect(url.searchParams.get("code_challenge_method")).toBe("S256");expect(url.searchParams.get("nonce")).toBe(nonce);expect(url.searchParams.get("redirect_uri")).toBe("https://workspace.example.com/api/auth/social/google/callback");
});
