import { z } from "zod";
import { claimReferral, referralSummary, requestReferralReward } from "@/lib/rideshare-driver/referrals";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { checkDriverOrigin(request); return Response.json(referralSummary(driverToken(request)), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
export async function POST(request: Request) {
  try {
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("claim"), code: z.string().max(30) }).strict(),
      z.object({ action: z.literal("redeem"), rewardId: z.uuid(), method: z.enum(["cash", "credit"]) }).strict(),
    ]).parse(await driverJson(request));
    const token = driverToken(request);
    const value = input.action === "claim" ? claimReferral(token, { code: input.code }) : requestReferralReward(token, { rewardId: input.rewardId, method: input.method });
    return Response.json(value, { headers: privateHeaders });
  } catch (error) { return driverFailure(error); }
}
