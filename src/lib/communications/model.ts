import { z } from "zod";

export function normalizePhone(raw: string): string {
  const value = raw.trim();
  const digits = value.replace(/[\s().-]/g, "");
  const phone = /^\d{10}$/.test(digits) ? `+1${digits}` : /^1\d{10}$/.test(digits) ? `+${digits}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Use a valid phone number with country code.");
  return phone;
}
export const queueMessageInput = z.object({
  eventKey: z.string().trim().min(1).max(240), channel: z.enum(["sms", "email"]),
  to: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(8000),
  subject: z.string().trim().max(160).refine(s => !/[\r\n]/.test(s)).optional(),
  purpose: z.string().trim().min(1).max(100), source: z.string().trim().max(200).optional(),
  customerId: z.uuid().optional(), recordId: z.uuid().optional(), recordRevision: z.number().int().positive().optional(),
  expectedStatus: z.string().max(40).optional(), notBefore: z.iso.datetime({ offset: true }).optional(),
  recordStart: z.iso.datetime({ offset: true }).optional(), recordEnd: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.channel === "sms" && input.body.length > 1400) ctx.addIssue({ code: "custom", message: "Keep an SMS under 1,400 characters.", path: ["body"] });
  if (input.channel === "email" && (!z.email().safeParse(input.to).success || !input.subject)) ctx.addIssue({ code: "custom", message: "Email needs a valid recipient and subject.", path: ["to"] });
  if ((input.recordRevision || input.expectedStatus || input.recordStart || input.recordEnd) && !input.recordId) ctx.addIssue({ code: "custom", message: "A record constraint needs its record ID." });
});
export type QueueMessageInput = z.infer<typeof queueMessageInput>;
export type MessageStatus = "queued" | "blocked" | "sending" | "accepted" | "delivered" | "failed" | "uncertain" | "canceled" | "simulated";
export interface CommunicationMessage extends QueueMessageInput {
  id: string; status: MessageStatus; createdAt: string; updatedAt: string; attemptId: string | null;
  attemptedAt: string | null; providerId: string | null; provider: "twilio" | "mailgun";
  providerMode: "test" | "live" | null; detail: string; configDigest: string | null; providerEventAt: number | null;
}
export const smsConsentInput = z.object({
  phone: z.string().min(1).max(50), granted: z.boolean(), source: z.string().trim().min(1).max(200),
  evidence: z.string().trim().min(1).max(2000), policyVersion: z.string().trim().min(1).max(100),
  requestId: z.uuid().optional(), actor: z.string().max(200).optional(),
}).strict();
export type SmsConsentInput = z.infer<typeof smsConsentInput>;
export interface SmsConsent {
  phone: string; granted: boolean; providerStopped: boolean; source: string; evidence: string;
  policyVersion: string; updatedAt: string; actor: string;
}
export interface CommunicationInbound {
  id: string; providerId: string; from: string; to: string; body: string; receivedAt: string;
  action: "STOP" | "START" | "HELP" | "message";
}
