import { NextResponse } from "next/server";
import { getDealStore } from "@/lib/data/store";

export const dynamic = "force-dynamic";

/**
 * Health / readiness probe for load balancers and uptime monitors. Reports
 * whether the data layer answers. Returns 200 ok / 503 degraded — never throws.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "fail"> = {};
  try {
    const store = await getDealStore();
    await store.listCustomers();
    checks.datastore = "ok";
  } catch {
    checks.datastore = "fail";
  }
  const ok = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      durable: !!process.env.DATABASE_URL,
      uptimeMs: Math.round(process.uptime() * 1000),
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
