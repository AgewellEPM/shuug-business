// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, setCustomerEnabled, signInCustomer } from "../customer-access/accounts";
import { saveSecrets } from "../connections/vault";
import { GET, POST } from "@/app/api/website/customer/driver/routes/route";

const base = "https://workspace.example.com", routePath = "/api/website/customer/driver/routes";
const key = "synthetic-driver-routes-key-only";
const polyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const input = { origin: { latitude: 38.5, longitude: -120.2 }, destination: { latitude: 43.252, longitude: -126.453 }, alternatives: false };
const provider = (patch = {}) => ({ routes: [{ distanceMeters: 900000, duration: "36000.25s", polyline: { encodedPolyline: polyline }, description: "Synthetic route", ...patch }] });
let directory: string, alpha: { id: string; token: string }, beta: typeof alpha;
let network: ReturnType<typeof vi.fn<typeof fetch>>;
function request(token?: string, body: unknown = input, extra: Record<string, string> = {}) {
  return new Request(base + routePath, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const get = (token?: string) => GET(new Request(base + routePath, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/gigtax-driver-routes-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("APP_BASE_URL", base);
  vi.stubEnv("GOOGLE_MAPS_DRIVER_SERVER_KEY", key); vi.stubEnv("GOOGLE_MAPS_DRIVER_ROUTES_ENABLED", "true");
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Synthetic-driver-route-password");
    return { id: user.id, token: signInCustomer(user.email, "Synthetic-driver-route-password") };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
  network = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(provider())); vi.stubGlobal("fetch", network);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("authenticates invited driver accounts before reading input or contacting Google", async () => {
  expect((await POST(request(undefined, "invalid JSON"))).status).toBe(401);
  expect((await POST(request("f".repeat(64), " ".repeat(5000)))).status).toBe(401);
  expect((await get()).status).toBe(401);
  setCustomerEnabled(alpha.id, false);
  expect((await POST(request(alpha.token))).status).toBe(401);
  expect(network).not.toHaveBeenCalled();
});
it("returns authenticated readiness flags without provider requests or credential values", async () => {
  const response = await get(alpha.token);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ provider: "googleRoutes", ready: true });
  saveSecrets({ GOOGLE_MAPS_DRIVER_ROUTES_ENABLED: "false" });
  const stopped = await get(alpha.token), text = await stopped.text();
  expect(JSON.parse(text)).toMatchObject({ ready: false }); expect(text).not.toContain(key);
  expect((await POST(request(alpha.token))).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("does not substitute staff Visits credentials for the driver Routes key", async () => {
  vi.stubEnv("GOOGLE_MAPS_DRIVER_SERVER_KEY", ""); vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "synthetic-staff-visits-key");
  expect((await (await get(alpha.token)).json()).ready).toBe(false);
  expect((await POST(request(alpha.token))).status).toBe(503); expect(network).not.toHaveBeenCalled();
});
it("sends only bounded chosen coordinates to the fixed provider and decodes real polyline/duration formats", async () => {
  const response = await POST(request(alpha.token)); expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ provider: "googleRoutes", routes: [{ distanceMeters: 900000, durationSeconds: 36000.25, name: "Synthetic route",
    points: [{ latitude: 38.5, longitude: -120.2 }, { latitude: 40.7, longitude: -120.95 }, { latitude: 43.252, longitude: -126.453 }] }] });
  expect(Date.now() - Date.parse(result.measuredAt)).toBeLessThan(5000);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
  const headers = new Headers(options?.headers);
  expect(headers.get("X-Goog-Api-Key")).toBe(key); expect(headers.get("Authorization")).toBeNull();
  expect(headers.get("X-Goog-FieldMask")).not.toContain("*");
  expect(JSON.parse(options?.body as string)).toMatchObject({ origin: { location: { latLng: input.origin } }, destination: { location: { latLng: input.destination } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", computeAlternativeRoutes: false });
  expect(String(options?.body)).not.toContain(alpha.token); expect(String(options?.body)).not.toContain(alpha.id);
  expect(JSON.stringify(result)).not.toContain(key); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([
  { ...input, url: "https://other.example/collect" },
  { ...input, origin: { latitude: 91, longitude: 0 } },
  { ...input, destination: { latitude: 0, longitude: -181 } },
  { ...input, alternatives: "yes" },
])("rejects invalid coordinates/options and arbitrary provider URLs", async body => {
  expect((await POST(request(alpha.token, body))).status).toBe(400); expect(network).not.toHaveBeenCalled();
});
it("rejects foreign origins, wrong media types and bodies exceeding4KiB", async () => {
  expect((await POST(request(alpha.token, input, { Origin: "https://other.example" }))).status).toBe(403);
  expect((await POST(request(alpha.token, input, { "Content-Type": "text/plain" }))).status).toBe(415);
  expect((await POST(request(alpha.token, " ".repeat(4097)))).status).toBe(413);
  expect(network).not.toHaveBeenCalled();
});
it.each([
  provider({ duration: "NaNs" }), provider({ duration: "-1s" }), provider({ duration: "0s" }),
  provider({ distanceMeters: -1 }), provider({ polyline: { encodedPolyline: "_" } }),
  { routes: Array.from({ length: 4 }, () => provider().routes[0]) },
])("rejects incomplete, impossible or oversized provider route structures", async payload => {
  network.mockResolvedValueOnce(Response.json(payload)); expect((await POST(request(alpha.token))).status).toBe(502);
});
it("rejects geometry that is unrelated to the requested endpoints", async () => {
  const wrong = { ...input, destination: { latitude: 0, longitude: 0 } };
  expect((await POST(request(alpha.token, wrong))).status).toBe(502);
});
it("bounds provider bytes, handles empty results, and keeps provider errors private", async () => {
  network.mockResolvedValueOnce(new Response("private provider diagnostic", { headers: { "Content-Type": "application/json", "Content-Length": String(4 * 1024 * 1024 + 1) } }));
  expect((await POST(request(alpha.token))).status).toBe(502);
  network.mockResolvedValueOnce(Response.json({ routes: [] })); expect((await POST(request(alpha.token))).status).toBe(404);
  network.mockResolvedValueOnce(Response.json({ error: { key, message: "PRIVATE-DEBUG" } }, { status: 403 }));
  const failed = await POST(request(alpha.token)), text = await failed.text();
  expect(failed.status).toBe(503); expect(text).not.toContain(key); expect(text).not.toContain("PRIVATE-DEBUG");
});
it("rechecks revocation and provider changes after asynchronous lookups", async () => {
  network.mockImplementationOnce(async () => { setCustomerEnabled(alpha.id, false); return Response.json(provider()); });
  expect((await POST(request(alpha.token))).status).toBe(401);
  network.mockImplementationOnce(async () => { saveSecrets({ GOOGLE_MAPS_DRIVER_ROUTES_ENABLED: "false" }); return Response.json(provider()); });
  expect((await POST(request(beta.token))).status).toBe(409);
});
it("applies an account-specific quota before additional paid provider calls", async () => {
  for (let i = 0; i < 30; i++) expect((await POST(request(alpha.token))).status).toBe(200);
  const limited = await POST(request(alpha.token)); expect(limited.status).toBe(429); expect(limited.headers.get("Retry-After")).toBe("60");
  expect(network).toHaveBeenCalledTimes(30);
  expect((await POST(request(beta.token))).status).toBe(200);
});
it("honors hidden driver modules and does not persist chosen coordinates or route geometry", async () => {
  expect((await POST(request(alpha.token))).status).toBe(200);
  expect(readFileSync(`${directory}/workspace.sqlite`).includes(Buffer.from(polyline))).toBe(false);
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } });
  expect((await POST(request(alpha.token))).status).toBe(404);
});
