import { z } from "zod";
import { escapeHtml, readAuthForm } from "@/lib/auth/forms";
import { appBaseUrl } from "@/lib/connections/vault";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { publicDining, reviewDining, confirmDining, diningReceipt, cancelDining, diningPublicInfo } from "@/lib/restaurant/dining-website";
import { restaurantPublicPage } from "@/lib/restaurant/public-page";
import { dateAfter } from "@/lib/restaurant/dining-availability";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const e = escapeHtml, path = "/api/website/reservations", hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const page = (content: string, status = 200) => restaurantPublicPage("Table reservations", diningPublicInfo(), content, status);
function label(instant: string, timezone: string) { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(instant)); }
function receipt(token: string) {
  const r = diningReceipt(token), changed = `${path}?manage=${encodeURIComponent(token)}`;
  return page(`<h2>Reservation ${e(r.status)}</h2><p>${e(r.name)} · ${r.partySize} guests<br>${e(label(r.startAt, r.timezone))} · ${r.serviceMinutes} minute seating</p><p>${e(r.instructions)}</p><p>Online changes and cancellation close ${r.changeLeadMinutes} minutes before your seating time.</p><p>Keep this private link to view or manage your reservation.</p><p><a href="${changed}">Refresh reservation</a></p>${r.canChange ? `<p><a href="${changed}&change=1&party=${r.partySize}">Choose a different seating time</a></p><form method="post" action="${path}">${hidden("action", "cancel")}${hidden("manage", token)}<label><input type="checkbox" name="confirmed" value="yes" required> Cancel this reservation.</label><button>Cancel reservation</button></form>` : r.status === "cancelled" ? "" : "<p>Contact the restaurant for changes to this visit.</p>"}<p><a href="${path}">Book another visit</a></p>`);
}
export function GET(request: Request) {
  if (!rateLimit(clientKey(request, "dining-search"), 100).allowed) return page("<p>Please wait before searching again.</p>", 429);
  try {
    const url = new URL(request.url), token = url.searchParams.get("manage") ?? "", change = url.searchParams.get("change") === "1";
    if (token && !change) return receipt(token);
    const party = z.coerce.number().int().min(1).max(50).parse(url.searchParams.get("party") ?? 2), r = publicDining(url.searchParams.get("date") || undefined, party, change ? token : undefined);
    if (!r.enabled) return page("<h2>Website reservations are closed</h2><p>Contact the restaurant to book a table.</p>");
    return page(`<h2>${r.changing ? "Change your reservation" : "Reserve a table"}</h2><p>${e(r.instructions)}</p><form method="get" action="${path}">${change ? hidden("manage", token) + hidden("change", "1") : ""}<label>Visit date<input type="date" name="date" min="${r.today}" max="${dateAfter(r.today, r.horizonDays)}" value="${r.date}" required></label><label>Guests<input type="number" name="party" min="1" max="${r.maxPartySize}" value="${party}" required></label><button>Find seating times</button></form>${r.slots.length ? `<form method="post" action="${path}">${hidden("action", "review")}${hidden("proof", r.proof)}${hidden("partySize", String(party))}<label>Available seating times<select name="startAt" required>${r.slots.map(slot => `<option value="${e(slot.startAt)}">${e(label(slot.startAt, r.timezone))} · ${slot.serviceMinutes} minutes</option>`).join("")}</select></label><label>Guest name<input name="name" value="${e(r.guest?.name ?? "")}" autocomplete="name" maxlength="120" required></label><label>Phone<input name="phone" type="tel" value="${e(r.guest?.phone ?? "")}" autocomplete="tel" minlength="5" maxlength="40" required></label><label>Email (optional)<input name="email" type="email" value="${e(r.guest?.email ?? "")}" autocomplete="email" maxlength="160"></label><label>Seating requests or notes<textarea name="notes" maxlength="500">${e(r.guest?.notes ?? "")}</textarea></label><p>Contact the restaurant about accessibility or dietary arrangements that need confirmation.</p><label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label><input type="checkbox" name="consent" value="yes" required> I agree to share these details with the restaurant for this reservation.</label><button>Review reservation</button></form>` : `<p>No seating times match this search. Try another date or contact the restaurant.</p>`}`);
  } catch (error) { return page(`<h2>Could not open reservations</h2><p>${e(error instanceof z.ZodError ? "Choose a valid date and number of guests." : error instanceof Error ? error.message : "Try again.")}</p>`, 400); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return page("<p>Request origin not permitted.</p>", 403);
  if (!rateLimit(clientKey(request, "dining-submit"), 30).allowed) return page("<p>Please wait before submitting again.</p>", 429);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the reservation form.");
    const form = await readAuthForm(request, 30000); if (form.get("website")) throw new Error("Reload the reservation form.");
    if (form.get("action") === "review") {
      const r = reviewDining(form.get("proof") ?? "", { name: form.get("name"), phone: form.get("phone"), email: form.get("email") ?? "", notes: form.get("notes") ?? "", partySize: Number(form.get("partySize")), startAt: form.get("startAt"), consent: form.get("consent") === "yes" });
      return page(`<h2>Review your ${r.changing ? "new seating time" : "reservation"}</h2><p>${e(r.input.name)} · ${r.input.partySize} guests<br>${e(label(r.input.startAt, r.timezone))} · ${r.serviceMinutes} minute seating</p><p>${e(r.instructions)}</p><p>Online changes and cancellation close ${r.changeLeadMinutes} minutes before your seating time.</p><p>Notes: ${e(r.input.notes || "None")}</p><p>${r.changing ? "Your existing reservation stays in place until this change is confirmed." : "The table is reserved when you confirm below."}</p><form method="post" action="${path}">${hidden("action", "confirm")}${hidden("quote", r.quote)}<label><input type="checkbox" name="confirmed" value="yes" required> I confirm the seating time and reservation details.</label><button>${r.changing ? "Confirm changed reservation" : "Confirm reservation"}</button></form>`);
    }
    if (form.get("confirmed") !== "yes") throw new Error("Confirm the reservation action first.");
    if (form.get("action") === "confirm") return receipt(confirmDining(form.get("quote") ?? ""));
    if (form.get("action") === "cancel") { const token = form.get("manage") ?? ""; cancelDining(token); return receipt(token); }
    throw new Error("Choose a reservation action.");
  } catch (error) { return page(`<h2>Reservation could not be updated</h2><p>${e(error instanceof z.ZodError ? "Check the guest details, time, party size and consent." : error instanceof Error ? error.message : "Please try again.")}</p><p><a href="${path}">Search seating times</a></p>`, 400); }
}
