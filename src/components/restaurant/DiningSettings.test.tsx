import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DiningSettings } from "./DiningSettings";
import { DiningVisitControls } from "./DiningVisitControls";
import { executeDiningCommand, diningManagementData } from "@/lib/restaurant/dining";
import { restaurantState, saveRestaurantTable } from "@/lib/restaurant/store";
import { randomUUID } from "node:crypto";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let directory: string;
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-dining-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); saveRestaurantTable({ name: "Patio", seats: 4, area: "Outside" }); vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { const result = executeDiningCommand(JSON.parse(String(init?.body)), "Fixture owner", true); return { ok: true, json: async () => ({ result, data: diningManagementData() }) }; })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("publishes selected tables, weekly hours and holiday closures from actual form controls", async () => {
  render(<DiningSettings initial={diningManagementData()} canConfigure/>);
  fireEvent.click(screen.getByLabelText("Accept confirmed website reservations")); fireEvent.click(screen.getByLabelText(/Patio/)); fireEvent.click(screen.getByRole("button", { name: "Add service window" }));
  fireEvent.change(screen.getByLabelText("Service starts"), { target: { value: "12:00" } }); fireEvent.click(screen.getByRole("button", { name: "Add closed date or override" })); fireEvent.change(screen.getByLabelText("Exception date"), { target: { value: "2026-12-25" } });
  fireEvent.change(screen.getByLabelText(/Allowed embed origins/), { target: { value: "https://www.example.test\n" } }); fireEvent.click(screen.getByLabelText(/I reviewed the timezone/)); fireEvent.click(screen.getByRole("button", { name: "Save reservation settings" }));
  await screen.findByText("Reservation hours and booking rules saved."); expect(diningManagementData().settings).toMatchObject({ enabled: true, revision: 2, origins: ["https://www.example.test"], weekly: [{ weekday: 1, start: "12:00", end: "22:00", overnight: false }], exceptions: [{ date: "2026-12-25", windows: [] }] });
});
it("makes public reservation settings read-only for a non-owner", () => { render(<DiningSettings initial={diningManagementData()} canConfigure={false}/>); expect(screen.getByRole("button", { name: "Save reservation settings" })).toBeDisabled(); expect(screen.getByLabelText("Accept confirmed website reservations")).toBeDisabled(); });
it("saves a host's actual wait quote and table assignment through the floor controls", async () => {
  const { id } = executeDiningCommand({ action: "reservation.save", requestId: randomUUID(), input: { name: "Guest", phone: "", email: "", notes: "", partySize: 2, dateISO: "2099-01-01", time: "12:00", walkIn: true, tableId: null, quotedWaitMinutes: 10, host: "Host" } }, "Fixture owner", true);
  const current = () => restaurantState.read().reservations.find(r => r.id === id)!; const props = () => ({ reservation: current(), tables: diningManagementData().tables, disabled: false, timezone: "UTC" });
  const view = render(<DiningVisitControls {...props()}/>); fireEvent.change(screen.getByLabelText("Quoted wait (minutes)"), { target: { value: "25" } }); fireEvent.change(screen.getByLabelText("Host"), { target: { value: "Taylor" } }); fireEvent.click(screen.getByRole("button", { name: "Save quoted wait" }));
  await waitFor(() => expect(current().quotedWaitMinutes).toBe(25)); expect(current().host).toBe("Taylor"); view.rerender(<DiningVisitControls {...props()}/>); fireEvent.change(screen.getByLabelText("Table"), { target: { value: diningManagementData().tables[0].id } }); await waitFor(() => expect(current().tableId).toBeTruthy());
});
