import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, lstatSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
const root = process.cwd();
const directories = ["src", "prisma", "public", "scripts", "docs", "integrations", ".github"];
const files = ["README.md", "LICENSE", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "eslint.config.mjs", "prisma.config.ts", "vitest.config.mts", "vitest.setup.ts", "Dockerfile.backend", "compose.backend.yaml", ".dockerignore", ".gitignore", ".env.example", ".nvmrc"];
function collect(directory: string): string[] {
  return readdirSync(path.join(root, directory)).flatMap(name => {
    const relative = path.join(directory, name), stat = lstatSync(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Release contains a symlink: ${relative}`);
    if (/^(\.data|\.git|node_modules|\.next|dist)$/.test(name) || /\.(key|pem|sqlite|db|log|tar|gz|zip)$/.test(name) || (name.startsWith(".env") && name !== ".env.example")) throw new Error(`Private or generated file found in source: ${relative}`);
    return stat.isDirectory() ? collect(relative) : stat.isFile() ? [relative] : [];
  });
}
function main() {
  const list = [...files.filter(f => existsSync(path.join(root, f))), ...directories.filter(d => existsSync(path.join(root, d))).flatMap(collect)].sort();
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
