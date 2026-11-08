import { z } from "zod";

const invoice = { id: z.uuid(), revision: z.number().int().positive(), reviewed: z.literal(true) };
export const invoiceDeliverySchemas = {
  "billing.delivery.preview": z.object(invoice).strict(),
  "billing.delivery.send": z.object({ ...invoice, deliveryId: z.uuid(), previewDigest: z.string().regex(/^[a-f0-9]{64}$/), recipient: z.email().max(200) }).strict(),
  "billing.delivery.resolve": z.object({ ...invoice, deliveryId: z.uuid(), outcome: z.enum(["accepted", "not_sent"]), evidence: z.string().trim().min(10).max(2000), providerId: z.string().trim().min(1).max(300).optional() }).strict(),
} as const;
export type InvoiceDeliveryStatus = "preview" | "sending" | "accepted" | "rejected" | "uncertain" | "not_sent";
export interface InvoiceEmailPreview {
  from: string; recipient: string; subject: string; text: string; url: string;
  expiresAt: string; previewExpiresAt: string; mode: "test" | "live";
}
export interface InvoiceDeliveryReceipt {
  deliveryId: string; documentId: string; revision: number; recipient: string;
  mode: "test" | "live";
  status: InvoiceDeliveryStatus; createdAt: string; attemptedAt: string | null;
  providerId: string | null; message: string; verification: "none" | "provider_response" | "staff_recorded_provider_evidence";
}
export interface InvoiceDeliveryResult {
  deliveryId: string; status: InvoiceDeliveryStatus; message: string;
  providerId?: string | null; previewDigest?: string; preview?: InvoiceEmailPreview;
}
