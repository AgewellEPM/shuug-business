/**
 * Contract lifecycle status from its expiration date. Pure + deterministic so the
 * contracts page and any alerting agree on what "expiring" means. A contract is
 * "expiring" inside the warning window, "expired" once its date has passed.
 */
export type ContractStatus = "active" | "expiring" | "expired";

export const CONTRACT_EXPIRY_WARN_DAYS = 30;

export function contractStatus(expirationDate: string, today: string, warnDays = CONTRACT_EXPIRY_WARN_DAYS): ContractStatus {
  if (expirationDate < today) return "expired";
  const warnCutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() + warnDays * 86_400_000).toISOString().slice(0, 10);
  if (expirationDate <= warnCutoff) return "expiring";
  return "active";
}

/** Whole days until (positive) or since (negative) expiration. */
export function daysUntil(expirationDate: string, today: string): number {
  const ms = new Date(`${expirationDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}
