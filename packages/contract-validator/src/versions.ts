import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationContext, items, record, string } from './shared.js';

export function validateVersions(context: ValidationContext): void {
  const root = record(context.json('package.json'));
  const versions = record(context.json('versions.lock.json'));
  const inventory = record(context.json('docs/dependency-licenses.json'));
  if (!root || !versions || !inventory) return;
  if (root.version !== versions.releaseVersion) context.issue('FGV-VERSION-001', 'versions.lock.json', 'releaseVersion', 'Release version does not match root package.json');
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(string(root.packageManager))) context.issue('FGV-VERSION-002', 'package.json', 'packageManager', 'Package manager version must be pinned exactly');
  const licenses = new Set(items(inventory.packages).map((entry) => {
    const value = record(entry);
    return `${string(value?.name)}@${string(value?.version)}:${string(value?.license)}`;
  }));
  const application = record(versions.applicationDependencies) ?? {};
  const paths = ['package.json'];
  for (const directory of ['apps', 'packages', 'plugins']) {
    try {
      for (const name of readdirSync(join(context.repoRoot, directory))) {
        const path = `${directory}/${name}/package.json`;
        try { if (readdirSync(join(context.repoRoot, directory, name)).includes('package.json')) paths.push(path); }
        catch { /* Non-package entries are ignored. */ }
      }
    } catch { /* A workspace group can be empty. */ }
  }
  for (const path of paths) {
    const manifest = record(path === 'package.json' ? root : context.json(path));
    if (!manifest) continue;
    const recorded = record(path === 'package.json' ? versions.lockedToolVersions : application[path.replace(/\/package\.json$/, '')]) ?? {};
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, value] of Object.entries(record(manifest[field]) ?? {})) {
        const version = string(value);
        const entry = record(recorded[name]);
        if (name.startsWith('@forge/')) {
          if (version !== 'workspace:*') context.issue('FGV-VERSION-003', path, `${field}.${name}`, 'Internal package must use workspace:*');
          continue;
        }
        if (!/^\d+\.\d+\.\d+$/.test(version)) context.issue('FGV-VERSION-004', path, `${field}.${name}`, `Direct dependency "${name}" must use an exact version`);
        if (entry?.version !== version) context.issue('FGV-VERSION-005', 'versions.lock.json', `${path}.${name}`, `Recorded version for "${name}" differs from ${path}`);
        if (!licenses.has(`${name}@${version}:${string(entry?.license)}`)) context.issue('FGV-VERSION-006', 'docs/dependency-licenses.json', `${name}@${version}`, `License inventory is missing "${name}@${version}" with its recorded license`);
      }
    }
  }
}
