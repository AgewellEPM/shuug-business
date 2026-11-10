import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";

const directories = ["src", "prisma", "public", "scripts", "docs", "integrations", ".github", "packages", "native", "deployments"];
const rootFiles = ["README.md", "LICENSE", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "eslint.config.mjs", "prisma.config.ts", "vitest.config.mts", "vitest.setup.ts", "Dockerfile.backend", "compose.backend.yaml", ".dockerignore", ".gitignore", ".env.example", ".nvmrc"];
const generated = new Set([".data", ".git", "node_modules", ".next", ".build", ".swiftpm", ".gradle", ".kotlin", ".idea", ".vercel", ".cloudflare", "build", "dist", "coverage", "xcuserdata", ".DS_Store"]);
const localConfiguration = new Set(["local.properties", "host.env"]);

/** Source-only distribution. Known build caches are pruned before following
 * filesystem entries; unknown links and private artifacts fail the release. */
export function sourceReleaseFiles(root: string): string[] {
  function collect(relative: string): string[] {
    const name = path.basename(relative);
    if (generated.has(name) || localConfiguration.has(name)) return [];
    const info = lstatSync(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error(`Release contains an unexpected symlink: ${relative}`);
    if ((name.startsWith(".env") && name !== ".env.example") || /\.(key|pem|p12|pfx|jks|keystore|mobileprovision|sqlite|sqlite3|db|log|tar|gz|zip|apk|ipa|o|dylib|so|class|xcuserstate)$/i.test(name)) {
      throw new Error(`Private or generated file found in source: ${relative}`);
    }
    if (info.isDirectory()) return readdirSync(path.join(root, relative)).flatMap(child => collect(path.join(relative, child)));
    return info.isFile() ? [relative] : [];
  }
  return [...rootFiles, ...directories].filter(name => existsSync(path.join(root, name))).flatMap(collect).sort();
}
