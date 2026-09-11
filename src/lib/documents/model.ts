/**
 * Documents & legal vault (#23) — one place for licenses, insurance, permits,
 * agreements, tax papers and forms, with expiration + renewal tracking and an
 * e-signature status. Pure model + status helpers; the store holds the files and
 * the integrations (DocuSign/PandaDoc/LegalZoom) act on them. Cents-free, dates only.
 */
export type DocCategory = "license" | "insurance" | "permit" | "agreement" | "tax" | "form" | "other";
export type SignatureStatus = "none" | "sent" | "signed" | "declined";
export type ExpiryStatus = "active" | "expiring" | "expired" | "no-expiry";

export const DOC_CATEGORIES: { key: DocCategory; label: string }[] = [
  { key: "license", label: "Business licenses" },
  { key: "insurance", label: "Insurance" },
  { key: "permit", label: "Permits" },
  { key: "agreement", label: "Agreements & contracts" },
  { key: "tax", label: "Tax & compliance" },
  { key: "form", label: "Forms" },
  { key: "other", label: "Other papers" },
];

export interface DocRecord {
  id: string;
  name: string;
  category: DocCategory;
  issuer: string;
  /** the file as a data URL (small papers) or null if metadata-only. */
  fileDataUrl: string | null;
  fileName: string;
  /** ISO date the document expires / must be renewed. */
  expiresAt: string | null;
  signature: SignatureStatus;
  /** which e-sign provider a signature request went to. */
  signatureProvider: string | null;
  /** optional link to another record, e.g. a customer id. */
  linkedType: string | null;
  linkedId: string | null;
  notes: string;
  createdAt: string;
}

export const EXPIRY_WARN_DAYS = 30;

export function expiryStatus(expiresAt: string | null, todayIso: string, warnDays = EXPIRY_WARN_DAYS): ExpiryStatus {
  if (!expiresAt) return "no-expiry";
  if (expiresAt < todayIso) return "expired";
  const warnCutoff = new Date(new Date(`${todayIso}T00:00:00Z`).getTime() + warnDays * 86_400_000).toISOString().slice(0, 10);
  return expiresAt <= warnCutoff ? "expiring" : "active";
}

export function daysUntil(expiresAt: string, todayIso: string): number {
  return Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
}

export interface VaultSummary {
  total: number;
  expiring: number;
  expired: number;
  awaitingSignature: number;
}

export function summarizeVault(docs: DocRecord[], todayIso: string): VaultSummary {
  return {
    total: docs.length,
    expiring: docs.filter((d) => expiryStatus(d.expiresAt, todayIso) === "expiring").length,
    expired: docs.filter((d) => expiryStatus(d.expiresAt, todayIso) === "expired").length,
    awaitingSignature: docs.filter((d) => d.signature === "sent").length,
  };
}
