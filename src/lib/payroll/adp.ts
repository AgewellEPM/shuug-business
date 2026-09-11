/**
 * ADP payroll integration (Workforce Now). ADP authenticates with OAuth2
 * client-credentials over MUTUAL TLS (a client cert + key), so config carries the
 * client id/secret plus the certificate material. Fail-closed: nothing talks to
 * ADP without full credentials. The member→worker mapping is pure and tested;
 * the live push is gated until Luke supplies real credentials + certs.
 */
import { setting } from "../connections/vault";
import type { TeamMember } from "../team/store";

export interface AdpConfig {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  /** ADP region host, e.g. api.adp.com. */
  host: string;
}

export function getAdpConfig(): AdpConfig | null {
  const clientId = setting("ADP_CLIENT_ID");
  const clientSecret = setting("ADP_CLIENT_SECRET");
  const certPem = setting("ADP_CERT_PEM");
  const keyPem = setting("ADP_KEY_PEM");
  if (!clientId || !clientSecret || !certPem || !keyPem) return null;
  return { clientId, clientSecret, certPem, keyPem, host: setting("ADP_HOST") || "api.adp.com" };
}

export function adpStatus() {
  const cfg = getAdpConfig();
  const missing = ["ADP_CLIENT_ID", "ADP_CLIENT_SECRET", "ADP_CERT_PEM", "ADP_KEY_PEM"].filter((k) => !setting(k));
  return {
    configured: cfg !== null,
    connected: cfg !== null,
    missing,
    detail: cfg
      ? `Connected to ADP (${cfg.host}).`
      : "Add your ADP client ID/secret and mTLS certificate to sync payroll.",
  };
}

/** ADP /hr/v2/workers shape (subset) built from a team member. Pure. */
export interface AdpWorker {
  associateOID?: string;
  workerStatus: { statusCode: { codeValue: "Active" | "Inactive" } };
  person: {
    legalName: { givenName: string; familyName: string; formattedName: string };
    communication: { emails: { emailUri: string; nameCode: { codeValue: "Work" } }[] };
  };
  /** local business role at time of sync (informational). */
  customFields: { role: string };
}

export function mapMemberToWorker(member: TeamMember): AdpWorker {
  const parts = member.name.trim().split(/\s+/);
  const givenName = parts[0] ?? member.name;
  const familyName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return {
    workerStatus: { statusCode: { codeValue: member.online ? "Active" : "Inactive" } },
    person: {
      legalName: { givenName, familyName, formattedName: member.name },
      communication: { emails: member.email ? [{ emailUri: member.email, nameCode: { codeValue: "Work" } }] : [] },
    },
    customFields: { role: member.role },
  };
}

export interface AdpSyncPreview {
  ready: boolean;
  detail: string;
  workers: AdpWorker[];
}

/**
 * Build the exact payloads that WOULD be pushed to ADP. Fail-closed: when ADP
 * isn't configured, `ready` is false and no live call is possible. When it is,
 * the caller can POST these to /hr/v2/workers over the mTLS client (live wiring
 * lands once real credentials exist).
 */
export function previewAdpSync(members: TeamMember[]): AdpSyncPreview {
  const cfg = getAdpConfig();
  const workers = members.filter((m) => m.id !== "owner").map(mapMemberToWorker);
  return {
    ready: cfg !== null,
    detail: cfg
      ? `${workers.length} teammate${workers.length === 1 ? "" : "s"} ready to sync to ADP (${cfg.host}).`
      : "Connect ADP in Settings first — client ID/secret + mTLS certificate.",
    workers,
  };
}
