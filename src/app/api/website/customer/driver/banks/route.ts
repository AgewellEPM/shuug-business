import { z } from "zod";
import { bankFeed, bankStatus, createBankLink, disconnectBank, exchangeBankLink, syncBankItem } from "@/lib/rideshare-driver/bank-store";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    checkDriverOrigin(request);
    const url = new URL(request.url), token = driverToken(request);
    const platform = z.enum(["ios", "android"]).parse(url.searchParams.get("platform") ?? "ios");
    const value = url.searchParams.has("after") ? bankFeed(token, Number(url.searchParams.get("after"))) : bankStatus(token, platform);
    return Response.json(value, { headers: privateHeaders });
  } catch (error) { return driverFailure(error); }
}
export async function POST(request: Request) {
  try {
    const raw = await driverJson(request), token = driverToken(request);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("link"), itemId: z.uuid().optional(), platform: z.enum(["ios", "android"]).optional() }).strict(),
      z.object({ action: z.literal("exchange"), sessionId: z.uuid(), publicToken: z.string().max(1000) }).strict(),
      z.object({ action: z.literal("sync"), itemId: z.uuid() }).strict(),
      z.object({ action: z.literal("disconnect"), itemId: z.uuid() }).strict(),
    ]).parse(raw);
    let value: object;
    switch (input.action) {
      case "link": value = await createBankLink(token, { itemId: input.itemId, platform: input.platform }); break;
      case "exchange": value = await exchangeBankLink(token, { sessionId: input.sessionId, publicToken: input.publicToken }); break;
      case "sync": value = await syncBankItem(token, input.itemId); break;
      case "disconnect": await disconnectBank(token, input.itemId); value = { disconnected: true }; break;
    }
    return Response.json(value, { headers: privateHeaders });
  } catch (error) { return driverFailure(error); }
}
