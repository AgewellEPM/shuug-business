import { authenticateBackend } from "./auth";
import { executeOperation, operationSchema } from "./service";
import { limitedBody } from "../shopify-backend/verification";
import { ConnectorError } from "../shopify-backend/model";
import { jsonError } from "../shopify-backend/http";
export async function backendHandler(request: Request) {
  try {
    authenticateBackend(request);
    if (request.method === "GET") return Response.json(await executeOperation("capabilities"), { headers: { "Cache-Control": "no-store" } });
    const body = await limitedBody(request);
    let input: unknown;
    try { input = JSON.parse(Buffer.from(body).toString("utf8")); } catch { throw new ConnectorError("Invalid JSON request."); }
    const parsed = operationSchema.parse(input), data = await executeOperation(parsed.operation, parsed.arguments);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
