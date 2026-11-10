import { z } from "zod";
import { assertReturnEditApproval, canonicalReturnEditApproval } from "../../../packages/secure-tax-client/return-edit-contract.mjs";
import { secureTaxEnvelope } from "./envelope";
import { SecureTaxError, trustedPublicPins } from "./manifest";
import { staffEnvelopeDigest, verifyFirmPublicSignature, parseStaffCapsule } from "./staff-model";

export interface ReturnEditApproval {
  version: 1; type: "shuug-secure-tax-return-edit-approval"; approvalId: string; proposalId: string;
  workspaceId: string; accountId: string; clientId: string; objectId: string; sourceRevision: number; sourceEnvelopeDigest: string;
  manifestId: string; manifestEpoch: number; grantId: string; grantEpoch: number; grantDigest: string; staffAccountId: string; staffKeyId: string;
  proposalDigest: string; reviewCommitment: string; newEnvelopeDigest: string; reviewReference: string; issuedAt: string; expiresAt: string;
  signature: { algorithm: "ES256-P1363"; signerKeyId: string; value: string };
}
export function verifyReturnEditPacket(raw: unknown) {
  const packet = z.object({ approval: z.unknown(), envelope: secureTaxEnvelope, capsule: z.unknown() }).strict().parse(raw);
  try { assertReturnEditApproval(packet.approval); } catch { throw new SecureTaxError(400, "The return edit approval does not match the supported public contract."); }
  const approval = packet.approval as ReturnEditApproval, pins = trustedPublicPins(), context = packet.envelope.context;
  if (approval.workspaceId !== pins.workspaceId || approval.signature.signerKeyId !== pins.signerKeyId
    || context.workspaceId !== approval.workspaceId || context.accountId !== approval.accountId || context.objectId !== approval.objectId
    || context.domain !== "tax-document" || context.revision !== approval.sourceRevision + 1
    || packet.envelope.author.role !== "firm-recovery" || packet.envelope.author.keyId !== pins.recoveryKeyId
    || staffEnvelopeDigest(packet.envelope) !== approval.newEnvelopeDigest) throw new SecureTaxError(403, "The firm approval does not cover this exact return replacement.");
  if (Date.parse(approval.issuedAt) > Date.now() + 60000 || Date.parse(approval.expiresAt) <= Date.now()) throw new SecureTaxError(409, "The return edit approval is expired or not yet valid.");
  verifyFirmPublicSignature(canonicalReturnEditApproval(approval), approval.signature);
  return { approval, envelope: packet.envelope, capsule: parseStaffCapsule(packet.capsule) };
}
