import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, lstatSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
const root = path.resolve("integrations/wordpress"), plugin = "shuug-business";
function collect(directory: string): string[] {
  return readdirSync(path.join(root, directory)).flatMap(name => {
    const relative = path.join(directory, name), stat = lstatSync(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Plugin symlink is not allowed: ${relative}`);
    if (stat.isDirectory()) return collect(relative);
    if (!stat.isFile() || !(/\.(php|js|css|txt|md)$/.test(name) || name === "LICENSE")) throw new Error(`Unexpected plugin file: ${relative}`);
    if (name.startsWith(".") || /\.(key|pem|log|sqlite|db)$/.test(name)) throw new Error(`Private file is not allowed: ${relative}`);
    return [relative];
  });
}
const files = collect(plugin).sort();
for (const file of files.filter(f => f.endsWith(".php"))) execFileSync("php", ["-l", path.join(root, file)], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", path.join(root, plugin, "assets/workspace.js")], { stdio: "pipe" });
const header = readFileSync(path.join(root, plugin, "shuug-business.php"), "utf8"), version = header.match(/Version:\s*(\d+\.\d+\.\d+)/)?.[1];
if (!version) throw new Error("Plugin version header is missing.");
mkdirSync("dist", { recursive: true });
const output = path.resolve(`dist/shuug-business-wordpress-${version}.zip`);
rmSync(output, { force: true });
// -X excludes platform-specific metadata; explicit files preserve the required
// single top-level plugin directory and exclude backend data/build output.
execFileSync("zip", ["-q", "-X", output, ...files], { cwd: root, stdio: "pipe" });
const sha256 = createHash("sha256").update(readFileSync(output)).digest("hex");
writeFileSync(output + ".sha256", `${sha256}  ${path.basename(output)}\n`);
writeFileSync("dist/wordpress-manifest.json", JSON.stringify({ version, sha256, files }, null, 2));
console.log(JSON.stringify({ output, files: files.length, sha256, backendRequired: true }));
