// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { moduleById } from "../sdk/registry";
import { addRecord, updateRecord, setArchived } from "../sdk/records";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, CUSTOMER_PATH } from "./accounts";
import { createLinkedCustomer, saveCustomerSettings, customerSettings, customerView } from "./service";
import { clientTaxDocument, clientTaxDocuments, submitTaxDocument, staffTaxDocument, staffTaxDocuments, reviewTaxDocument, MAX_TAX_DOCUMENT_BYTES, TAX_DOCUMENT_ACCOUNT_BYTES } from "./tax-documents";
import { POST as upload } from "@/app/api/website/customer/documents/route";
import { GET as download } from "@/app/api/website/customer/documents/[id]/route";
import { GET as staffDownload, POST as staffReview } from "@/app/api/tax-documents/[id]/route";
import { requireSectionAccess } from "../permissions/guard";
import { sectionForPath } from "../permissions/model";
import type { ModuleRecord } from "../sdk/types";

vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn() }));
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "synthetic-staff" })) }));
let directory: string;
let alpha: { id: string; clientId: string; token: string };
let beta: typeof alpha;
let engagement: ModuleRecord;
let request: ModuleRecord;
const base = "https://workspace.example.com";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==", "base64");
const add = (moduleId: string, values: Record<string, string | number | boolean>) => addRecord(moduleId, moduleById(moduleId)!.fields, values);
const change = (moduleId: string, row: ModuleRecord, patch: Record<string, string | number | boolean>) => updateRecord(moduleId, row.id, moduleById(moduleId)!.fields, { ...row.values, ...patch });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const headers = (token: string = alpha.token) => ({ Cookie: `shuug_customer=${token}`, Origin: base, Accept: "application/json" });
function form(requestId = request.id, bytes = png, name = "Annual summary.png") {
  const data = new FormData(); data.set("requestId", requestId); data.set("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), name); return data;
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-tax-documents-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("APP_BASE_URL", base);
  vi.mocked(requireSectionAccess).mockReset();
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, customerId: null, clientId: client.id });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Synthetic-client-password");
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, "Synthetic-client-password") };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
  engagement = add("tax-engagements", { name: "Alpha preparation", client_id: alpha.clientId, tax_year: 2025, stage: "Awaiting documents", client_visible: true });
  request = add("tax-document-requests", { name: "Annual driver summary", client_id: alpha.clientId, engagement_id: engagement.id, status: "Requested", client_visible: true });
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("uploads requested bytes once, shares receipt status and protects files with account ownership", async () => {
  const response = await upload(new Request(`${base}${CUSTOMER_PATH}/documents`, { method: "POST", headers: headers(), body: form(request.id, png, "../../summary.png") }));
  expect(response.status).toBe(201); const { document } = await response.json();
  expect(document).toMatchObject({ status: "received", mime: "image/png", size: png.length, name: ".._.._summary.png" });
  expect(document.accountId).toBeUndefined(); expect(document.digest).toBeUndefined();
  const files = readdirSync(path.join(directory, "tax-documents")); expect(files).toEqual([document.id]);
  expect(readFileSync(path.join(directory, "tax-documents", document.id))).not.toEqual(png);
  expect(JSON.parse(readFileSync(path.join(directory, "tax-documents", document.id), "utf8"))).toMatchObject({ iv: expect.any(String), tag: expect.any(String), data: expect.any(String) });
  expect(submitTaxDocument(alpha.token, request.id, "Same file.png", png).id).toBe(document.id);
  const own = await download(new Request(`${base}${CUSTOMER_PATH}/documents/${document.id}`, { headers: headers() }), ctx(document.id));
  expect(own.status).toBe(200); expect(Buffer.from(await own.arrayBuffer())).toEqual(png);
  expect(own.headers.get("Cache-Control")).toBe("private, no-store"); expect(own.headers.get("Content-Disposition")).toContain("attachment;"); expect(own.headers.get("Content-Security-Policy")).toContain("sandbox");
  expect((await download(new Request(`${base}${CUSTOMER_PATH}/documents/${document.id}`, { headers: headers(beta.token) }), ctx(document.id))).status).toBe(404);
  expect((await upload(new Request(`${base}${CUSTOMER_PATH}/documents`, { method: "POST", headers: headers(beta.token), body: form() }))).status).toBe(404);
  expect(() => clientTaxDocuments(beta.token, request.id)).toThrow("unavailable");
});
it("rechecks request shares, parent ownership, account access and visibility on every operation", () => {
  const file = submitTaxDocument(alpha.token, request.id, "Own.png", png);
  change("tax-document-requests", request, { client_visible: false });
  expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("unavailable"); expect(() => submitTaxDocument(alpha.token, request.id, "Own.png", png)).toThrow("unavailable");
  change("tax-document-requests", request, { client_visible: true });
  change("tax-engagements", engagement, { client_visible: false }); expect(() => clientTaxDocuments(alpha.token, request.id)).toThrow("unavailable");
  change("tax-engagements", engagement, { client_visible: true, client_id: beta.clientId }); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("unavailable");
  change("tax-engagements", engagement, { client_visible: true });
  saveBranding({ featureVisibility: { "module:tax-document-requests": false } }); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("unavailable");
  saveBranding({ featureVisibility: {} });
  saveCustomerSettings({ ...customerSettings(), servicePortal: false }); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("unavailable");
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  setArchived("tax-document-requests", request.id, true); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("unavailable");
  setArchived("tax-document-requests", request.id, false);
  setCustomerEnabled(alpha.id, false); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("Sign in");
});
it("keeps received status distinct from staff review and enforces staff route permissions", async () => {
  const file = submitTaxDocument(alpha.token, request.id, "Own.png", png);
  expect(staffTaxDocuments()[0]).toMatchObject({ id: file.id, requestName: "Annual driver summary", status: "received" });
  expect(staffTaxDocument(file.id).bytes).toEqual(png);
  const denied = vi.mocked(requireSectionAccess).mockRejectedValue(new Error("denied"));
  expect((await staffDownload(new Request(`${base}/api/tax-documents/${file.id}`), ctx(file.id))).status).toBe(404);
  expect((await staffReview(new Request(`${base}/api/tax-documents/${file.id}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ status: "reviewed" }) }), ctx(file.id))).status).toBe(403);
  denied.mockResolvedValue(undefined);
  const reviewed = await staffReview(new Request(`${base}/api/tax-documents/${file.id}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ status: "reviewed" }) }), ctx(file.id));
  expect(reviewed.status).toBe(200); expect(denied).toHaveBeenLastCalledWith("services", "edit");
  expect(clientTaxDocuments(alpha.token, request.id)[0]).toMatchObject({ status: "reviewed", reviewedAt: expect.any(String) });
  expect(workspaceDatabase(db => db.prepare("SELECT status,actor FROM tax_document_reviews").all())).toEqual([{ status: "reviewed", actor: "synthetic-staff" }]);
  reviewTaxDocument(file.id, "replacement_requested", "synthetic-staff");
  expect(clientTaxDocument(alpha.token, file.id).status).toBe("replacement_requested");
  expect(sectionForPath("/tax-documents")).toBe("services");
  expect((await customerView(alpha.token)).tax?.engagements[0].documents[0].status).toBe("Requested");
});
it("rejects cross-origin, malformed, oversize and unsupported files before saving any bytes", async () => {
  const cross = await upload(new Request(`${base}${CUSTOMER_PATH}/documents`, { method: "POST", headers: { ...headers(), Origin: "https://attacker.example" }, body: form() }));
  expect(cross.status).toBe(403);
  const anonymous = await upload(new Request(`${base}${CUSTOMER_PATH}/documents`, { method: "POST", headers: { Origin: base, Accept: "application/json" }, body: form() })); expect(anonymous.status).toBe(401);
  const multiple = form(); multiple.append("file", new Blob([new Uint8Array(png)]), "Second.png");
  expect((await upload(new Request(`${base}${CUSTOMER_PATH}/documents`, { method: "POST", headers: headers(), body: multiple }))).status).toBe(400);
  expect(() => submitTaxDocument(alpha.token, request.id, "unsafe.html", Buffer.from("<script>alert(1)</script>"))).toThrow("PDF");
  expect(() => submitTaxDocument(alpha.token, request.id, "large.png", Buffer.alloc(MAX_TAX_DOCUMENT_BYTES + 1))).toThrow("10 MB");
  expect(() => submitTaxDocument(alpha.token, randomUUID(), "missing.png", png)).toThrow("unavailable");
  expect(readdirSync(directory)).not.toContain("tax-documents");
});
it("enforces aggregate quotas and repairs missing bytes only from an identical authenticated retry", () => {
  const file = submitTaxDocument(alpha.token, request.id, "Own.png", png);
  const target = path.join(directory, "tax-documents", file.id);
  writeFileSync(target, "damaged"); expect(() => clientTaxDocument(alpha.token, file.id)).toThrow("integrity");
  expect(submitTaxDocument(alpha.token, request.id, "Retry.png", png).id).toBe(file.id); expect(clientTaxDocument(alpha.token, file.id).bytes).toEqual(png);
  workspaceDatabase(db => db.prepare("UPDATE tax_client_documents SET size=? WHERE id=?").run(TAX_DOCUMENT_ACCOUNT_BYTES, file.id), true);
  expect(() => submitTaxDocument(alpha.token, request.id, "Another.png", Buffer.concat([png, Buffer.from("new")]))).toThrow("capacity");
  expect(readdirSync(path.join(directory, "tax-documents"))).toEqual([file.id]);
});
