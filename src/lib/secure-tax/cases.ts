import { z } from "zod";
import { assertCaseApproval, canonicalCaseApproval } from "../../../packages/secure-tax-client/case-contract.mjs";
import { secureTaxEnvelope } from "./envelope";
import { SecureTaxError, trustedPublicPins } from "./manifest";
import { staffEnvelopeDigest, verifyFirmPublicSignature, parseStaffCapsule } from "./staff-model";

export interface CaseApproval {
  version: 1; type: "shuug-secure-tax-case-approval"; approvalId: string; proposalId: string;
  workspaceId: string; accountId: string; clientId: string; objectId: string; sourceRevision: number; sourceEnvelopeDigest: string | null;
  manifestId: string; manifestEpoch: number; grantId: string; grantEpoch: number; grantDigest: string; staffAccountId: string; staffKeyId: string;
  proposalDigest: string; reviewCommitment: string; newEnvelopeDigest: string; reviewReference: string; issuedAt: string; expiresAt: string;
  signature: { algorithm: "ES256-P1363"; signerKeyId: string; value: string };
}
/** The host checks public approval/CAS only. Case actions, dependencies and
 * historical review certificates remain inside the approved ciphertext. */
export function verifyCasePacket(raw: unknown) {
  const packet = z.object({ approval: z.unknown(), envelope: secureTaxEnvelope, capsule: z.unknown() }).strict().parse(raw);
  try { assertCaseApproval(packet.approval); } catch { throw new SecureTaxError(400, "The case approval does not match the supported public contract."); }
  const approval = packet.approval as CaseApproval, pins = trustedPublicPins(), context = packet.envelope.context;
  if (approval.workspaceId !== pins.workspaceId || approval.signature.signerKeyId !== pins.signerKeyId
    || context.workspaceId !== approval.workspaceId || context.accountId !== approval.accountId || context.objectId !== approval.objectId
    || context.domain !== "tax-document" || context.revision !== approval.sourceRevision + 1
    || packet.envelope.author.role !== "firm-recovery" || packet.envelope.author.keyId !== pins.recoveryKeyId
    || staffEnvelopeDigest(packet.envelope) !== approval.newEnvelopeDigest) throw new SecureTaxError(403, "The firm approval does not cover this exact encrypted case revision.");
  if (Date.parse(approval.issuedAt) > Date.now() + 60000 || Date.parse(approval.expiresAt) <= Date.now()) throw new SecureTaxError(409, "The case publication approval is expired or not yet valid.");
  verifyFirmPublicSignature(canonicalCaseApproval(approval), approval.signature);
  return { approval, envelope: packet.envelope, capsule: parseStaffCapsule(packet.capsule) };
}
