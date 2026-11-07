/** Update only Luke's identified local Tax Firm service, with backup and rollback. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { backupWorkspace } from "../src/lib/workspace/backup";
import { getBranding, saveBranding } from "../src/lib/branding/store";

async function main() {
  assert(process.platform === "darwin", "This updater manages the existing macOS installation.");
  const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const data = path.join(homedir(), "Library/Application Support/Shuug/Rideshare Tax Pros");
  const marker = path.join(data, "installation.json"), plist = path.join(homedir(), "Library/LaunchAgents/com.shuug.rideshare-tax-pros.plist");
  assert(existsSync(marker) && existsSync(plist), "Install the local workspace before updating it.");
  assert(existsSync(path.join(root, ".next/BUILD_ID")), "Build the new source first.");
  const previousBytes = readFileSync(marker), previous = JSON.parse(previousBytes.toString());
  const previousPlist = readFileSync(plist, "utf8");
  const label = "com.shuug.rideshare-tax-pros", target = `gui/${process.getuid!()}/${label}`;
  assert(previous.base === "http://127.0.0.1:3126" && previous.service === label && previous.dataDirectory === data, "Installed service identity differs; it was preserved.");
  assert(createHash("sha256").update(previousPlist).digest("hex") === previous.plistSha256, "Service definition changed since installation; review it first.");
  assert(typeof previous.source === "string" && existsSync(path.join(previous.source, ".next/BUILD_ID")), "Previous build is unavailable for rollback.");
  assert(readFileSync(path.join(previous.source, ".next/BUILD_ID"), "utf8").trim() === previous.buildId, "Previous source build changed; resolve it before updating.");
  const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const oldRoot = xml(previous.source);
  assert(previousPlist.includes(`<string>${oldRoot}</string>`) && previousPlist.includes(`${oldRoot}/node_modules/next/dist/bin/next`), "Service source does not match its installation receipt.");
  const nextPlist = previousPlist.replaceAll(oldRoot, xml(root));
  process.env.DEALDESK_DATA_DIR = data;
  const brand = getBranding();
  assert(brand.industrySetup?.industryId === "tax-firm" && ["Rideshare Tax Pros", "Gig Tax Pros"].includes(brand.businessName), "Existing workspace identity differs; no configuration was changed.");
  const oldBrand = readFileSync(path.join(data, "branding.json"));
  const backup = path.join(homedir(), "Library/Application Support/Shuug Backups/Rideshare Tax Pros", new Date().toISOString().replace(/[:.]/g, "-"));
  const wasRunning = spawnSync("/bin/launchctl", ["print", target], { stdio: "ignore" }).status === 0;
  let changed = false;
  try {
    if (wasRunning) execFileSync("/bin/launchctl", ["bootout", target], { stdio: "pipe" });
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(previous.base, { signal: AbortSignal.timeout(200) }); } catch { break; }
      await pause(100);
    }
    let stillRunning = false;
    try { await fetch(previous.base, { signal: AbortSignal.timeout(300) }); stillRunning = true; } catch {}
    assert(!stillRunning, "Port 3126 is still serving; refusing to replace or back up live data.");
    const result = backupWorkspace(data, backup);
    // Keep rollback metadata outside the sealed data backup and its manifest.
    const metadata = `${backup}-service`; mkdirSync(metadata, { mode: 0o700 });
    writeFileSync(path.join(metadata, "previous-service.plist"), previousPlist, { mode: 0o600 });
    writeFileSync(path.join(metadata, "previous-installation.json"), previousBytes, { mode: 0o600 });
    changed = true;
    writeFileSync(plist, nextPlist, { mode: 0o600 });
    saveBranding({ businessName: "Gig Tax Pros", logoText: "GTP" });
    execFileSync(process.execPath, ["--import", "tsx", "scripts/install-rideshare-workspace.ts"], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    const health = await fetch(`${previous.base}/api/website/customer/driver/health`); assert.equal(health.status, 200); assert.equal((await health.json()).ready, true);
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), base: previous.base, buildId: readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim(), source: root, backupDirectory: backup, backupFiles: result.files, ownerSignInAndStaffRoutesVerified: true, publicHostingVerified: false }, null, 2));
  } catch (error) {
    if (changed) {
      spawnSync("/bin/launchctl", ["bootout", target], { stdio: "ignore" });
      writeFileSync(plist, previousPlist, { mode: 0o600 }); writeFileSync(marker, previousBytes, { mode: 0o600 }); writeFileSync(path.join(data, "branding.json"), oldBrand, { mode: 0o600 });
    }
    if (wasRunning && spawnSync("/bin/launchctl", ["print", target], { stdio: "ignore" }).status !== 0) {
      execFileSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid!()}`, plist], { stdio: "pipe" });
    }
    throw error;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local workspace update failed; inspect the owned service."); process.exitCode = 1; });
