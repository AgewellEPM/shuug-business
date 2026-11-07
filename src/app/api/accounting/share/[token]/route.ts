import { workspaceDatabase } from "@/lib/workspace/database";
import { sharedBillingDocument } from "@/lib/accounting/billing-share";
import { billingHtml, billingHtmlHeaders, escapeHtml } from "@/lib/accounting/billing-html";
import { billingConnection, reserveBillingPayment, sharedPayment } from "@/lib/accounting/billing-checkout";
import { billingBalance } from "@/lib/accounting/billing-model";
import { refreshWebsitePayment, paymentNotice } from "@/lib/website-payments/service";
import { appBaseUrl } from "@/lib/connections/vault";
import { parseDollarsToCents } from "@/lib/money";
import { boundedBytes } from "@/lib/rideshare-driver/http";
type Context = {params:Promise<{token:string}>};
export async function GET(request:Request,context:Context) {
  try {
    const {token}=await context.params;
    const {doc,connection}=workspaceDatabase(db=>{const v=sharedBillingDocument(db,token);return{doc:v.doc,connection:billingConnection(db,v.share.bookId)};});
    let extra="";const id=new URL(request.url).searchParams.get("payment");
    if(id){const p=sharedPayment(token,id);extra+=`<section class="no-print"><p>${escapeHtml(paymentNotice(p))}</p><form method="post"><input type="hidden" name="action" value="refresh"><input type="hidden" name="payment" value="${escapeHtml(p.id)}"><button>Refresh payment status</button></form></section>`;}
    const due=billingBalance(doc).outstanding;
    if(doc.status==="posted"&&due>=100&&connection?.enabled)extra+=`<section class="no-print"><h2>Pay this invoice</h2><p>${connection.live?"Secure payment processed by Stripe.":"Test mode. No money will be collected."}</p><form method="post"><input type="hidden" name="action" value="pay"><label>Payment amount USD <input name="amount" value="${(Math.min(due,99_999_999)/100).toFixed(2)}" inputmode="decimal" required></label><button>Continue to payment</button></form></section>`;
    return new Response(billingHtml(doc,extra),{headers:billingHtmlHeaders});
  } catch { return new Response("Invoice link unavailable, expired or revoked. Ask the sender for a new link.",{status:404,headers:billingHtmlHeaders}); }
}
export async function POST(request:Request,context:Context) {
  if(request.headers.get("origin")!==new URL(appBaseUrl()).origin)return new Response("Origin not permitted.",{status:403,headers:billingHtmlHeaders});
  try {
    if(request.headers.get("content-type")?.split(";")[0]!=="application/x-www-form-urlencoded")throw new Error("Use the invoice payment form.");
    const {token}=await context.params,f=new URLSearchParams((await boundedBytes(request,4000)).toString("utf8"));
    if(!["pay","refresh"].includes(f.get("action")??""))throw new Error("Unknown payment action.");
    const reserved=f.get("action")==="pay"?reserveBillingPayment(token,parseDollarsToCents(f.get("amount")??"")):sharedPayment(token,f.get("payment")??"");
    const p=await refreshWebsitePayment(reserved.id);
    const destination=f.get("action")==="pay"&&p.status==="open"&&p.checkoutUrl?p.checkoutUrl:new URL(`/api/accounting/share/${token}?payment=${p.id}`,appBaseUrl()).href;
    return new Response(null,{status:303,headers:{...billingHtmlHeaders,Location:destination}});
  } catch(e) { return new Response(`<p>${escapeHtml(e instanceof Error?e.message:"Payment unavailable.")}</p><p>Return to the invoice and refresh its payment status before trying again.</p>`,{status:400,headers:billingHtmlHeaders}); }
}
