import { createHash, createPublicKey, verify } from "node:crypto";
import { assertStaffGrantShape, assertStaffCapsuleShape, canonicalStaffGrant, canonicalStaffCapsule, canonicalEnvelope } from "../../../packages/secure-tax-client/staff-contract.mjs";
import { canonicalBytes, publicKeyBytes, recipientKeyId, SecureTaxError, trustedPublicPins } from "./manifest";
import type { SignedRecipientManifest, SecureTaxEnvelope } from "./envelope";
export interface StaffGrant {
  version: 1; type: "shuug-secure-tax-staff-grant"; grantId: string; workspaceId: string; accountId: string; clientId: string; staffAccountId: string;
  epoch: number; status: "active" | "revoked"; staff: { keyId: string; publicKey: string }; domains: string[]; rights: "read"; issuedAt: string; expiresAt: string;
  signature: { algorithm: "ES256-P1363"; signerKeyId: string; value: string };
}
export interface StaffCapsule {
  version: 1; type: "shuug-secure-tax-staff-capsule"; capsuleId: string; grantId: string; grantEpoch: number; grantDigest: string; manifestId: string; manifestEpoch: number;
  context: SecureTaxEnvelope["context"]; envelopeDigest: string; staffKeyId: string;
  wrap: { suite: "HPKE-P256-SHA256-A256GCM"; mode: "auth"; encapsulatedKey: string; wrappedKey: string };
  issuedAt: string; expiresAt: string; signature: StaffGrant["signature"];
}
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
export const staffGrantDigest = (grant: StaffGrant) => digest(canonicalStaffGrant(grant));
export const staffEnvelopeDigest = (envelope: SecureTaxEnvelope) => digest(canonicalEnvelope(envelope));
export function parseStaffGrant(raw: unknown): StaffGrant {
  try { assertStaffGrantShape(raw); return raw as StaffGrant; }
  catch { throw new SecureTaxError(400, "The signed staff grant does not match the supported public schema."); }
}
export function parseStaffCapsule(raw: unknown): StaffCapsule {
  try { assertStaffCapsuleShape(raw); return raw as StaffCapsule; }
  catch { throw new SecureTaxError(400, "The signed staff capsule does not match the supported ciphertext schema."); }
}
function signature(value: string, signed: StaffGrant["signature"]) {
  const pins = trustedPublicPins();
  if (signed.signerKeyId !== pins.signerKeyId) throw new SecureTaxError(403, "The signed staff document does not match the trusted firm signer.");
  const bytes = publicKeyBytes(pins.signerPublicKey);
  const signer = createPublicKey({ key: { kty: "EC", crv: "P-256", x: bytes.subarray(1, 33).toString("base64url"), y: bytes.subarray(33).toString("base64url") }, format: "jwk" });
  if (!verify("sha256", Buffer.from(value), { key: signer, dsaEncoding: "ieee-p1363" }, canonicalBytes(signed.value, 64))) throw new SecureTaxError(403, "The signed staff document could not be verified.");
}
export const verifyFirmPublicSignature = signature;
function validity(issuedAt: string, expiresAt: string, allowExpired = false) {
  const issued = Date.parse(issuedAt), expires = Date.parse(expiresAt), now = Date.now();
  if (issued > now + 60_000 || expires <= issued || (!allowExpired && expires <= now)) throw new SecureTaxError(409, "The signed staff document is expired or not yet valid.");
}
export function verifyStaffGrantDocument(raw: unknown, allowExpired = false): StaffGrant {
  const grant = parseStaffGrant(raw), pins = trustedPublicPins();
  if (grant.workspaceId !== pins.workspaceId || grant.staff.keyId !== recipientKeyId(grant.staff.publicKey)
    || [pins.signerKeyId, pins.recoveryKeyId].includes(grant.staff.keyId)) throw new SecureTaxError(403, "The staff device does not match this trusted workspace.");
  validity(grant.issuedAt, grant.expiresAt, allowExpired || grant.status === "revoked");
  signature(canonicalStaffGrant(grant), grant.signature);
  return grant;
}
export function verifyStaffCapsuleDocument(raw: unknown, grant: StaffGrant, manifest: SignedRecipientManifest, envelope: SecureTaxEnvelope): StaffCapsule {
  const capsule = parseStaffCapsule(raw);
  validity(capsule.issuedAt, capsule.expiresAt);
  if (capsule.grantId !== grant.grantId || capsule.grantEpoch !== grant.epoch || capsule.grantDigest !== staffGrantDigest(grant)
    || capsule.staffKeyId !== grant.staff.keyId || capsule.manifestId !== manifest.manifestId || capsule.manifestEpoch !== manifest.epoch
    || capsule.context.workspaceId !== grant.workspaceId || capsule.context.accountId !== grant.accountId
    || capsule.context.objectId !== envelope.context.objectId || capsule.context.revision !== envelope.context.revision
    || capsule.context.domain !== envelope.context.domain || !grant.domains.includes(capsule.context.domain)
    || capsule.envelopeDigest !== staffEnvelopeDigest(envelope)
    || Date.parse(capsule.expiresAt) > Math.min(Date.parse(grant.expiresAt), Date.parse(manifest.expiresAt))
    || Date.parse(capsule.issuedAt) < Math.max(Date.parse(grant.issuedAt), Date.parse(manifest.issuedAt))) throw new SecureTaxError(409, "The staff capsule does not cover this exact grant, enrollment and current object revision.");
  publicKeyBytes(capsule.wrap.encapsulatedKey); canonicalBytes(capsule.wrap.wrappedKey, 48);
  signature(canonicalStaffCapsule(capsule), capsule.signature);
  return capsule;
}
