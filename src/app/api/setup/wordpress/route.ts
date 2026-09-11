import { requireOwnerAccess } from "@/lib/auth/identity";
import { wordpressDownload } from "@/lib/getting-started/wordpress-download";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireOwnerAccess(); } catch { return Response.json({ error: "Sign in as owner to download the plugin." }, { status: 403 }); }
  return new Response(new Uint8Array(wordpressDownload()), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="shuug-business-wordpress-0.1.0.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
