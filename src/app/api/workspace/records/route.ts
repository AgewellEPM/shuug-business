import { readableBusinessRecords } from "@/lib/workspace/access";
import { businessRecordAction } from "@/app/modules/actions";
import { boundedJson } from "@/lib/social/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const records = (await readableBusinessRecords()).filter(r => (!params.get("kind") || r.kind === params.get("kind")) && (!params.get("id") || r.id === params.get("id")));
    return Response.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }, { headers: { "Cache-Control": "private, no-store", ...(params.has("download") ? { "Content-Disposition": "attachment; filename=business-records.json" } : {}) } });
  } catch { return Response.json({ error: "Workspace access required." }, { status: 403 }); }
}
export async function POST(request: Request) {
  try {
    const body = await boundedJson(new Response(request.body), 100000) as { command?: unknown; input?: unknown };
    if (body.command !== "save" && body.command !== "transition") throw new Error("Send save or transition.");
    const result = await businessRecordAction(body.command, body.input);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Invalid record request." }, { status: 400 }); }
}
