import { timingSafeEqual } from "node:crypto";
import { setting, appBaseUrl } from "../connections/vault";
import { ConnectorError } from "../shopify-backend/model";
export function authenticateBackend(request: Request) {
  const token = setting("BACKEND_ACCESS_TOKEN");
  if (!token) throw new ConnectorError("Backend access is not configured. Run npm run backend:setup.", 503);
  const received = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${token}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new ConnectorError("A valid backend bearer token is required.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(appBaseUrl()).origin) throw new ConnectorError("Origin not permitted.", 403);
}
