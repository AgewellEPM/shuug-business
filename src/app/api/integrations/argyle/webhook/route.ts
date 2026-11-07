import { boundedBytes, privateHeaders, driverFailure } from "@/lib/rideshare-driver/http";
import { acceptArgyleWebhook } from "@/lib/gig-connections/argyle-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  try {return Response.json(acceptArgyleWebhook(await boundedBytes(request,256_000),request.headers.get("x-argyle-signature")),{headers:privateHeaders});}
  catch(error){return driverFailure(error);}
}
