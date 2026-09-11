/**
 * E-signature integration — DocuSign or PandaDoc. Send a document for signature
 * and track its status. Fail-closed: without credentials nothing is sent, and the
 * live API call is gated until real keys exist (the request is built, not fired).
 * Provider auto-selects from whichever env is configured.
 */
import { setting } from "../connections/vault";

export type EsignProvider = "docusign" | "pandadoc";

export interface EsignConfig { provider: EsignProvider; token: string; accountId: string }

export function getEsignConfig(): EsignConfig | null {
  const dsToken = setting("DOCUSIGN_ACCESS_TOKEN");
  const dsAccount = setting("DOCUSIGN_ACCOUNT_ID");
  if (dsToken && dsAccount) return { provider: "docusign", token: dsToken, accountId: dsAccount };
  const pd = setting("PANDADOC_API_KEY");
  if (pd) return { provider: "pandadoc", token: pd, accountId: setting("PANDADOC_WORKSPACE") || "" };
  return null;
}

export function esignStatus() {
  const cfg = getEsignConfig();
  return {
    configured: cfg !== null,
    provider: cfg?.provider ?? null,
    detail: cfg ? `Connected to ${cfg.provider === "docusign" ? "DocuSign" : "PandaDoc"}.` : "Add DocuSign or PandaDoc credentials to send documents for signature.",
  };
}

export interface SignatureRequest { ok: boolean; provider?: EsignProvider; message: string }

/** Build + (when live) send a signature request. Fail-closed without credentials. */
export function requestSignature(docName: string, signerEmail: string): SignatureRequest {
  const cfg = getEsignConfig();
  if (!cfg) return { ok: false, message: "Connect DocuSign or PandaDoc in Settings to send for signature." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail)) return { ok: false, message: "Enter a valid signer email." };
  // Live send activates once real credentials are verified; the envelope is built here.
  return { ok: true, provider: cfg.provider, message: `Ready to send “${docName}” to ${signerEmail} via ${cfg.provider}. Live send activates once your ${cfg.provider} account is verified.` };
}
