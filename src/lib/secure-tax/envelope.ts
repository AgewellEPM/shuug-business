import { z } from "zod";

export const SECURE_TAX_DOMAINS = ["tax-document", "tax-identity", "driver-record", "driver-receipt", "driver-state", "driver-route", "provider-record"] as const;
export const MAX_CIPHERTEXT_BYTES = 16 * 1024 * 1024;
export const secureTaxId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/);
const base64url = (bytes: number) => z.string().regex(/^[A-Za-z0-9_-]+(?![\s\S])/).length(Math.ceil(bytes * 8 / 6));
export const publicRecipient = z.object({ keyId: base64url(32), publicKey: base64url(65) }).strict();
const recipient = <T extends "client" | "firm-recovery">(role: T) => publicRecipient.extend({ role: z.literal(role), encapsulatedKey: base64url(65), wrappedKey: base64url(48) }).strict();
export const secureTaxEnvelope = z.object({
  version: z.literal(2), suite: z.literal("HPKE-P256-SHA256-A256GCM"), contentAlgorithm: z.literal("AES-256-GCM"), hpkeMode: z.literal("auth"),
  author: z.object({ role: z.enum(["client", "firm-recovery"]), keyId: base64url(32) }).strict(),
  context: z.object({ workspaceId: secureTaxId, accountId: secureTaxId, objectId: secureTaxId, revision: z.number().int().min(1).max(1_000_000_000), domain: z.enum(SECURE_TAX_DOMAINS) }).strict(),
  nonce: base64url(12),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+(?![\s\S])/).min(Math.ceil(16 * 8 / 6)).max(Math.ceil(MAX_CIPHERTEXT_BYTES * 8 / 6)),
  recipients: z.tuple([recipient("client"), recipient("firm-recovery")]),
}).strict();
export type SecureTaxEnvelope = z.infer<typeof secureTaxEnvelope>;
export const signedRecipientManifest = z.object({
  version: z.literal(1), manifestId: secureTaxId, workspaceId: secureTaxId, accountId: secureTaxId, clientId: secureTaxId,
  epoch: z.number().int().min(1).max(1_000_000_000), client: publicRecipient, firmRecovery: publicRecipient,
  issuedAt: z.iso.datetime().refine(value => value === value.trim()), expiresAt: z.iso.datetime().refine(value => value === value.trim()),
  signature: z.object({ algorithm: z.literal("ES256-P1363"), signerKeyId: base64url(32), value: base64url(64) }).strict(),
}).strict();
export type SignedRecipientManifest = z.infer<typeof signedRecipientManifest>;
export function canonicalManifest(manifest: SignedRecipientManifest) {
  return JSON.stringify([1, "shuug/secure-tax-manifest", manifest.manifestId, manifest.workspaceId, manifest.accountId, manifest.clientId,
    manifest.epoch, manifest.client.keyId, manifest.client.publicKey, manifest.firmRecovery.keyId, manifest.firmRecovery.publicKey, manifest.issuedAt, manifest.expiresAt]);
}
