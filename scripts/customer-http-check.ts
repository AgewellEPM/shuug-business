import { saveSecrets } from "../src/lib/connections/vault";
import { randomUUID } from "node:crypto";
import { getDealStore } from "../src/lib/data/store";
import { saveBusinessRecord, transitionBusinessRecord } from "../src/lib/workspace/store";
import { addRecord } from "../src/lib/sdk/records";
import { moduleById } from "../src/lib/sdk/registry";
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
export async function customerHttpCheck(base: string, ownerCookie: string, employeeCookie: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Customer HTTP check requires the disposable workspace fixture.");
  const owner = async (route: string, body?: unknown) => {
    const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { Cookie: ownerCookie, Origin: base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(20000) });
    const result = await response.json(); assert(response.ok, result.error ?? `Owner operation failed: ${route}`); return result;
  };
  const industry = { industryId: "auto-repair", answers: { fleet: true }, addedPacks: ["product_sales"], templateName: "Independent Auto Repair", revision: 3 };
  const preview = await owner("/api/setup/industry", { apply: false, input: industry });
  assert(preview.shown.some((i: { id: string }) => i.id === "module:vehicles") && !preview.shown.some((i: { id: string }) => i.id === "nonprofit-donations"), "Industry preview did not select the mechanic surface.");
  await owner("/api/setup/industry", { apply: true, input: industry, currentDigest: preview.currentDigest, proposedDigest: preview.proposedDigest });
  const exported = await owner("/api/workspace/template"); assert(exported.version === 2 && exported.name === "Independent Auto Repair — v3" && exported.requiredModules.some((m: { id: string }) => m.id === "vehicles"), "Industry template export did not retain its revision and module dependencies.");
  const vehicles = moduleById("vehicles")!; addRecord(vehicles.id, vehicles.fields, { customer_id: "synthetic-client", vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003 });
  const vehiclePage = await fetch(base + "/m/vehicles", { headers: { Cookie: ownerCookie } }); assert(vehiclePage.ok && (await vehiclePage.text()).includes("1HGCM82633A004352"), "The installed vehicle module did not read durable rows from another process.");
  const setupPage = await fetch(base + "/setup/customers", { headers: { Cookie: ownerCookie } }); assert(setupPage.ok && (await setupPage.text()).includes("Customer website access"), "Customer account administration did not render.");
  for (const [route, body] of [["/api/setup/customers", { action: "settings", input: {} }], ["/api/setup/industry", { apply: false, input: industry }]] as const) {
    const denied = await fetch(base + route, { method: "POST", headers: { Cookie: employeeCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body) }); assert(denied.status === 403, `Employee could change owner setup: ${route}`);
  }
  // Fixture-only configuration checks. Never send a payment request to a live provider.
  saveSecrets({ STRIPE_SECRET_KEY: "sk_test_syntheticfixture", STRIPE_WEBHOOK_SECRET: "whsec_syntheticfixture" });
  const paymentSetup = await owner("/api/setup/payments");
  await owner("/api/setup/payments", { action: "settings", input: { ...paymentSetup.settings, invoiceEnabled: true, donationsEnabled: true } });
  const paymentPage = await fetch(base + "/setup/payments", { headers: { Cookie: ownerCookie } }); assert(paymentPage.ok && (await paymentPage.text()).includes("Payments and recovery"), "Website payment owner controls did not render.");
  const donationPage = await fetch(base + "/api/website/donate"); const donationHtml = await donationPage.text(); assert(donationPage.ok && donationHtml.includes("Test mode") && donationHtml.includes('name="proof"'), "Public donation form did not render its test-mode disclosure and signed request.");
  const fakeWebhook = await fetch(base + "/api/website/stripe/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}" }); assert(fakeWebhook.status === 400, "An unsigned payment webhook was accepted.");
  const denyPayments = await fetch(base + "/api/setup/payments", { headers: { Cookie: employeeCookie } }); assert(denyPayments.status === 403, "Employee could access owner payment management.");
  const table = (await owner("/api/restaurant/service", { action: "table", input: { name: "HTTP table", seats: 4, area: "Main" } })).table;
  const reservation = (await owner("/api/restaurant/service", { action: "reservation", input: { name: "HTTP guest", partySize: 4, dateISO: "2099-01-02", time: "19:00", tableId: table.id } })).reservation;
  await owner("/api/restaurant/service", { action: "reservation.status", input: { id: reservation.id, status: "waiting" } });
  const conflict = await fetch(base + "/api/restaurant/service", { method: "POST", headers: { Cookie: ownerCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action: "reservation", input: { name: "Conflicting guest", partySize: 2, dateISO: "2099-01-02", time: "19:30", tableId: table.id } }) }); assert(conflict.status === 400, "Restaurant accepted a conflicting table booking.");
  const restaurantPage = await fetch(base + "/restaurant?date=2099-01-02", { headers: { Cookie: ownerCookie } }); const restaurantHtml = await restaurantPage.text(); assert(restaurantPage.ok && restaurantHtml.includes("HTTP guest") && restaurantHtml.includes("HTTP table") && restaurantHtml.includes("parties waiting"), "Restaurant did not render durable table and waiting-party records.");
  const ticket = (await owner("/api/restaurant/service", { action: "ticket", input: { ref: "HTTP table", items: [{ name: "HTTP soup", station: "Line", qty: 2 }] } })).ticket;
  for (const status of ["cooking", "ready", "served"]) await owner("/api/restaurant/service", { action: "ticket.status", input: { id: ticket.id, status } });
  await owner("/api/restaurant/service", { action: "ticket.archive", input: {} });
  const previousDb = process.env.DATABASE_URL; process.env.DATABASE_URL = "";
  const fixtures = [];
  try {
    for (const name of ["Customer Alpha", "Customer Beta"]) {
      const store = await getDealStore(), deal = await store.createCustomer({ company: name, channel: "wholesale_bulk", buyerName: name, buyerEmail: `${name.endsWith("Alpha") ? "alpha" : "beta"}@customer.example.test`, website: null, accountOwner: "Synthetic owner", region: "", billingAddress: "", shippingAddress: "", quickbooksCustomerId: null, requiresPO: true });
      const price = name.endsWith("Alpha") ? 1200 : 3400;
      deal.agreement.minCasesPerOrder = 1; deal.agreement.minOrderDollarsCents = 1; deal.agreement.freight = { kind: "included" }; deal.agreement.lines = [{ ...deal.agreement.lines[0], unitPriceCents: price, tiers: [{ minQty: 1, maxQty: null, unitPriceCents: price }] }];
      await store.saveAgreement({ agreement: deal.agreement, changedBy: "Synthetic owner", note: "Synthetic private pricing" });
      const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: deal.customer.buyerEmail } }, "Synthetic owner");
      const proposal = saveBusinessRecord({ kind: "proposal", title: `${name} proposal`, fields: { client: client.id, scope: "Synthetic scope", exclusions: "Synthetic exclusions", amount: 50000, expires: "2099-01-01" } }, "Synthetic owner");
      const sent = transitionBusinessRecord({ id: proposal.id, revision: proposal.revision, target: "sent", commandId: randomUUID() }, "Synthetic owner");
      fixtures.push({ deal, client, proposal: sent });
    }
  } finally { if (previousDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDb; }
  await owner("/api/setup/customers", { action: "settings", input: { enabled: true, pricing: true, ordering: true, orderStatus: true, servicePortal: true, booking: true } });
  const password = `Synthetic-customer-${randomUUID()}`;
  async function post(form: Record<string, string>, cookie = "", origin = base) {
    return fetch(base + "/api/website/customer", { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form), redirect: "manual" });
  }
  const signed = [];
  for (const fixture of fixtures) {
    const { account } = await owner("/api/setup/customers", { action: "create", input: { name: fixture.deal.customer.buyerName, email: fixture.deal.customer.buyerEmail, customerId: fixture.deal.customer.id, clientId: fixture.client.id } });
    const { url } = await owner("/api/setup/customers", { action: "invite", input: { id: account.id } });
    const activation = await post({ action: "activate", invite: new URL(url).searchParams.get("invite")!, password, confirmation: password }); assert(activation.ok && (await activation.text()).includes("Account activated"), "Customer setup link could not activate an account.");
    const login = await post({ action: "login", email: account.email, password }); const cookie = login.headers.getSetCookie().find(c => c.startsWith("shuug_customer="))?.split(";")[0]; assert(login.status === 303 && cookie, "Customer sign-in failed."); signed.push({ ...fixture, account, cookie });
  }
  const [alpha, beta] = signed;
  const page = await fetch(base + "/api/website/customer", { headers: { Cookie: alpha.cookie } }), html = await page.text();
  assert(page.ok && html.includes("Customer Alpha") && !html.includes("Customer Beta") && html.includes("USD 12.00") && !html.includes("costPerCaseCents"), "Customer page leaked account data or omitted agreed prices.");
  assert(page.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "Customer account could be embedded into an untrusted website.");
  assert((await post({ action: "logout" }, alpha.cookie, "https://attacker.test")).status === 403, "Cross-origin customer action accepted.");
  const reviewed = await post({ action: "order.preview", "sku.0": alpha.deal.agreement.lines[0].skuId, "qty.0": "2", "unit.0": "case", poNumber: "HTTP-PO-1", note: "Synthetic website order" }, alpha.cookie), reviewHtml = await reviewed.text();
  const quote = reviewHtml.match(/name="quote" value="([^"]+)"/)?.[1]; assert(reviewed.ok && quote && reviewHtml.includes("USD 24.00"), "Customer order review did not calculate the agreed price.");
  assert((await post({ action: "order.submit", quote, accepted: "yes" }, beta.cookie)).status === 400, "Customer submitted another account's reviewed order.");
  const ordered = await post({ action: "order.submit", quote, accepted: "yes" }, alpha.cookie); assert(ordered.ok && (await ordered.text()).includes(`Order ORD-${quote} received`), "Reviewed customer order was not accepted.");
  const repeated = await post({ action: "order.submit", quote, accepted: "yes" }, alpha.cookie); assert(repeated.ok && (await repeated.text()).includes("was already received"), "Customer order retry created another order.");
  assert((await post({ action: "accept", id: beta.proposal.id, revision: String(beta.proposal.revision), accepted: "yes" }, alpha.cookie)).status === 400, "Customer accepted another account's proposal.");
  assert((await post({ action: "accept", id: alpha.proposal.id, revision: String(alpha.proposal.revision), accepted: "yes" }, alpha.cookie)).status === 303, "Customer could not accept their proposal.");
  assert((await post({ action: "accept", id: beta.proposal.id, revision: String(beta.proposal.revision), accepted: "yes" }, beta.cookie)).status === 303, "Second customer could not accept their proposal.");
  const staff = saveBusinessRecord({ kind: "resource", title: "Synthetic technician", fields: { category: "staff", weeklyHours: 40 } }, "Synthetic owner");
  transitionBusinessRecord({ id: staff.id, revision: staff.revision, target: "active", commandId: randomUUID() }, "Synthetic owner");
  const offered = [];
  const start = new Date(Date.now() + 3 * 86400000).toISOString(), end = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString();
  for (const customer of [alpha, beta]) {
    const agreement = saveBusinessRecord({ kind: "agreement", title: "Booking terms", fields: { client: customer.client.id, proposal: customer.proposal.id, terms: "Synthetic service terms", deposit: 0, signedBy: customer.account.name, evidence: "Synthetic signed agreement" } }, "Synthetic owner");
    transitionBusinessRecord({ id: agreement.id, revision: agreement.revision, target: "signed", commandId: randomUUID() }, "Synthetic owner");
    const job = saveBusinessRecord({ kind: "job", title: `${customer.account.name} booked work`, fields: { client: customer.client.id, agreement: agreement.id, instructions: "Synthetic service", requiredChecks: "Verify work", budget: 10000 } }, "Synthetic owner");
    const { offer } = await owner("/api/setup/appointments", { action: "publish", input: { jobId: job.id, resourceId: staff.id, start, end, buffer: 15 } }); offered.push({ ...customer, job, offer });
  }
  const available = await fetch(base + "/api/website/customer", { headers: { Cookie: alpha.cookie } }); assert((await available.text()).includes("Confirm appointment"), "Published availability did not reach the customer account.");
  assert((await post({ action: "booking.book", id: offered[1].offer.id, accepted: "yes" }, alpha.cookie)).status === 400, "Customer booked another client's work.");
  const race = await Promise.all(offered.map(o => post({ action: "booking.book", id: o.offer.id, accepted: "yes" }, o.cookie)));
  assert(race.filter(r => r.status === 200).length === 1 && race.filter(r => r.status === 400).length === 1, "Overlapping website bookings reserved the same resource twice.");
  const won = race[0].status === 200 ? 0 : 1, loser = won === 0 ? 1 : 0;
  const winnerPage = await race[won].text(), bookingId = winnerPage.match(/name="action" value="booking.cancel"><input type="hidden" name="id" value="([^"]+)"/)?.[1]; assert(bookingId, "Confirmed booking did not expose its cancellation action.");
  assert((await post({ action: "booking.book", id: offered[won].offer.id, accepted: "yes" }, offered[won].cookie)).status === 200, "Booking retry failed.");
  assert((await post({ action: "booking.cancel", id: bookingId, accepted: "yes" }, offered[won].cookie)).status === 200, "Customer could not cancel their future appointment.");
  assert((await post({ action: "booking.book", id: offered[loser].offer.id, accepted: "yes" }, offered[loser].cookie)).status === 200, "Canceled appointment did not release availability for another customer.");
  const privateApi = await fetch(base + "/api/workspace/records", { headers: { Cookie: alpha.cookie } }); assert(privateApi.status === 403, "Customer session opened employee business records.");
  await owner("/api/setup/customers", { action: "enable", input: { id: alpha.account.id, enabled: false } });
  const revoked = await fetch(base + "/api/website/customer", { headers: { Cookie: alpha.cookie } }); assert((await revoked.text()).includes("Customer sign-in"), "Disabled customer retained account access.");
  console.log(JSON.stringify({ ok: true, checks: ["industry preview/apply and named v3 template export", "durable vehicle module rendering", "customer administration", "customer invitations and login", "customer-specific prices and private account isolation", "order review → submission → retry", "customer proposal acceptance", "published availability → confirmed booking → cancellation", "concurrent booking conflict prevention", "CSRF and employee API restrictions", "customer revocation"] }));
}
