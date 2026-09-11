import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { StaffSchedule } from "./StaffSchedule";
import { addMember } from "@/lib/team/store";
import { executeScheduleCommand, scheduleView } from "@/lib/timeclock/schedule";
let directory: string, memberId: string;
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-schedule-form-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); memberId = addMember({ name: "Kitchen colleague", email: "kitchen@example.test", role: "Employee" }).id; vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { const result = executeScheduleCommand(JSON.parse(String(init?.body)), { memberId: "owner", name: "Owner" }, true); return { ok: true, json: async () => ({ result, data: scheduleView(undefined, true) }) }; })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("creates an assigned draft from the form and publishes it to employee work", async () => {
  render(<StaffSchedule initial={scheduleView(undefined, true)} manager/>);
  for (const [label, value] of [["Employee", memberId], ["Role", "Lunch cook"], ["Station or location", "Grill"], ["Shift starts", "2099-09-21T08:00"], ["Shift ends", "2099-09-21T16:00"], ["Hourly base labor rate ($, optional)", "20.00"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Add draft shift" })); await waitFor(() => expect(scheduleView().shifts).toHaveLength(1)); expect(scheduleView(memberId).shifts).toHaveLength(0);
  fireEvent.click(await screen.findByRole("button", { name: "Publish shift" })); await waitFor(() => expect(scheduleView(memberId).shifts[0].role).toBe("Lunch cook")); expect(scheduleView(memberId).shifts[0].hourlyRate).toBeNull();
});
it("disables management controls for a read-only manager", () => { render(<StaffSchedule initial={scheduleView(undefined, true)} manager canEdit={false}/>); expect(screen.getByRole("button", { name: "Add draft shift" })).toBeDisabled(); });
