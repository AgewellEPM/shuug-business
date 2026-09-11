import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createBusinessMcp } from "@/lib/backend/mcp";
import { executeOperation } from "@/lib/backend/service";
import { authenticateBackend } from "@/lib/backend/auth";
import { jsonError } from "@/lib/shopify-backend/http";
import { limitedBody } from "@/lib/shopify-backend/verification";
import { ConnectorError } from "@/lib/shopify-backend/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let server: ReturnType<typeof createBusinessMcp> | undefined;
  try {
    authenticateBackend(request);
    const body = await limitedBody(request);
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.from(body).toString("utf8")); } catch { throw new ConnectorError("Invalid JSON request."); }
    server = createBusinessMcp(executeOperation);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: parsed });
  } catch (error) { return jsonError(error); }
  finally { await server?.close(); }
}
export async function GET(request: Request) { try { authenticateBackend(request); return new Response(null, { status: 405, headers: { Allow: "POST" } }); } catch (error) { return jsonError(error); } }
export const DELETE = GET;
