import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { addNote, listNotes, updateNote } from "../notes/store";
import { saveDocument, listDocuments } from "../workspace/documents";
import type { Roadmap } from "./model";
import { askRoadmap } from "./service";
const mock = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("../llm", () => ({ llmChat: mock.chat, llmLabel: () => "Test AI" }));
let dir: string; const old = process.env.DEALDESK_DATA_DIR;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/planning-test-`); process.env.DEALDESK_DATA_DIR = dir; vi.clearAllMocks(); });
afterEach(() => { if (old === undefined) delete process.env.DEALDESK_DATA_DIR; else process.env.DEALDESK_DATA_DIR = old; rmSync(dir, { recursive: true, force: true }); });
it("persists note → AI proposal → reviewed roadmap → progress across separate database connections", async () => {
  const note = addNote({ author: "Owner", pageKey: "internal", pageLabel: "Internal", scope: "internal", title: "Program report", profile: "nonprofit", body: "Review attendance and gather missing receipts before writing the report." });
  const privateNote = addNote({ author: "Owner", pageKey: "/modules/nonprofit-participants", pageLabel: "Participants", scope: "page", title: "Private case", profile: "nonprofit", body: "Private participant details must not enter this request." });
  mock.chat.mockResolvedValue({ ok: true, text: JSON.stringify({ answer: "Start with the evidence.", plan: { title: "Prepare program report", outcome: "Submit reviewed evidence", steps: [{ title: "Review attendance", detail: "Check missing entries", milestone: "Evidence", due: "", status: "done" }] } }) });
  const result = await askRoadmap({ goal: "Prepare report", jobRole: "Program manager", profile: "nonprofit", notes: [note], messages: [{ role: "user", content: "Map my work" }] });
  expect(mock.chat.mock.calls[0][0].system).toContain(note.body);
  expect(mock.chat.mock.calls[0][0].system).not.toContain(privateNote.body);
  expect(result.plan?.steps[0].status).toBe("todo");
  const roadmap = saveDocument<Roadmap>("roadmap", { owner: "Owner", profile: "nonprofit", noteIds: [note.id], plan: result.plan! });
  const updated = saveDocument<Roadmap>("roadmap", { owner: roadmap.owner, profile: roadmap.profile, noteIds: roadmap.noteIds, plan: { ...roadmap.plan, steps: roadmap.plan.steps.map(s => ({ ...s, status: "done" })) } }, roadmap);
  expect(listDocuments<Roadmap>("roadmap")[0].plan.steps[0].status).toBe("done");
  expect(listNotes()).toHaveLength(2);
  expect(() => saveDocument<Roadmap>("roadmap", { owner: roadmap.owner, profile: roadmap.profile, noteIds: roadmap.noteIds, plan: roadmap.plan }, roadmap)).toThrow("changed");
  expect(updated.revision).toBe(2);
  updateNote(note.id, note.revision, { ...noteInput(note), body: "Updated report note" });
  expect(() => updateNote(note.id, note.revision, noteInput(note))).toThrow("changed");
});
function noteInput(n: ReturnType<typeof addNote>) { return { author: n.author, title: n.title, body: n.body, profile: n.profile, pageKey: n.pageKey, pageLabel: n.pageLabel, scope: n.scope }; }
it("rejects an invalid AI plan and does not create business records", async () => {
  mock.chat.mockResolvedValue({ ok: true, text: "I already submitted the report." });
  await expect(askRoadmap({ goal: "Report", jobRole: "Owner", profile: "all", notes: [], messages: [{ role: "user", content: "Plan" }] })).rejects.toThrow("invalid plan");
  expect(listDocuments("roadmap")).toHaveLength(0);
});
