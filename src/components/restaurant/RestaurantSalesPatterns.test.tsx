import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { RestaurantOperations } from "./RestaurantOperations";
import { restaurantFinanceData } from "@/lib/restaurant/management";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "@/lib/restaurant/business";
import { reportRequestQuery } from "@/lib/restaurant/report-model";
let dir: string;
const run = (action: string, input: unknown) => executeRestaurantCommand({ action, input, requestId: randomUUID() }, "Fixture accountant");
const close = (date: string, openMinutes?: number) => run("close", { date, operated: true, ...(openMinutes ? { openMinutes } : {}), countedCash: 0, note: "Private recorded cash close", reviewed: true }).id;
const renderFinance = (tab = "reports", edit = true) => render(<RestaurantOperations initial={restaurantFinanceData()} initialTab={tab} canEdit={false} canManageMoney={edit} canConfigure={false} allowedTabs={["money", "reports"]} readEndpoint="/api/restaurant/finance"/>);
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-report-ui-`); vi.stubEnv("DEALDESK_DATA_DIR", dir);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    try { if (init?.method === "POST") { executeRestaurantCommand(JSON.parse(String(init.body)), "UI accountant"); return { ok: true, json: async () => ({ ok: true }) }; }
      return { ok: true, json: async () => restaurantFinanceData(reportRequestQuery(new URL(url, "https://fixture.test").href)) };
    } catch (e) { return { ok: false, json: async () => ({ error: e instanceof Error ? e.message : "Report failed" }) }; }
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("records opening time from daily close and saves a separate reviewed correction through actual forms", async () => {
  renderFinance("money"); fireEvent.change(screen.getByLabelText("Close business date"), { target: { value: "2026-08-03" } }); fireEvent.change(screen.getByLabelText("Actual drawer cash counted"), { target: { value: "0" } }); fireEvent.change(screen.getByLabelText("Hours open"), { target: { value: "2" } }); fireEvent.change(screen.getByLabelText("Additional minutes"), { target: { value: "30" } }); fireEvent.change(screen.getByLabelText("Count evidence and review notes"), { target: { value: "Verified lunch opening and cash log" } }); fireEvent.click(screen.getByLabelText(/I reviewed the checks, tenders/)); fireEvent.click(screen.getByRole("button", { name: "Close and preserve this day" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().serviceHours?.[0].openMinutes).toBe(150)); const original = restaurantBusinessSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Sales patterns" })); fireEvent.click(screen.getByText("Review or correct opening time")); fireEvent.change(screen.getByLabelText("Reviewed service day"), { target: { value: original.closes[0].id } }); fireEvent.change(screen.getByLabelText("Hours open"), { target: { value: "1" } }); fireEvent.change(screen.getByLabelText("Opening-time evidence or correction reason"), { target: { value: "Verified one-hour closure for a kitchen repair" } }); fireEvent.click(screen.getByLabelText(/I verified the actual time open/)); fireEvent.click(screen.getByRole("button", { name: "Save reviewed opening time" }));
  await waitFor(() => expect(restaurantBusinessSnapshot().serviceHours?.[1].openMinutes).toBe(90)); expect(restaurantBusinessSnapshot().closes).toEqual(original.closes); expect(restaurantBusinessSnapshot().journals).toEqual(original.journals); await screen.findByText(/Review 2: 1 hours 30 minutes/);
});
it("filters the real report, keeps filters during refresh and connects the CSV to the applied range", async () => {
  close("2026-08-03", 120); close("2026-08-04", 480); renderFinance();
  fireEvent.change(screen.getByLabelText("First business date"), { target: { value: "2026-08-04" } }); fireEvent.change(screen.getByLabelText("Last business date"), { target: { value: "2026-08-04" } }); fireEvent.change(screen.getByLabelText("Comparison basis"), { target: { value: "open_day" } }); fireEvent.click(screen.getByRole("button", { name: "Apply report filters" }));
  await screen.findByText(/1 reviewed open days · 0 reviewed closed days/); expect(screen.getByRole("link", { name: "Download service-day CSV" })).toHaveAttribute("href", "/api/restaurant/reports?from=2026-08-04&to=2026-08-04&basis=open_day&format=csv");
  fireEvent.click(screen.getByRole("button", { name: "Refresh kitchen and payments" })); await waitFor(() => expect(screen.getByLabelText("First business date")).toHaveValue("2026-08-04"));
  fireEvent.change(screen.getByLabelText("Chart measure"), { target: { value: "sales" } }); expect(screen.getByRole("list", { name: "Sales per open day by weekday" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All recorded dates" })); await screen.findByText(/2 reviewed open days · 0 reviewed closed days/);
});
it("keeps the last applied report when an incomplete range is rejected", async () => {
  close("2026-08-03", 120); renderFinance(); fireEvent.change(screen.getByLabelText("First business date"), { target: { value: "2026-08-04" } }); fireEvent.click(screen.getByRole("button", { name: "Apply report filters" })); await screen.findByText(/Choose both the first and last business date/); expect(screen.getByRole("link", { name: "Download service-day CSV" })).toHaveAttribute("href", "/api/restaurant/reports?basis=open_hour&format=csv");
});
it("lets a Money viewer inspect and filter reports while disabling opening-time edits", () => {
  const id = close("2026-08-03"); renderFinance("reports", false); fireEvent.click(screen.getByText("Review or correct opening time")); fireEvent.change(screen.getByLabelText("Reviewed service day"), { target: { value: id } }); expect(screen.getByRole("button", { name: "Save reviewed opening time" })).toBeDisabled(); expect(screen.getByLabelText("Hours open")).toBeDisabled(); expect(screen.getByRole("button", { name: "Apply report filters" })).toBeEnabled();
});
