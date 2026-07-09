/** Internal macOS artifact only. This script never uses a distribution identity or notarization. */
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'build', 'macos');
const stage = join(output, 'stage');
const suffixArg = process.argv.find((arg) => arg.startsWith('--artifact-suffix='));
const artifactSuffix = suffixArg ? suffixArg.slice('--artifact-suffix='.length) : '';
if (artifactSuffix && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactSuffix)) {
  throw new Error('Artifact suffix must be a lowercase local build identifier');
}
const suffix = artifactSuffix ? `-${artifactSuffix}` : '';
const appName = `Forge-INTERNAL-ADHOC-UNNOTARIZED-darwin-${process.arch}${suffix}.app`;
const appPath = join(output, appName);
const contents = join(stage, appName, 'Contents');
const resources = join(contents, 'Resources');
const bundledPython = join(resources, 'forge-python');
const deployedApp = join(stage, 'app-source');
const electronPackage = join(root, 'node_modules', '.pnpm', 'electron@44.4.3',
  'node_modules', 'electron', 'dist', 'Electron.app');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Internal macOS packaging has only been implemented and tested on darwin-arm64');
}
const appVersion = JSON.parse(await readFile(join(root, 'apps', 'desktop', 'package.json'), 'utf8')).version;
const pythonVersion = (await readFile(join(root, 'python', '.python-version'), 'utf8')).trim();
if (!/^3\.12\.\d+$/.test(pythonVersion)) throw new Error('Expected a pinned CPython 3.12 patch version');
const managedPython = run('uv', ['python', 'find', pythonVersion, '--managed-python',
  '--no-python-downloads']);
const managedRoot = resolve(managedPython, '..', '..');

// Package the current sources, never a stale desktop/web dist from an earlier smoke.
run('pnpm', ['build']);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
run('ditto', [electronPackage, join(stage, appName)]);
await mkdir(resources, { recursive: true });
run('pnpm', ['--filter', '@forge/desktop', 'deploy', '--prod', '--offline',
  '--frozen-lockfile', '--node-linker=hoisted', deployedApp]);
run(join(root, 'node_modules', '.bin', 'asar'), ['pack', deployedApp,
  join(resources, 'app.asar')]);
await mkdir(join(resources, 'web'), { recursive: true });
await cp(join(root, 'apps', 'web', 'dist'), join(resources, 'web', 'dist'), { recursive: true });
await mkdir(bundledPython, { recursive: true });
run('ditto', [managedRoot, join(bundledPython, 'runtime')]);

const wheelDir = join(stage, 'wheel');
const requirements = join(stage, 'requirements.txt');
run('uv', ['build', '--wheel', '--offline', '--out-dir', wheelDir, join(root, 'python')]);
run('uv', ['export', '--directory', join(root, 'python'), '--locked', '--no-dev',
  '--no-emit-project', '--format', 'requirements.txt', '--output-file', requirements]);
run('uv', ['pip', 'install', '--target', join(bundledPython, 'packages'),
  '--python', join(bundledPython, 'runtime', 'bin', 'python3.12'),
  '-r', requirements, join(wheelDir, `forge_core-${appVersion}-py3-none-any.whl`)]);

const pythonHome = join(bundledPython, 'runtime');
const pythonPath = join(bundledPython, 'packages');
const probe = run(join(pythonHome, 'bin', 'python3.12'),
  ['-c', 'import forge.host, sqlite3; print(forge.host.__version__, sqlite3.sqlite_version)'],
  { env: { ...process.env, PYTHONHOME: pythonHome, PYTHONPATH: pythonPath } });
if (!probe.startsWith(`${appVersion} `)) throw new Error(`Bundled Host version mismatch: ${probe}`);
await writeFile(join(resources, 'FORGE_INTERNAL_TEST_BUILD'),
  'Internal local QA artifact; never use this marker in a public release.\n');

const plist = join(contents, 'Info.plist');
await rename(join(contents, 'MacOS', 'Electron'), join(contents, 'MacOS', 'Forge'));
for (const [key, value] of [
  ['CFBundleExecutable', 'Forge'],
  ['CFBundleIdentifier', 'dev.forge.desktop'],
  ['CFBundleName', 'Forge'],
  ['CFBundleDisplayName', 'Forge INTERNAL'],
  ['CFBundleShortVersionString', appVersion],
  ['CFBundleVersion', appVersion],
]) {
  const existing = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist],
    { stdio: 'ignore' });
  run('/usr/libexec/PlistBuddy', ['-c', existing.status === 0
    ? `Set :${key} ${value}` : `Add :${key} string ${value}`, plist]);
}
// Ad-hoc signing makes the modified local bundle launchable on Apple Silicon.
// It is not a Developer ID signature and does not pass Gatekeeper distribution checks.
run('codesign', ['--force', '--deep', '--sign', '-', join(stage, appName)]);
run('codesign', ['--verify', '--deep', '--strict', join(stage, appName)]);
await rm(appPath, { recursive: true, force: true });
await rename(join(stage, appName), appPath);

const notice = `Forge ${appVersion} — INTERNAL TEST BUILD\n\n`
  + 'Ad-hoc signed, not notarized. This is not a public macOS release.\n'
  + 'Only use in an isolated test user profile. macOS may block opening it through Gatekeeper.\n'
  + 'Removing Forge.app does not remove Forge user data under Application Support/Forge.\n'
  + 'No upgrade, rollback or credential migration claim is made by this artifact.\n';
const dmgRoot = join(stage, 'dmg-root');
await mkdir(dmgRoot, { recursive: true });
run('ditto', [appPath, join(dmgRoot, 'Forge INTERNAL.app')]);
await writeFile(join(dmgRoot, 'READ-ME-FIRST.txt'), notice);
const dmg = join(output, `Forge-${appVersion}-INTERNAL-ADHOC-UNNOTARIZED-darwin-${process.arch}${suffix}.dmg`);
await rm(dmg, { force: true });
run('hdiutil', ['create', '-volname', 'Forge INTERNAL', '-srcfolder', dmgRoot,
  '-ov', '-format', 'UDZO', dmg]);
run('hdiutil', ['verify', dmg]);
await rm(stage, { recursive: true, force: true });
console.log(JSON.stringify({ kind: 'internal-ad-hoc-unnotarized', appPath, dmg,
  pythonVersion, hostProbe: probe }));
