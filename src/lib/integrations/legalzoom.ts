/**
 * LegalZoom hook — a connection point to sync business-legal records (entities,
 * filings, registered agent, compliance) or pull additional services. Fail-closed:
 * status only until an API key is set. Kept minimal + env-driven so it's ready to
 * light up without touching the rest of the app.
 */
import { setting } from "../connections/vault";

export function getLegalZoomConfig(): { apiKey: string } | null {
  const apiKey = setting("LEGALZOOM_API_KEY");
  return apiKey ? { apiKey } : null;
}

export function legalZoomStatus() {
  const cfg = getLegalZoomConfig();
  return {
    configured: cfg !== null,
    detail: cfg
      ? "Connected to LegalZoom — entity, filing and compliance data can sync."
      : "Add LEGALZOOM_API_KEY to sync legal-entity data or add LegalZoom services.",
  };
}
