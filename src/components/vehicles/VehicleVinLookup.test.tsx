import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { VehicleVinLookup } from "./VehicleVinLookup";
import { reviewVehicleVin, applyVehicleVin, vehicleRegistry, vehicleClientOptions } from "@/lib/vehicles/service";
import { saveBusinessRecord } from "@/lib/workspace/store";
import { updateRecord } from "@/lib/sdk/records";
import { moduleById } from "@/lib/sdk/registry";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let dir: string, client: string;
const vin = "1HGCM82633A004352", actor = { id: "staff", name: "Fixture technician" };
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-vin-form-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); client = saveBusinessRecord({ kind: "client", title: "Garage client", currency: "USD", fields: { email: "client@example.test" } }, "Fixture").id;
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://vpic.nhtsa.dot.gov")) return Response.json({ Results: [{ VIN: vin, ErrorCode: "0", ErrorText: "Clean", Make: "HONDA", Model: "Accord", ModelYear: "2003" }] });
    const body = JSON.parse(String(init?.body)); try { return Response.json(body.action === "lookup" ? { review: await reviewVehicleVin(body.input, actor.id) } : { record: applyVehicleVin(body.input, actor) }); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
async function click(label: string) { const button = await screen.findByRole("button", { name: label }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); }
async function lookup() { fireEvent.change(screen.getByLabelText("VIN for lookup"), { target: { value: vin } }); fireEvent.change(screen.getByLabelText("Known model year (optional)"), { target: { value: "2003" } }); fireEvent.click(screen.getByLabelText(/Send this VIN/)); await click("Look up VIN"); await screen.findByRole("button", { name: "Save reviewed vehicle" }); }
it("looks up, reviews and saves a real vehicle and its evidence from the controls", async () => {
  render(<VehicleVinLookup records={[]} clients={vehicleClientOptions()} canEdit/>); await lookup(); expect(vehicleRegistry()).toHaveLength(0); fireEvent.change(screen.getByLabelText("Service client for this vehicle"), { target: { value: client } }); fireEvent.change(screen.getByLabelText("Registration or plate"), { target: { value: "PRIVATE-PLATE" } }); fireEvent.change(screen.getByLabelText("Odometer reading"), { target: { value: "42000" } }); fireEvent.click(screen.getByLabelText(/I compared the VIN/)); await click("Save reviewed vehicle");
  await waitFor(() => expect(vehicleRegistry()).toHaveLength(1)); expect(vehicleRegistry()[0].values).toMatchObject({ vin, make: "HONDA", customer_id: client, odometer: 42000 }); expect(await screen.findByRole("status")).toHaveTextContent("Saved the vehicle"); fireEvent.click(screen.getByText("Saved VIN review history")); expect(screen.getByText("Current identity matches the last reviewed lookup.")).toBeInTheDocument();
});
it("does not provide automatic apply controls for uncertain provider results", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ review: { result: { provider: "NHTSA vPIC", vin, make: "HONDA", model: "Accord", year: 2003, message: "Check digit mismatch", canApply: false }, proof: null, target: null } })); render(<VehicleVinLookup records={[]} clients={[]} canEdit/>); fireEvent.change(screen.getByLabelText("VIN for lookup"), { target: { value: vin } }); fireEvent.click(screen.getByLabelText(/Send this VIN/)); await click("Look up VIN"); expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was applied"); expect(screen.queryByRole("button", { name: "Save reviewed vehicle" })).not.toBeInTheDocument();
});
it("retains staff-entered details when a stale vehicle review is rejected", async () => {
  const r = await reviewVehicleVin({ vin, modelYear: 2003, recordId: null, consent: true }, actor.id), record = applyVehicleVin({ requestId: crypto.randomUUID(), proof: r.proof, details: { customer_id: client, registration: "", odometer: null, fleet_id: "", notes: "" }, reviewed: true }, actor);
  render(<VehicleVinLookup records={[record]} clients={vehicleClientOptions()} canEdit/>); fireEvent.change(screen.getByLabelText("Vehicle to look up"), { target: { value: record.id } }); fireEvent.click(screen.getByLabelText(/Send this VIN/)); await click("Look up VIN"); const notes = await screen.findByLabelText("Vehicle notes"); fireEvent.change(notes, { target: { value: "Keep this staff observation" } }); fireEvent.click(screen.getByLabelText(/I compared the VIN/)); updateRecord("vehicles", record.id, moduleById("vehicles")!.fields, { ...record.values, odometer: 50000 }); await click("Save reviewed vehicle"); expect(await screen.findByRole("status")).toHaveTextContent("changed during review"); expect(notes).toHaveValue("Keep this staff observation");
});
it("permits history inspection without exposing mutation controls to read-only users", () => { render(<VehicleVinLookup records={[]} clients={[]} canEdit={false}/>); expect(screen.queryByRole("button", { name: "Look up VIN" })).not.toBeInTheDocument(); fireEvent.click(screen.getByText("Saved VIN review history")); expect(screen.getByText("No reviewed VIN lookups saved yet.")).toBeInTheDocument(); });
