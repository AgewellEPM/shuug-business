import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Recover only public check/MCP packages from the existing immutable lockfile.
// npm ci is a separate, explicit command; this script never downloads anything.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const present = file => { try { lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const [action, target] = process.argv.slice(2);
assert(['prepare', 'activate'].includes(action) && target && path.isAbsolute(target), 'Use prepare|activate ABSOLUTE_CACHE_DIR.');
const link = path.join(repo, 'node_modules'), planFile = path.join(target, 'cache-plan.json');
if (action === 'prepare') {
  assert(lstatSync(link).isSymbolicLink(), 'Preserve an existing local dependency directory.'); assert(!existsSync(target), 'Use a new cache directory.');
  const lock = JSON.parse(readFileSync(path.join(repo, 'package-lock.json'))), original = readlinkSync(link), originalRoot = path.resolve(repo, original);
  const roots = ['@modelcontextprotocol/sdk', 'zod', 'tsx', 'typescript', 'jsdom'];
  const selected = new Set(), queue = roots.map(name => 'node_modules/' + name);
  const resolve = (from, name) => {
    let current = from;
    while (current) { const candidate = `${current}/node_modules/${name}`; if (lock.packages[candidate]) return candidate; current = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : ''; }
    return lock.packages['node_modules/' + name] ? 'node_modules/' + name : null;
  };
  while (queue.length) {
    const key = queue.pop(); if (selected.has(key)) continue;
    const item = lock.packages[key]; assert(item, `Locked package missing: ${key}`);
    assert(!/playwright|puppeteer|chromedriver|selenium|chromium/i.test(key), 'Browser runtimes are outside this cache.');
    assert(item.resolved?.startsWith('https://registry.npmjs.org/') && item.integrity, `Only integrity-pinned public npm packages are permitted: ${key}`);
    selected.add(key);
    for (const name of Object.keys({ ...item.dependencies, ...item.optionalDependencies })) { const dependency = resolve(key, name); assert(dependency, `Locked dependency missing: ${name}`); queue.push(dependency); }
  }
  const dependencies = Object.fromEntries(roots.map(name => [name, lock.packages['node_modules/' + name].version]));
  const pkg = { name: 'gigtax-task-checks', version: '1.0.0', private: true, dependencies };
  const packages = { '': { name: pkg.name, version: pkg.version, dependencies }, ...Object.fromEntries([...selected].sort().map(name => [name, lock.packages[name]])) };
  const free = statfsSync(repo); assert(Number(free.bavail) * Number(free.bsize) > 384 * 1024 * 1024, 'Keep at least 384 MiB free before preparing a bounded check cache.');
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(path.join(target, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages }, null, 2) + '\n');
  writeFileSync(planFile, JSON.stringify({ repo, original, originalRoot, selectedPackages: selected.size, roots: dependencies, installed: false }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, publicLockedPackages: selected.size, roots: dependencies }));
} else {
  const plan = JSON.parse(readFileSync(planFile)); assert.equal(plan.repo, repo);
  assert(lstatSync(link).isSymbolicLink() && readlinkSync(link) === plan.original, 'The existing dependency link changed; it was preserved.');
  const lock = JSON.parse(readFileSync(path.join(repo, 'package-lock.json'))), modules = path.join(target, 'node_modules');
  for (const [name, version] of Object.entries(plan.roots)) assert.equal(JSON.parse(readFileSync(path.join(modules, name, 'package.json'))).version, version);
  for (const [key, item] of Object.entries(lock.packages)) {
    if (!key.startsWith('node_modules/')) continue;
    const name = key.slice(13), parts = name.split('/'); if (parts.length !== (name.startsWith('@') ? 2 : 1)) continue;
    const destination = path.join(modules, name);
    if (!present(destination)) { mkdirSync(path.dirname(destination), { recursive: true }); symlinkSync(path.join(plan.originalRoot, name), destination); }
    for (const [command, file] of Object.entries(typeof item.bin === 'string' ? { [name.split('/').at(-1)]: item.bin } : item.bin || {})) {
      const bin = path.join(modules, '.bin', command); if (!present(bin)) { mkdirSync(path.dirname(bin), { recursive: true }); symlinkSync(path.join('..', name, file), bin); }
    }
  }
  if (!present(path.join(modules, '.prisma'))) symlinkSync(path.join(plan.originalRoot, '.prisma'), path.join(modules, '.prisma'));
  symlinkSync(plan.originalRoot, path.join(target, 'original-node_modules-link'));
  const staged = path.join(repo, '.gigtax-node-modules-link'); assert(!existsSync(staged), 'A staging link already exists; preserved.');
  symlinkSync(modules, staged); renameSync(staged, link);
  writeFileSync(planFile, JSON.stringify({ ...plan, installed: true, sharedTreeChanged: false, otherPackages: 'Mirrored to their original locations; versions unchanged.' }, null, 2) + '\n', { mode: 0o600 });
  console.log('This checkout now uses the bounded check cache. The original link and shared dependencies are preserved.');
}
