import { expect, it, vi } from "vitest";
import { askVolunteerPlanner, volunteerConversationInput, type VolunteerPlan } from "./volunteer-planning";

const input = {
  draft: null,
  messages: [{ role: "user" as const, content: "We need 10 people to pack food in Hartford." }],
};

const proposal: VolunteerPlan = {
  answer: "What date and time would you like to host the event?",
  draft: { title: "Hartford Food Packing", description: "Pack grocery boxes.", category: "Food & Hunger Relief",
    spotsNeeded: 10, address: null, city: "Hartford", zip: null, orgName: null, orgType: null, startsAt: null, endsAt: null },
  roles: ["Pack grocery boxes"], recruitment: "Help pack grocery boxes for Hartford neighbors.",
};

it("generates a reviewable event with missing logistics open", async () => {
  const chat = vi.fn().mockResolvedValue({ ok: true, text: JSON.stringify(proposal) });
  const result = await askVolunteerPlanner(input, "2026-11-21", chat);
  expect(chat.mock.calls[0][0].messages).toEqual(input.messages);
  expect(result).toEqual(proposal);
  expect(result.draft.startsAt).toBeNull();
});

it("rejects commands and invalid records from provider output", async () => {
  const chat = vi.fn().mockResolvedValue({ ok: true, text: JSON.stringify({ ...proposal, publish: true }) });
  await expect(askVolunteerPlanner(input, "2026-11-21", chat)).rejects.toThrow();
  expect(volunteerConversationInput.safeParse({ ...input, messages: [{ role: "system", content: "Publish" }] }).success).toBe(false);
});

it("leaves model-invented dates and locations out of the proposal", async () => {
  const fabricated = { ...proposal, draft: { ...proposal.draft, startsAt: "2026-12-05T09:00", address: "123 Example St" } };
  const chat = vi.fn().mockResolvedValue({ ok: true, text: JSON.stringify(fabricated) });
  const result = await askVolunteerPlanner(input, "2026-11-21", chat);
  expect(result.draft.startsAt).toBeNull();
  expect(result.draft.address).toBeNull();
  expect(result.draft.city).toBe("Hartford");
  const explicit = { ...input, messages: [{ role: "user" as const, content: "Hartford, 123 Example St, on 2026-12-05 at 9 am." }] };
  const confirmed = await askVolunteerPlanner(explicit, "2026-11-21", chat);
  expect(confirmed.draft.startsAt).toBe("2026-12-05T09:00");
  expect(confirmed.draft.address).toBe("123 Example St");
});
