import { NextResponse } from "next/server";
import { QB_FEATURES } from "@/lib/quickbooks/features";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1 — the API index. Lists every core feature and the endpoint you can
 * pull it from, so the existing application surface is discoverable.
 */
export function GET() {
  const endpoints = QB_FEATURES.filter((f) => f.apiPath).map((f) => ({
    feature: f.label,
    quickbooks: f.qbTerm,
    status: f.status,
    endpoint: f.apiPath,
  }));
  return NextResponse.json({ api: "v1", count: endpoints.length, endpoints }, { headers: { "Cache-Control": "no-store" } });
}
