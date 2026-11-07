import { readDriverProfile, updateDriverProfile } from "@/lib/customer-access/driver-profile";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { checkDriverOrigin(request); return Response.json(readDriverProfile(driverToken(request, true)), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
export async function PATCH(request: Request) {
  try { const input = await driverJson(request); return Response.json(updateDriverProfile(driverToken(request), input), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
