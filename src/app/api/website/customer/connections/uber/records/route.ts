import { CUSTOMER_PATH } from "@/lib/customer-access/accounts";
import { customerPage } from "@/lib/customer-access/page";
import { uberCaller, uberFailure } from "@/lib/gig-connections/uber-http";
import { uberRecordPage } from "@/lib/gig-connections/uber";
import { uberRecordHtml } from "@/lib/gig-connections/uber-record-html";
import { privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const token = uberCaller(request), parameters = new URL(request.url).searchParams;
    const result = uberRecordPage(token, parameters.get("kind") === "trips" ? "trips" : "payments", Number(parameters.get("page") ?? 1));
    if (request.headers.get("accept")?.includes("application/json")) return Response.json(result, { headers: privateHeaders });
    return customerPage("Uber source records", `${uberRecordHtml(result, `${CUSTOMER_PATH}/connections/uber/records`)}<p><a href="${CUSTOMER_PATH}#uber-connection">Return to your workspace</a></p>`);
  } catch (error) { return uberFailure(error); }
}
