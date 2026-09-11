import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { AutoRepairWorkbench } from "./AutoRepairWorkbench";
import { executeRepairCommand, repairWorkspace } from "@/lib/auto-repair/service";
import { fixturePricing } from "@/lib/auto-repair/fixture";
import { addRecord } from "@/lib/sdk/records";
import { moduleById } from "@/lib/sdk/registry";
import { saveBusinessRecord, listBusinessRecords } from "@/lib/workspace/store";
let dir: string, vehicleId: string;
const actor = { id: "staff", name: "Fixture staff" };
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-repair-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", dir);
  const client = saveBusinessRecord({ kind: "client", title: "Garage client", fields: { email: "client@example.test" } }, "Fixture"); vehicleId = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: client.id, vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003 }).id;
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => { try { return Response.json(init?.method === "POST" ? { result: executeRepairCommand(JSON.parse(String(init.body)), actor) } : repairWorkspace()); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); } }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function click(name: string) { const b = await screen.findByRole("button", { name }); await waitFor(() => expect(b).toBeEnabled()); fireEvent.click(b); }
function publishFixture() { const result = executeRepairCommand({ action: "book.save", input: { requestId: randomUUID(), definition: fixturePricing(new Date().toISOString().slice(0, 10)), shareInTemplates: false } }, actor) as { id: string }; executeRepairCommand({ action: "book.publish", input: { requestId: randomUUID(), id: result.id, revision: 1, reviewed: true, review: "Reviewed fixture" } }, actor); }
it("edits real labor/parts rules, publishes a reviewed version and changes its sharing from the controls", async () => {
  render(<AutoRepairWorkbench initial={repairWorkspace()} canEdit mode="rules"/>); await click("New pricing version"); fill("Pricing name", "Garage rates"); await click("Add labor category"); fill("Labor category", "Mechanical"); fill("Hourly rate (USD)", "125.50"); fill("Minimum minutes", "30"); fill("Billing increment (minutes)", "15"); await click("Add parts category"); fill("Parts category", "Standard"); fill("Markup %", "45"); await click("Save pricing draft"); await waitFor(() => expect(repairWorkspace().books).toHaveLength(1));
  await click("Review & publish"); fill("Review notes", "Verified our operating rates and effective date"); fireEvent.click(screen.getByLabelText(/I reviewed these terms/)); await click("Publish reviewed pricing"); await waitFor(() => expect(repairWorkspace().books[0].status).toBe("published")); await click("Share in templates"); await waitFor(() => expect(repairWorkspace().books[0].shareInTemplates).toBe(true)); expect(repairWorkspace().books[0].definition.labor[0]).toMatchObject({ hourlyRate: 12550, minimumMinutes: 30, incrementMinutes: 15 }); await click("Copy to new version"); expect(screen.getByLabelText("Version")).toHaveValue(2);
});
async function prepareQuote() {
  fill("Vehicle and client", vehicleId); fill("Proposal title", "Brake service"); fill("Scope of work", "Replace the brake pads"); fill("Exclusions", "Rotors excluded"); await click("Add labor line"); fill("Labor description", "Brake labor"); fill("Requested minutes", "31"); await click("Add parts line"); fill("Part description", "Brake pad set"); fill("Unit cost (USD)", "1.01"); fill("Quantity", "3"); fill("Parts tax %", "6.25"); fill("Tax review reference", "Fixture owner reviewed rates"); fireEvent.click(screen.getByLabelText(/I checked the labor/)); await click("Calculate estimate"); await screen.findByRole("region", { name: "Calculated repair estimate" });
}
it("calculates through real commands, invalidates edited reviews and creates an actual proposal with a working record link", async () => {
  publishFixture(); render(<AutoRepairWorkbench initial={repairWorkspace()} canEdit mode="estimate"/>); await prepareQuote(); expect(screen.getByRole("heading", { name: "Review USD 97.44" })).toBeInTheDocument(); expect(listBusinessRecords(["proposal"])).toHaveLength(0);
  fill("Requested minutes", "1"); expect(screen.queryByRole("button", { name: "Create reviewed proposal" })).not.toBeInTheDocument(); fill("Requested minutes", "31"); await click("Calculate estimate"); await screen.findByRole("region", { name: "Calculated repair estimate" }); fireEvent.click(screen.getByLabelText(/I reviewed the itemized/)); await click("Create reviewed proposal"); await waitFor(() => expect(listBusinessRecords(["proposal"])).toHaveLength(1)); const proposal = listBusinessRecords(["proposal"])[0]; expect(proposal.fields.amount).toBe(9744); expect(await screen.findByRole("link", { name: /Open the proposal to review/ })).toHaveAttribute("href", `/modules/service-proposals?record=${proposal.id}`);
});
it("recovers a lost create response with the same request and does not duplicate the proposal", async () => {
  publishFixture(); render(<AutoRepairWorkbench initial={repairWorkspace()} canEdit mode="estimate"/>); await prepareQuote(); const realFetch = vi.mocked(fetch).getMockImplementation()!; let lost = false;
  vi.mocked(fetch).mockImplementation(async (...args) => { const response = await realFetch(...args); if (!lost && String(args[1]?.body).includes('"estimate.create"')) { lost = true; throw new Error("Connection interrupted"); } return response; });
  fireEvent.click(screen.getByLabelText(/I reviewed the itemized/)); await click("Create reviewed proposal"); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connection interrupted")); await click("Create reviewed proposal"); await screen.findByRole("link", { name: /Open the proposal to review/ }); expect(listBusinessRecords(["proposal"])).toHaveLength(1);
});
it("keeps pricing and estimate mutations disabled for view-only employees", () => { publishFixture(); const rendered = render(<AutoRepairWorkbench initial={repairWorkspace()} canEdit={false} mode="rules"/>); expect(screen.getByRole("button", { name: "New pricing version" })).toBeDisabled(); rendered.unmount(); render(<AutoRepairWorkbench initial={repairWorkspace()} canEdit={false} mode="estimate"/>); expect(screen.getByLabelText("Vehicle and client")).toBeDisabled(); expect(screen.getByRole("button", { name: "Add labor line" })).toBeDisabled(); });
