import { boundedBytes, checkDriverOrigin, driverFailure, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { DriverError } from "@/lib/rideshare-driver/model";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { computeDriverRoutes, driverRouteReadiness } from "@/lib/rideshare-driver/google-routes";
import { workspaceDatabase } from "@/lib/workspace/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    checkDriverOrigin(request);
    return Response.json(driverRouteReadiness(driverToken(request)), { headers: privateHeaders });
  } catch (error) { return driverFailure(error); }
}
export async function POST(request: Request) {
  try {
    checkDriverOrigin(request);
    const token = driverToken(request);
    // Authenticate before consuming even a malformed or oversized location body.
    workspaceDatabase(db => driverAccount(db, token));
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new DriverError(415, "Use application/json.");
    let input: unknown;
    try { input = JSON.parse((await boundedBytes(request, 4096)).toString("utf8")); }
    catch (error) { if (error instanceof DriverError) throw error; throw new DriverError(400, "Invalid JSON."); }
    return Response.json(await computeDriverRoutes(token, input), { headers: privateHeaders });
  } catch (error) {
    const response = driverFailure(error);
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
