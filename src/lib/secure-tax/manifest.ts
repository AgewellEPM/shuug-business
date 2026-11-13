import { createHash, createPublicKey, ECDH, verify } from "node:crypto";
import { canonicalManifest, signedRecipientManifest, secureTaxId, type SecureTaxEnvelope, type SignedRecipientManifest } from "./envelope";

export class SecureTaxError extends Error { constructor(public status: number, message: string) { super(message); } }
export function canonicalBytes(value: string, length?: number) {
  const bytes = Buffer.from(value, "base64url");
  if (!/^[A-Za-z0-9_-]+$/.test(value) || bytes.toString("base64url") !== value || (length !== undefined && bytes.length !== length)) throw new SecureTaxError(400, "Invalid encrypted-envelope encoding.");
  return bytes;
}
export function publicKeyBytes(value: string) {
  const bytes = canonicalBytes(value, 65);
  try {
    if (bytes[0] !== 4 || !Buffer.from(ECDH.convertKey(bytes, "prime256v1", undefined, undefined, "uncompressed")).equals(bytes)) throw new Error("Invalid curve point");
  } catch { throw new SecureTaxError(400, "Invalid recipient public key."); }
  return bytes;
}
export const recipientKeyId = (key: string) => createHash("sha256").update(publicKeyBytes(key)).digest("base64url");
export function trustedPublicPins() {
  try {
    const signerPublicKey = process.env.SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY ?? "";
    const recoveryPublicKey = process.env.SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY ?? "";
    const workspaceId = secureTaxId.parse(process.env.SHUUG_SECURE_TAX_WORKSPACE_ID);
    const signerKeyId = recipientKeyId(signerPublicKey), recoveryKeyId = recipientKeyId(recoveryPublicKey);
    if (signerKeyId === recoveryKeyId) throw new Error("Separate signing and recovery keys required");
    return { signerPublicKey, signerKeyId, recoveryPublicKey, recoveryKeyId, workspaceId };
  } catch { throw new SecureTaxError(503, "Client-encrypted storage is disabled until trusted public recipient pins are configured."); }
}
/** Verifies the public document, including an expired lease, for renewal only.
 * This is never authority for encrypted reads/writes or staff sharing. */
export function verifyRecipientManifestDocument(raw: unknown, account: { id: string; clientId: string }) {
  const manifest = signedRecipientManifest.parse(raw), pins = trustedPublicPins();
  if (manifest.accountId !== account.id || manifest.clientId !== account.clientId || manifest.workspaceId !== pins.workspaceId) throw new SecureTaxError(403, "The signed key manifest does not belong to this client workspace.");
  if (manifest.signature.signerKeyId !== pins.signerKeyId || manifest.firmRecovery.keyId !== pins.recoveryKeyId || manifest.firmRecovery.publicKey !== pins.recoveryPublicKey) throw new SecureTaxError(403, "The recipient manifest does not match the separately trusted public pins.");
  if (manifest.client.keyId !== recipientKeyId(manifest.client.publicKey) || manifest.firmRecovery.keyId !== recipientKeyId(manifest.firmRecovery.publicKey)) throw new SecureTaxError(400, "Recipient key fingerprints do not match their public keys.");
  if ([pins.signerKeyId, pins.recoveryKeyId].includes(manifest.client.keyId)) throw new SecureTaxError(400, "Client, recovery and signing recipients must use separate keys.");
  const now = Date.now(), issued = Date.parse(manifest.issuedAt), expires = Date.parse(manifest.expiresAt);
  if (issued > now + 60_000 || expires <= issued) throw new SecureTaxError(409, "The signed key manifest is expired or not yet valid.");
  const key = publicKeyBytes(pins.signerPublicKey);
  const signer = createPublicKey({ key: { kty: "EC", crv: "P-256", x: key.subarray(1, 33).toString("base64url"), y: key.subarray(33, 65).toString("base64url") }, format: "jwk" });
  if (!verify("sha256", Buffer.from(canonicalManifest(manifest), "utf8"), { key: signer, dsaEncoding: "ieee-p1363" }, canonicalBytes(manifest.signature.value, 64))) throw new SecureTaxError(403, "The recipient manifest signature is invalid.");
  return manifest;
}
export function verifyRecipientManifest(raw:unknown,account:{id:string;clientId:string}){
  const manifest=verifyRecipientManifestDocument(raw,account);
  if(Date.parse(manifest.expiresAt)<=Date.now())throw new SecureTaxError(409,"The signed key manifest is expired or not yet valid.");
  return manifest;
}
export function validateEnvelopePins(envelope: SecureTaxEnvelope, manifest: SignedRecipientManifest) {
  const { context, recipients } = envelope;
  if (context.workspaceId !== manifest.workspaceId || context.accountId !== manifest.accountId) throw new SecureTaxError(403, "The encrypted object belongs to another client workspace.");
  const author = envelope.author.role === "client" ? manifest.client : manifest.firmRecovery;
  if (envelope.author.keyId !== author.keyId) throw new SecureTaxError(403, "The encrypted object's author does not match an enrolled recipient.");
  for (const [index, expected] of [manifest.client, manifest.firmRecovery].entries()) {
    const recipient = recipients[index];
    if (recipient.keyId !== expected.keyId || recipient.publicKey !== expected.publicKey || recipient.keyId !== recipientKeyId(recipient.publicKey)) throw new SecureTaxError(403, "Encrypted-object recipients do not match the trusted enrolled keys.");
    publicKeyBytes(recipient.encapsulatedKey); canonicalBytes(recipient.wrappedKey, 48);
  }
  canonicalBytes(envelope.nonce, 12);
  const ciphertext = canonicalBytes(envelope.ciphertext);
  if (ciphertext.length < 16 || ciphertext.length > 16 * 1024 * 1024) throw new SecureTaxError(413, "The encrypted object exceeds its size bounds.");
  return ciphertext.length;
}
