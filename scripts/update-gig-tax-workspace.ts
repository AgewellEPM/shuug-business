/** Update only Luke's identified local Tax Firm service, with backup and rollback. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { backupWorkspace } from "../src/lib/workspace/backup";
import { getBranding, saveBranding } from "../src/lib/branding/store";

async function main() {
  assert(process.platform === "darwin", "This updater manages the existing macOS installation.");
  const args = process.argv.slice(2);
  const checkOnly = args.length === 0 || (args.length === 1 && args[0] === "--check");
  assert(checkOnly || (args.length === 5 && args[0] === "--apply" && args[1] === "--expected-source" && args[3] === "--expected-build"),
    "Use --check first, then --apply --expected-source PATH --expected-build BUILD to update the observed installation.");
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
  const targetBuild = readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
  const buildTime = statSync(path.join(root, ".next/BUILD_ID")).mtimeMs;
  const sourceNewer = (directory: string): boolean => readdirSync(directory, { withFileTypes: true }).some(entry => {
    const file = path.join(directory, entry.name);
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return false;
    return entry.isDirectory() ? sourceNewer(file) : entry.isFile() && statSync(file).mtimeMs > buildTime;
  });
  const targetSourceModifiedAfterBuild = sourceNewer(path.join(root, "src")) || ["next.config.ts", "package.json", "package-lock.json"]
    .some(file => statSync(path.join(root, file)).mtimeMs > buildTime);
  if (checkOnly) {
    console.log(JSON.stringify({ ok: true, checkOnly: true, installedSource: previous.source, installedBuild: previous.buildId, targetSource: root,
      targetBuild, targetSourceModifiedAfterBuild, installationChanged: false }, null, 2));
    return;
  }
  assert(!targetSourceModifiedAfterBuild, "Target source changed after compilation. Rebuild and verify it before updating the installed service.");
  assert(args[2] === previous.source && args[4] === previous.buildId, "Another session changed the installed source/build. Inspect the new installation before updating; it was preserved.");
  function unchangedInstallation() {
    assert(readFileSync(marker).equals(previousBytes) && readFileSync(plist, "utf8") === previousPlist,
      "Another session changed the installation definition. Its current service and metadata were preserved.");
  }
  const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const oldRoot = xml(previous.source);
  assert(previousPlist.includes(`<string>${oldRoot}</string>`) && previousPlist.includes(`${oldRoot}/node_modules/next/dist/bin/next`), "Service source does not match its installation receipt.");
  const nextPlist = previousPlist.replaceAll(oldRoot, xml(root));
  process.env.DEALDESK_DATA_DIR = data;
  const brand = getBranding();
  assert(brand.industrySetup?.industryId === "tax-firm" && ["Rideshare Tax Pros", "Gig Tax Pros"].includes(brand.businessName), "Existing workspace identity differs; no configuration was changed.");
  let oldBrand: Buffer | undefined;
  let oldVerification: Buffer | null = null;
  const backup = path.join(homedir(), "Library/Application Support/Shuug Backups/Rideshare Tax Pros", new Date().toISOString().replace(/[:.]/g, "-"));
  const wasRunning = spawnSync("/bin/launchctl", ["print", target], { stdio: "ignore" }).status === 0;
  async function stopOwned() {
    const state = spawnSync("/bin/launchctl", ["print", target], { encoding: "utf8" });
    const pid = Number(state.stdout?.match(/\n\s*pid = (\d+)/)?.[1]);
    if (state.status === 0) {
      execFileSync("/bin/launchctl", ["bootout", target], { stdio: "pipe" });
    }
    for (let attempt = 0; attempt < 300; attempt++) {
      const listening = await new Promise<boolean>((resolve, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port: 3126 });
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("error", (error: NodeJS.ErrnoException) => {
          socket.destroy(); if (error.code === "ECONNREFUSED") resolve(false); else reject(error);
        });
        socket.setTimeout(500, () => { socket.destroy(); reject(new Error("Cannot verify whether the owned service stopped.")); });
      });
      let running = false;
      if (pid) { try { process.kill(pid, 0); running = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") running = true; } }
      if (!listening && !running) return;
      await pause(100);
    }
    throw new Error("Port 3126 is still serving; refusing to replace metadata or back up live data.");
  }
  let changed = false;
  let stage = "checking the current installation";
  try {
    unchangedInstallation();
    stage = "stopping the identified service";
    await stopOwned();
    unchangedInstallation();
    stage = "verifying a complete stopped-data backup";
    const result = backupWorkspace(data, backup);
    oldBrand = readFileSync(path.join(backup, "branding.json"));
    const verification = path.join(backup, "verification.json");
    oldVerification = existsSync(verification) ? readFileSync(verification) : null;
    // Keep rollback metadata outside the sealed data backup and its manifest.
    const metadata = `${backup}-service`; mkdirSync(metadata, { mode: 0o700 });
    writeFileSync(path.join(metadata, "previous-service.plist"), previousPlist, { mode: 0o600 });
    writeFileSync(path.join(metadata, "previous-installation.json"), previousBytes, { mode: 0o600 });
    unchangedInstallation();
    stage = "installing the verified build";
    changed = true;
    writeFileSync(plist, nextPlist, { mode: 0o600 });
    saveBranding({ businessName: "Gig Tax Pros", logoText: "GTP" });
    execFileSync(process.execPath, ["--import", "tsx", "scripts/install-rideshare-workspace.ts"], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    const health = await fetch(`${previous.base}/api/website/customer/driver/health`); assert.equal(health.status, 200); assert.equal((await health.json()).ready, true);
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), base: previous.base, buildId: readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim(), source: root, backupDirectory: backup, backupFiles: result.files, ownerSignInAndStaffRoutesVerified: true, publicHostingVerified: false }, null, 2));
  } catch (error) {
    const failedStage = stage;
    if (changed) {
      const currentMarker = readFileSync(marker), installed = JSON.parse(currentMarker.toString());
      assert(readFileSync(plist, "utf8") === nextPlist && (currentMarker.equals(previousBytes) || (installed.source === root && installed.buildId === targetBuild)),
        "Another session changed the installation during this update. Its current service and metadata were preserved; inspect the live state before retrying.");
      try { await stopOwned(); }
      catch { throw new Error("Update failed, and the new service could not be stopped for rollback. Its current metadata was preserved; inspect the owned service before retrying."); }
      assert(oldBrand, "The stopped workspace backup is required for rollback.");
      writeFileSync(plist, previousPlist, { mode: 0o600 }); writeFileSync(marker, previousBytes, { mode: 0o600 }); writeFileSync(path.join(data, "branding.json"), oldBrand, { mode: 0o600 });
      const verification = path.join(data, "verification.json");
      if (oldVerification) writeFileSync(verification, oldVerification, { mode: 0o600 });
      else if (existsSync(verification)) unlinkSync(verification);
    }
    if (wasRunning && spawnSync("/bin/launchctl", ["print", target], { stdio: "ignore" }).status !== 0) {
      execFileSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid!()}`, plist], { stdio: "pipe" });
    }
    if (wasRunning) {
      let recovered = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch(`${previous.base}/api/auth/login`, { signal: AbortSignal.timeout(500) })).ok) { recovered = true; break; } } catch {}
        await pause(250);
      }
      assert(recovered, `Update failed while ${failedStage}; previous-service readiness was not confirmed. Inspect its current definition and private logs before retrying.`);
    }
    throw error;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local workspace update failed; inspect the owned service."); process.exitCode = 1; });
