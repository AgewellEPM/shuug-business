import "@testing-library/jest-dom/vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll } from "vitest";
// Every test file uses a private fixture workspace, never the owner's live data.
const fixtureDirectory = mkdtempSync(`${tmpdir()}/shuug-test-workspace-`);
process.env.DEALDESK_DATA_DIR = fixtureDirectory;
process.env.DEMO_DATA = "true";
afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));
