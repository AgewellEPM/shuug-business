// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sourceReleaseFiles } from "./source-files";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "shuug-source-test-")); roots.push(root);
  const put = (file: string) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, "synthetic source only"); };
  return { root, put };
}
it("includes trusted-client, offhost, native and deployment sources without their caches or local configuration", () => {
  const { root, put } = fixture();
  const kept = ["src/app/page.tsx", "packages/secure-tax-client/envelope.mjs", "packages/secure-tax-client/cloud/aws/worker.mjs", "native/ios/DriverCore/Package.swift", "native/android/gradle/wrapper/gradle-wrapper.jar", "deployments/free-host/compose.yaml", "deployments/free-host/host.env.example"];
  for (const file of [...kept, "packages/client/node_modules/private.key", "native/ios/.build/private.db", "native/android/build/cache.apk", "native/android/local.properties", "deployments/free-host/host.env", "deployments/.vercel/output/private.env"]) put(file);
  expect(sourceReleaseFiles(root)).toEqual([...kept].sort());
});
it("does not follow cache symlinks but refuses unexpected source links and signing/private artifacts", () => {
  const { root, put } = fixture(); put("packages/client/package.json");
  symlinkSync("/does-not-exist", path.join(root, "packages/client/node_modules"));
  expect(sourceReleaseFiles(root)).toEqual(["packages/client/package.json"]);
  symlinkSync("/does-not-exist", path.join(root, "packages/client/unexpected"));
  expect(() => sourceReleaseFiles(root)).toThrow(/unexpected symlink/);
  rmSync(path.join(root, "packages/client/unexpected")); put("native/android/signing.keystore");
  expect(() => sourceReleaseFiles(root)).toThrow(/Private or generated/);
});
