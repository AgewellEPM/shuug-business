import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { sourceReleaseFiles } from "../src/lib/release/source-files";
const root = process.cwd();
function main() {
  const list = sourceReleaseFiles(root);
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const output = path.join(root, "dist", `shuug-business-${version}-source.tar.gz`);
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = mkdtempSync(path.join(tmpdir(), "shuug-release-"));
  try {
    const names = path.join(temporary, "files"); writeFileSync(names, list.join("\0") + "\0", { mode: 0o600 });
    execFileSync("tar", ["-czf", output, "--null", "-T", names], { cwd: root, stdio: "pipe" });
    const sha256 = createHash("sha256").update(readFileSync(output)).digest("hex");
    writeFileSync(output + ".sha256", `${sha256}  ${path.basename(output)}\n`);
    writeFileSync(path.join(root, "dist", "source-manifest.json"), JSON.stringify({ version, sha256, files: list }, null, 2));
    console.log(JSON.stringify({ output, files: list.length, sha256, privateDataIncluded: false }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
try { main(); } catch (e) { console.error(e instanceof Error ? e.message : "Release packaging failed"); process.exitCode = 1; }
