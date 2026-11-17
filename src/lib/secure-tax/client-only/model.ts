import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { publicRecipient, secureTaxId, SECURE_TAX_DOMAINS, MAX_CIPHERTEXT_BYTES } from "../envelope";
import { canonicalBytes, publicKeyBytes, recipientKeyId, SecureTaxError } from "../manifest";

export const PROFILE = "client-only-v1" as const;
const encoded = (size: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).length(Math.ceil(size * 8 / 6));
const timestamp = z.iso.datetime().refine(value => new Date(value).toISOString() === value);
export const clientOnlyManifest = z.object({
  version: z.literal(2), profile: z.literal(PROFILE), manifestId: secureTaxId, workspaceId: secureTaxId,
  accountId: secureTaxId, clientId: secureTaxId, epoch: z.number().int().min(1).max(1_000_000_000),
  client: publicRecipient, issuedAt: timestamp, expiresAt: timestamp,
  signature: z.object({ algorithm: z.literal("ES256-P1363"), signerKeyId: encoded(32), value: encoded(64) }).strict(),
}).strict();
export type ClientOnlyManifest = z.infer<typeof clientOnlyManifest>;
export const clientOnlyEnvelope = z.object({
  version: z.literal(3), profile: z.literal(PROFILE), suite: z.literal("HPKE-P256-SHA256-A256GCM"),
  contentAlgorithm: z.literal("AES-256-GCM"), hpkeMode: z.literal("auth"),
  author: z.object({ role: z.literal("client"), keyId: encoded(32) }).strict(),
  context: z.object({ workspaceId: secureTaxId, accountId: secureTaxId, objectId: secureTaxId,
    revision: z.number().int().min(1).max(1_000_000_000), domain: z.enum(SECURE_TAX_DOMAINS) }).strict(),
  nonce: encoded(12), ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/).min(22).max(Math.ceil(MAX_CIPHERTEXT_BYTES * 8 / 6)),
  recipients: z.tuple([publicRecipient.extend({ role: z.literal("client"), encapsulatedKey: encoded(65), wrappedKey: encoded(48) }).strict()]),
}).strict();
export type ClientOnlyEnvelope = z.infer<typeof clientOnlyEnvelope>;
export function canonicalClientOnlyManifest(m: ClientOnlyManifest) {
  return JSON.stringify([2, "gigtax/client-only-manifest", PROFILE, m.manifestId, m.workspaceId, m.accountId, m.clientId,
    m.epoch, m.client.keyId, m.client.publicKey, m.issuedAt, m.expiresAt]);
}
export function clientOnlyPublicPins() {
  try {
    const workspaceId = secureTaxId.parse(process.env.SHUUG_SECURE_TAX_WORKSPACE_ID);
    const signerPublicKey = process.env.SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY ?? "", signerKeyId = recipientKeyId(signerPublicKey);
    return { version: 2, profile: PROFILE, workspaceId, signerPublicKey, signerKeyId } as const;
  } catch { throw new SecureTaxError(503, "Client-owned encryption needs independently trusted public signing configuration."); }
}
export function verifyClientOnlyManifest(raw: unknown, account: { id: string; clientId: string }, historical = false) {
  const m = clientOnlyManifest.parse(raw), pins = clientOnlyPublicPins();
  if (m.workspaceId !== pins.workspaceId || m.accountId !== account.id || m.clientId !== account.clientId) throw new SecureTaxError(403, "The client-owned manifest belongs to another account or workspace.");
  if (m.signature.signerKeyId !== pins.signerKeyId || m.client.keyId !== recipientKeyId(m.client.publicKey) || m.client.keyId === pins.signerKeyId) throw new SecureTaxError(403, "The client-owned public key binding is invalid.");
  const issued = Date.parse(m.issuedAt), expires = Date.parse(m.expiresAt);
  if (issued > Date.now() + 60000 || expires <= issued || !historical && expires <= Date.now()) throw new SecureTaxError(409, "The client-owned manifest expired or is not yet valid.");
  const key = publicKeyBytes(pins.signerPublicKey), signer = createPublicKey({ key: { kty: "EC", crv: "P-256", x: key.subarray(1, 33).toString("base64url"), y: key.subarray(33, 65).toString("base64url") }, format: "jwk" });
  if (!verify("sha256", Buffer.from(canonicalClientOnlyManifest(m)), { key: signer, dsaEncoding: "ieee-p1363" }, canonicalBytes(m.signature.value, 64))) throw new SecureTaxError(403, "The client-owned manifest signature is invalid.");
  return m;
}
export function validateClientOnlyEnvelope(raw: unknown, manifest: ClientOnlyManifest) {
  const e = clientOnlyEnvelope.parse(raw), slot = e.recipients[0];
  if (e.context.workspaceId !== manifest.workspaceId || e.context.accountId !== manifest.accountId || e.author.keyId !== manifest.client.keyId
    || slot.keyId !== manifest.client.keyId || slot.publicKey !== manifest.client.publicKey || recipientKeyId(slot.publicKey) !== slot.keyId) throw new SecureTaxError(403, "The encrypted item does not match the immutable client key and scope.");
  publicKeyBytes(slot.encapsulatedKey); canonicalBytes(slot.wrappedKey, 48); canonicalBytes(e.nonce, 12);
  const size = canonicalBytes(e.ciphertext).length;
  if (size < 16 || size > MAX_CIPHERTEXT_BYTES) throw new SecureTaxError(413, "The client-owned encrypted item exceeds storage bounds.");
  return { envelope: e, size };
}
