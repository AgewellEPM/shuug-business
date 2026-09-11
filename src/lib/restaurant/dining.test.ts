// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand } from "./business";
import { restaurantState, saveRestaurantTable } from "./store";
import { executeDiningCommand, diningManagementData } from "./dining";
import { emptyDining, type DiningSettings } from "./dining-model";
import { diningSlots } from "./dining-availability";
import { publicDining, reviewDining, confirmDining, cancelDining, diningReceipt } from "./dining-website";
import { loadRestaurant } from "./load";
import { GET, POST } from "@/app/api/website/reservations/route";
let directory: string, table: string;
const base = "https://restaurant.example.test", date = "2026-09-21";
const run = (action: string, input: unknown, requestId = randomUUID(), owner = true) => executeDiningCommand({ action, input, requestId }, "Fixture host", owner);
const settings = (change: Partial<DiningSettings> = {}) => run("settings.save", { ...diningManagementData().settings, ...change });
const guest = (startAt = "2026-09-21T21:00:00Z", name = "Guest One") => ({ name, phone: "555-0100", email: "guest@example.test", notes: "Window if possible", partySize: 2, startAt, consent: true });
const review = (startAt?: string, token?: string) => reviewDining(publicDining(date, 2, token).proof, guest(startAt));
const reservation = (id: string) => restaurantState.read().reservations.find(r => r.id === id)!;
const version = (id: string) => ({ id, revision: reservation(id).revision });
const staffInput = () => ({ name: "Walk in", phone: "", email: "", notes: "", partySize: 2, dateISO: date, time: "17:00", occurrence: "first", tableId: null, walkIn: false, quotedWaitMinutes: null, host: "" });
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-dining-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T16:00:00Z"));
  executeRestaurantCommand({ requestId: randomUUID(), action: "configure", input: { name: "Dining fixture", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 0, taxReviewed: true } }, "Fixture owner");
  table = saveRestaurantTable({ name: "Private table name", seats: 2, area: "Main" }).id;
  settings({ ...emptyDining().settings, enabled: true, tableIds: [table], origins: ["https://www.example.test"], weekly: [{ weekday: 1, start: "17:00", end: "22:00", overnight: false }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("publishes actual opening hours, fits seating plus cleanup before closing and enforces party, notice and horizon limits", () => {
  const slots = publicDining(date).slots; expect(slots[0].startAt).toBe("2026-09-21T21:00:00.000Z"); expect(slots.at(-1)?.startAt).toBe("2026-09-22T00:15:00.000Z");
  expect(publicDining(date, 3).slots).toHaveLength(0); expect(publicDining("2026-09-22").slots).toHaveLength(0); expect(publicDining("2026-12-21").slots).toHaveLength(0);
  vi.setSystemTime(new Date("2026-09-21T20:45:00Z")); expect(publicDining(date).slots[0].startAt).toBe("2026-09-21T21:15:00.000Z");
});
it("confirms the last table once and rejects competing reviews without partial writes", () => {
  const first = review(), competing = review(); const token = confirmDining(first.quote); confirmDining(first.quote);
  expect(restaurantState.read().reservations).toHaveLength(1); expect(diningReceipt(token).status).toBe("confirmed");
  const before = JSON.stringify(restaurantState.read()); expect(() => confirmDining(competing.quote)).toThrow("no longer available"); expect(JSON.stringify(restaurantState.read())).toBe(before);
  const floor = loadRestaurant(date); expect(floor.reservations[0]).toMatchObject({ tableId: table, source: "website", durationMinutes: 105, serviceMinutes: 90 });
  expect(publicDining(date).slots.some(s => s.startAt === "2026-09-21T22:30:00.000Z")).toBe(false); expect(publicDining(date).slots.some(s => s.startAt === "2026-09-21T22:45:00.000Z")).toBe(true);
});
it("keeps the original booking when a reschedule loses its table, then atomically moves a later successful booking", () => {
  const token = confirmDining(review().quote), id = restaurantState.read().reservations[0].id;
  const change = review("2026-09-21T23:00:00Z", token), competing = review("2026-09-21T23:00:00Z"); const other = confirmDining(competing.quote);
  expect(() => confirmDining(change.quote)).toThrow("existing reservation"); expect(reservation(id).startAt).toBe("2026-09-21T21:00:00.000Z");
  cancelDining(other); const changed = confirmDining(review("2026-09-21T23:00:00Z", token).quote); expect(diningReceipt(changed).startAt).toBe("2026-09-21T23:00:00.000Z"); expect(reservation(id).revision).toBe(2);
  expect(publicDining(date).slots[0].startAt).toBe("2026-09-21T21:00:00.000Z"); expect(diningManagementData().audit[0]).toMatchObject({ action: "reservation.rescheduled", before: { startAt: "2026-09-21T21:00:00.000Z" } });
});
it("captures guest instructions, duration and cutoff, and preserves cancellation when new bookings are disabled", () => {
  const token = confirmDining(review().quote); settings({ enabled: false, changeLeadMinutes: 0, turnMinutes: 30, instructions: "Different future instructions." });
  expect(publicDining(date).slots).toHaveLength(0); expect(diningReceipt(token)).toMatchObject({ serviceMinutes: 90, changeLeadMinutes: 60 }); expect(diningReceipt(token).instructions).not.toContain("Different");
  vi.setSystemTime(new Date("2026-09-21T20:01:00Z")); expect(diningReceipt(token).canChange).toBe(false); expect(() => cancelDining(token)).toThrow("Contact");
  vi.setSystemTime(new Date("2026-09-21T20:00:00Z")); cancelDining(token); cancelDining(token); expect(diningReceipt(token).status).toBe("cancelled");
});
it("invalidates stale policies, expired reviews, altered receipts and reused review identifiers", () => {
  const stale = review(); settings({ instructions: "New reviewed guest instructions." }); expect(() => confirmDining(stale.quote)).toThrow("terms changed");
  const expired = review(); vi.setSystemTime(new Date("2026-09-21T16:16:00Z")); expect(() => confirmDining(expired.quote)).toThrow("expired");
  const proof = publicDining(date).proof, a = reviewDining(proof, guest()), b = reviewDining(proof, guest("2026-09-21T23:00:00Z")); const token = confirmDining(a.quote); expect(() => confirmDining(b.quote)).toThrow("another reservation"); expect(() => diningReceipt(token.slice(0, -5) + "xxxxx")).toThrow(); expect(() => diningReceipt(proof)).toThrow();
  vi.setSystemTime(new Date("2026-09-21T16:40:00Z")); expect(diningReceipt(confirmDining(a.quote)).status).toBe("confirmed");
});
it("rechecks guest authority after a staff edit and prevents accidental timezone changes after bookings", () => {
  const token = confirmDining(review().quote), id = restaurantState.read().reservations[0].id, stale = review("2026-09-21T23:00:00Z", token);
  run("reservation.save", { ...staffInput(), ...version(id), tableId: table, name: "Updated by host" }); expect(() => confirmDining(stale.quote)).toThrow("changed");
  expect(() => executeRestaurantCommand({ requestId: randomUUID(), action: "configure", input: { name: "Dining fixture", timezone: "UTC", businessDayStartHour: 4, taxBasisPoints: 0, taxReviewed: true } }, "Fixture owner")).toThrow();
});
it("supports overnight windows and closes holiday arrivals without cancelling confirmed visits", () => {
  settings({ weekly: [{ weekday: 1, start: "22:00", end: "02:00", overnight: true }] }); const slots = publicDining("2026-09-22").slots;
  expect(slots.map(s => s.startAt)).toEqual(["2026-09-22T04:00:00.000Z", "2026-09-22T04:15:00.000Z"]);
  const token = confirmDining(reviewDining(publicDining("2026-09-22").proof, guest(slots[0].startAt)).quote);
  settings({ exceptions: [{ date: "2026-09-22", windows: [] }] }); expect(publicDining("2026-09-22").slots).toHaveLength(0); expect(diningReceipt(token).status).toBe("confirmed");
});
it("offers both repeated fall-back seating times and omits nonexistent spring-forward times", () => {
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z")); settings({ turnMinutes: 30, bufferMinutes: 0, weekly: [{ weekday: 0, start: "00:00", end: "04:00", overnight: false }] });
  const fall = publicDining("2026-11-01").slots; expect(fall.map(s => s.startAt)).toEqual(expect.arrayContaining(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]));
  vi.setSystemTime(new Date("2027-03-13T12:00:00Z")); const spring = diningSlots(restaurantState.read(), "2027-03-14", 2); expect(spring.some(s => s.time.startsWith("02:"))).toBe(false); expect(spring.some(s => s.time === "03:00")).toBe(true);
});
it("limits arrivals across available tables and accepts non-overlapping date overrides", () => {
  const second = saveRestaurantTable({ name: "Second table", area: "Main", seats: 4 }).id; settings({ tableIds: [table, second], maxArrivingCovers: 2 }); confirmDining(review().quote);
  expect(publicDining(date).slots.some(s => s.startAt === "2026-09-21T21:00:00.000Z")).toBe(false); expect(publicDining(date).slots.some(s => s.startAt === "2026-09-21T21:15:00.000Z")).toBe(true);
  settings({ exceptions: [{ date: "2026-09-22", windows: [{ start: "12:00", end: "15:00", overnight: false }] }] }); expect(publicDining("2026-09-22").slots[0].startAt).toBe("2026-09-22T16:00:00.000Z");
});
it("rejects unauthorized settings, unknown tables, impossible hours and overlapping exception windows", () => {
  const input = diningManagementData().settings;
  expect(() => run("settings.save", input, randomUUID(), false)).toThrow("owner"); expect(() => settings({ tableIds: [randomUUID()] })).toThrow("existing"); expect(() => settings({ weekly: [{ weekday: 1, start: "21:00", end: "22:00", overnight: false }] })).toThrow("buffer");
  expect(() => settings({ exceptions: [{ date, windows: [{ start: "12:00", end: "16:00", overnight: false }, { start: "15:00", end: "19:00", overnight: false }] }] })).toThrow("overlapping");
  expect(() => settings({ origins: ["https://www.example.test/path"] })).toThrow(); expect(diningManagementData().settings).toEqual(input);
});
it("records real walk-in time, wait quotes, arrival and seating with optimistic revisions and retry protection", () => {
  const input = { ...staffInput(), dateISO: "2026-09-23", time: "23:00", walkIn: true, quotedWaitMinutes: 20 }, requestId = randomUUID();
  const { id } = run("reservation.save", input, requestId); run("reservation.save", input, requestId); expect(reservation(id)).toMatchObject({ dateISO: date, time: "12:00", status: "waiting", arrivedAt: "2026-09-21T16:00:00.000Z", host: "Fixture host" }); expect(restaurantState.read().reservations).toHaveLength(1);
  const stale = version(id); run("visit.quote", { ...stale, quotedWaitMinutes: 10, host: "Alex" }); expect(() => run("visit.table", { ...stale, tableId: table })).toThrow("changed"); run("visit.table", { ...version(id), tableId: table });
  vi.setSystemTime(new Date("2026-09-21T16:08:00Z")); run("visit.status", { ...version(id), status: "seated" }); expect(reservation(id).seatedAt).toBe("2026-09-21T16:08:00.000Z"); expect(() => run("visit.quote", { ...version(id), quotedWaitMinutes: 1, host: "Alex" })).toThrow("arrived");
  run("visit.status", { ...version(id), status: "completed" }); expect(reservation(id).completedAt).toBe("2026-09-21T16:08:00.000Z");
});
it("shares assigned tables across public reservations and staff bookings, and rejects seating without a table", () => {
  confirmDining(review().quote); expect(() => run("reservation.save", { ...staffInput(), tableId: table })).toThrow("unavailable");
  const { id } = run("reservation.save", staffInput()); run("visit.arrive", version(id)); expect(reservation(id).arrivedAt).toBeTruthy(); expect(() => run("visit.status", { ...version(id), status: "seated" })).toThrow("Assign a table");
  expect(() => run("reservation.save", { ...staffInput(), ...version(id), time: "20:00" })).toThrow("upcoming");
});
const post = (form: Record<string, string>, origin = base) => POST(new Request(base + "/api/website/reservations", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) }));
it("serves real guest forms, escapes notes, enforces origin and consent, and keeps guest links private", async () => {
  const response = GET(new Request(`${base}/api/website/reservations?date=${date}`)), html = await response.text(); expect(html).toContain("Find seating times"); expect(html).not.toContain("Private table name"); expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://www.example.test"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const proof = html.match(/name="proof" value="([^"]+)"/)![1], form = { ...guest(), partySize: "2", consent: "yes", action: "review", proof, notes: "<script>bad()</script>" };
  expect((await post(form, "https://attacker.test")).status).toBe(403); expect((await post({ ...form, consent: "no" })).status).toBe(400); const reviewHtml = await (await post(form)).text(); expect(reviewHtml).not.toContain("<script>"); expect(reviewHtml).toContain("60 minutes before");
  const quote = reviewHtml.match(/name="quote" value="([^"]+)"/)![1]; expect((await post({ action: "confirm", quote })).status).toBe(400);
  const confirmed = await post({ action: "confirm", quote, confirmed: "yes" }), receipt = await confirmed.text(); expect(receipt).toContain("Reservation confirmed"); expect(receipt).not.toContain(table); const token = receipt.match(/name="manage" value="([^"]+)"/)![1];
  expect((await GET(new Request(`${base}/api/website/reservations?date=${date}`)).text())).not.toContain("Guest One"); const cancelled = await post({ action: "cancel", manage: token, confirmed: "yes" }); expect(await cancelled.text()).toContain("Reservation cancelled");
});
it("uses actual seating time for table occupancy and keeps the promised reservation time in history", () => {
  confirmDining(review().quote); const first = restaurantState.read().reservations[0], later = confirmDining(review("2026-09-21T23:00:00Z").quote);
  vi.setSystemTime(new Date("2026-09-21T21:45:00Z")); expect(() => run("visit.status", { ...version(first.id), status: "seated" })).toThrow("unavailable"); expect(reservation(first.id).seatedAt).toBeNull();
  cancelDining(later); run("visit.status", { ...version(first.id), status: "seated" }); expect(reservation(first.id).startAt).toBe("2026-09-21T21:00:00.000Z"); expect(publicDining(date).slots.some(s => s.startAt === "2026-09-21T23:00:00.000Z")).toBe(false);
});
it("keeps overnight seated and waiting guests on today's live floor without counting them twice in daily covers", () => {
  const { id } = run("reservation.save", { ...staffInput(), walkIn: true, tableId: table }); run("visit.status", { ...version(id), status: "seated" });
  const waiting = run("reservation.save", { ...staffInput(), walkIn: true }).id;
  vi.setSystemTime(new Date("2026-09-22T04:30:00Z")); const floor = loadRestaurant(); expect(floor.dateISO).toBe("2026-09-22"); expect(floor.reservations.map(r => r.id)).toEqual(expect.arrayContaining([id, waiting])); expect(floor.reservations.every(r => r.carriedFromEarlierDate)).toBe(true); expect(floor.night.covers).toBe(0);
  run("visit.status", { ...version(id), status: "completed" }); run("visit.status", { ...version(waiting), status: "cancelled" }); expect(loadRestaurant().reservations).toHaveLength(0); expect(loadRestaurant(date).reservations).toHaveLength(2);
});
