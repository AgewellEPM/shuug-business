import { describe, it, expect, afterEach, vi } from "vitest";
import { mapMemberToWorker, previewAdpSync } from "./adp";
import type { TeamMember } from "../team/store";

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  id: "riley-fox", name: "Riley Fox", role: "Sales", email: "riley@shuug.co", initials: "RF", online: true, ...over,
});

afterEach(() => vi.unstubAllEnvs());

describe("mapMemberToWorker", () => {
  it("splits name into given/family and marks status from online", () => {
    const w = mapMemberToWorker(member());
    expect(w.person.legalName.givenName).toBe("Riley");
    expect(w.person.legalName.familyName).toBe("Fox");
    expect(w.workerStatus.statusCode.codeValue).toBe("Active");
    expect(w.person.communication.emails[0].emailUri).toBe("riley@shuug.co");
    expect(w.customFields.role).toBe("Sales");
  });
  it("handles single-word names and offline members and missing email", () => {
    const w = mapMemberToWorker(member({ name: "Cher", online: false, email: "" }));
    expect(w.person.legalName.givenName).toBe("Cher");
    expect(w.person.legalName.familyName).toBe("");
    expect(w.workerStatus.statusCode.codeValue).toBe("Inactive");
    expect(w.person.communication.emails).toEqual([]);
  });
});

describe("previewAdpSync (fail-closed)", () => {
  it("is not ready and pushes nothing live without ADP credentials", () => {
    const p = previewAdpSync([member(), member({ id: "owner", name: "You (Owner)" })]);
    expect(p.ready).toBe(false);
    expect(p.detail).toMatch(/Connect ADP/i);
    expect(p.workers).toHaveLength(1); // owner excluded from payroll sync
  });

  it("is ready when fully configured", () => {
    vi.stubEnv("ADP_CLIENT_ID", "id");
    vi.stubEnv("ADP_CLIENT_SECRET", "secret");
    vi.stubEnv("ADP_CERT_PEM", "-----BEGIN CERT-----");
    vi.stubEnv("ADP_KEY_PEM", "-----BEGIN KEY-----");
    const p = previewAdpSync([member()]);
    expect(p.ready).toBe(true);
    expect(p.detail).toMatch(/ready to sync/i);
  });
});
