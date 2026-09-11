import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
let directory: string;
const previousDir = process.env.DEALDESK_DATA_DIR;
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/notes-test-`); process.env.DEALDESK_DATA_DIR = directory; });
afterEach(() => { if (previousDir === undefined) delete process.env.DEALDESK_DATA_DIR; else process.env.DEALDESK_DATA_DIR = previousDir; rmSync(directory, { recursive: true, force: true }); });
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { addNote, listNotes, notesForPage, latestNotes } from "./store";

describe("notes store", () => {
  it("adds a note and returns it newest-first", () => {
    const before = listNotes().length;
    const n = addNote({ author: "Mia Alvarez", pageKey: "/operations", pageLabel: "Operations", scope: "page", body: "Low on Zhoug — schedule a batch." });
    expect(n.id).toMatch(/^NOTE-/);
    const all = listNotes();
    expect(all.length).toBe(before + 1);
    expect(all[0].id).toBe(n.id); // newest first
  });

  it("filters notes by page", () => {
    addNote({ author: "Alex Rivera", pageKey: "/customers/joes-market", pageLabel: "Joe's Market", scope: "page", body: "Reorder due." });
    const forJoes = notesForPage("/customers/joes-market");
    expect(forJoes.length).toBeGreaterThan(0);
    expect(forJoes.every((n) => n.pageKey === "/customers/joes-market")).toBe(true);
  });

  it("latestNotes caps the feed", () => {
    for (let i = 0; i < 3; i++) addNote({ author: "Owner", pageKey: "internal", pageLabel: "Internal", scope: "internal", body: `Note ${i}` });
    expect(latestNotes(2)).toHaveLength(2);
  });
});
