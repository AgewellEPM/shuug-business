import { describe, it, expect } from "vitest";
import { scoreTemplates, bestMatch } from "./compiler";
import { performance, type HandlerActivity } from "./model";
import { capabilityStatuses } from "./load";
import { templateById } from "./templates";
import { capabilityAvailable, CAPABILITIES } from "./capabilities";

describe("intent compiler", () => {
  it("routes 'I hate chasing invoices' to the Collections Handler", () => {
    expect(bestMatch("I hate chasing invoices")?.template.id).toBe("collections");
  });
  it("routes 'answer the phone and book appointments' to the Appointment Handler", () => {
    expect(bestMatch("I want someone to answer the phone and book appointments")?.template.id).toBe("appointment");
  });
  it("routes 'answering customers asking where their orders are' to Customer Service", () => {
    expect(bestMatch("I spend forever answering customers asking where their orders are")?.template.id).toBe("customer-service");
  });
  it("routes 'never run out of ingredients' to Purchasing", () => {
    expect(bestMatch("make sure we never run out of ingredients")?.template.id).toBe("purchasing");
  });
  it("routes 'wholesale inquiries' to Wholesale Sales", () => {
    expect(bestMatch("I need someone answering wholesale inquiries")?.template.id).toBe("wholesale-sales");
  });
  it("returns no match for an unrelated wish", () => {
    expect(bestMatch("the weather is nice today")).toBeNull();
  });
  it("ranks multiple matches, best first, and offers alternatives", () => {
    const ranked = scoreTemplates("I want help with invoices and collections and billing");
    expect(ranked[0].template.id).toBe("collections");
    expect(ranked[0].score).toBeGreaterThan(0);
  });
});

describe("performance math", () => {
  const act = (outcome: HandlerActivity["outcome"]): HandlerActivity => ({ id: Math.random().toString(36).slice(2), handlerId: "h", at: "", outcome, summary: "" });
  it("autonomy is autonomous ÷ handled (proposals excluded), plus estimated hours saved", () => {
    const activity = [act("autonomous"), act("autonomous"), act("escalated"), act("failed"), act("proposed")];
    const p = performance(activity, 6); // 6 min baseline
    expect(p.received).toBe(5);
    expect(p.autonomous).toBe(2);
    expect(p.autonomyPct).toBe(50); // 2 of 4 handled (proposed excluded)
    expect(p.hoursSavedEstimate).toBe(0.2); // 2 × 6min = 12min = 0.2h
  });
  it("is zero-safe with no activity", () => {
    expect(performance([], 10).autonomyPct).toBe(0);
  });
});

describe("capability availability", () => {
  it("data + internal actions are always available; channels need their integration", () => {
    const sms = CAPABILITIES.find((c) => c.id === "sms")!;
    const customers = CAPABILITIES.find((c) => c.id === "customers")!;
    expect(capabilityAvailable(customers, () => false)).toBe(true);
    expect(capabilityAvailable(sms, () => false)).toBe(false);
    expect(capabilityAvailable(sms, (d) => d.integration === "twilio")).toBe(true);
  });
  it("capabilityStatuses marks a handler's channel capabilities unavailable until connected", () => {
    const collections = templateById("collections")!;
    const statuses = capabilityStatuses(collections, () => false); // nothing connected
    const email = statuses.find((s) => s.capability.id === "email");
    expect(email?.available).toBe(false);
    expect(statuses.find((s) => s.capability.id === "invoices")?.available).toBe(true);
  });
});
