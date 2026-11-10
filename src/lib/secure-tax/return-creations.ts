import { z } from "zod";
import { assertReturnCreationApproval, canonicalReturnCreationApproval } from "../../../packages/secure-tax-client/return-create-contract.mjs";
import { secureTaxEnvelope } from "./envelope";
import { SecureTaxError, trustedPublicPins } from "./manifest";
import { staffEnvelopeDigest, verifyFirmPublicSignature, parseStaffCapsule } from "./staff-model";

export interface ReturnCreationApproval {
  version: 1; type: "shuug-secure-tax-return-create-approval"; approvalId: string; proposalId: string;
  workspaceId: string; accountId: string; clientId: string; objectId: string;
  manifestId: string; manifestEpoch: number; grantId: string; grantEpoch: number; grantDigest: string; staffAccountId: string; staffKeyId: string;
  proposalDigest: string; reviewCommitment: string; newEnvelopeDigest: string; reviewReference: string; issuedAt: string; expiresAt: string;
  signature: { algorithm: "ES256-P1363"; signerKeyId: string; value: string };
}
/** Public encrypted approval only. Private review kits are never valid packets. */
export function verifyReturnCreationPacket(raw: unknown) {
  const packet = z.object({ approval: z.unknown(), envelope: secureTaxEnvelope, capsule: z.unknown() }).strict().parse(raw);
  try { assertReturnCreationApproval(packet.approval); } catch { throw new SecureTaxError(400, "The return creation approval does not match the supported public contract."); }
  const approval = packet.approval as ReturnCreationApproval, pins = trustedPublicPins(), context = packet.envelope.context;
  if (approval.workspaceId !== pins.workspaceId || approval.signature.signerKeyId !== pins.signerKeyId
    || context.workspaceId !== approval.workspaceId || context.accountId !== approval.accountId || context.objectId !== approval.objectId
    || context.domain !== "tax-document" || context.revision !== 1
    || packet.envelope.author.role !== "firm-recovery" || packet.envelope.author.keyId !== pins.recoveryKeyId
    || staffEnvelopeDigest(packet.envelope) !== approval.newEnvelopeDigest) throw new SecureTaxError(403, "The firm approval does not cover this exact initial return.");
  if (Date.parse(approval.issuedAt) > Date.now() + 60000 || Date.parse(approval.expiresAt) <= Date.now()) throw new SecureTaxError(409, "The return creation approval is expired or not yet valid.");
  verifyFirmPublicSignature(canonicalReturnCreationApproval(approval), approval.signature);
  return { approval, envelope: packet.envelope, capsule: parseStaffCapsule(packet.capsule) };
}
