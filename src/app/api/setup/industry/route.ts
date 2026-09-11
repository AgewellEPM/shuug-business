import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { previewIndustry, applyIndustry } from "@/lib/industry/service";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the workspace owner can apply industry settings." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const body = z.object({ input: z.record(z.string(), z.unknown()), apply: z.boolean(), currentDigest: z.string().length(64).optional(), proposedDigest: z.string().length(64).optional() }).strict().parse(await boundedJson(new Response(request.body), 20000));
    if (body.apply) { if (!body.currentDigest || !body.proposedDigest) throw new Error("Preview the workspace before applying it."); return json({ branding: applyIndustry(body.input, body.currentDigest, body.proposedDigest) }); }
    return json(previewIndustry(body.input));
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not configure the workspace." }, 400); }
}
