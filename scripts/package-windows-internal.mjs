/** Windows x64 staging probe. Produces an explicitly unsigned internal ZIP, not an installer. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'build', 'windows');
const stage = join(output, 'stage');
const version = JSON.parse(await readFile(join(root, 'apps', 'desktop', 'package.json'), 'utf8')).version;
const appName = `Forge-${version}-INTERNAL-UNSIGNED-win32-x64`;
const application = join(stage, appName);
const resources = join(application, 'resources');
const pythonRoot = join(resources, 'forge-python');
const runtime = join(pythonRoot, 'runtime');
const python = join(runtime, 'python.exe');
const zip = join(output, `${appName}.zip`);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${executable} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return result.stdout.trim();
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Windows internal packaging must run on Windows x64; cross-compilation is unverified');
}
const pnpmCli = process.env.npm_execpath;
assert.ok(pnpmCli, 'Run this script via pnpm package:windows:internal');
const pnpm = (...args) => run(process.execPath, [pnpmCli, ...args]);
const pinnedPython = (await readFile(join(root, 'python', '.python-version'), 'utf8')).trim();
assert.match(pinnedPython, /^3\.12\.\d+$/);
const managedPython = run('uv', ['python', 'find', pinnedPython, '--managed-python',
  '--no-python-downloads']);
assert.equal(managedPython.toLowerCase().endsWith('python.exe'), true);
const electronDist = join(root, 'node_modules', '.pnpm', 'electron@44.4.3',
  'node_modules', 'electron', 'dist');

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(electronDist, application, { recursive: true, dereference: true });
await rename(join(application, 'electron.exe'), join(application, 'Forge.exe'));
const deployedApp = join(stage, 'app-source');
pnpm('--filter', '@forge/desktop', 'deploy', '--prod', '--offline',
  '--frozen-lockfile', '--node-linker=hoisted', deployedApp);
await mkdir(resources, { recursive: true });
run(process.execPath, [join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.mjs'),
  'pack', deployedApp, join(resources, 'app.asar')]);
await cp(join(root, 'apps', 'web', 'dist'), join(resources, 'web', 'dist'),
  { recursive: true });
await mkdir(pythonRoot, { recursive: true });
await cp(dirname(managedPython), runtime, { recursive: true, dereference: true });

const wheelDir = join(stage, 'wheel');
const requirements = join(stage, 'requirements.txt');
run('uv', ['build', '--wheel', '--offline', '--out-dir', wheelDir, join(root, 'python')]);
run('uv', ['export', '--directory', join(root, 'python'), '--locked', '--no-dev',
  '--no-emit-project', '--format', 'requirements.txt', '--output-file', requirements]);
run('uv', ['pip', 'install', '--target', join(pythonRoot, 'packages'), '--python', python,
  '-r', requirements, join(wheelDir, `forge_core-${version}-py3-none-any.whl`)]);
const probe = run(python, ['-c', 'import forge.host, sqlite3; '
  + 'print(forge.host.__version__, sqlite3.sqlite_version)'], {
  env: { ...process.env, PYTHONHOME: runtime, PYTHONPATH: join(pythonRoot, 'packages') },
});
assert.ok(probe.startsWith(`${version} `), `Bundled Python Host version mismatch: ${probe}`);
await writeFile(join(resources, 'FORGE_INTERNAL_TEST_BUILD'),
  'Unsigned Windows QA artifact; no public install or signing claim.\n');
await writeFile(join(application, 'READ-ME-FIRST.txt'),
  `Forge ${version} INTERNAL UNSIGNED Windows x64 QA build.\r\n`
  + 'This ZIP is not a signed installer. Do not publish or bypass Windows protections.\r\n'
  + 'Forge user data is stored separately under the user profile.\r\n'
  + 'Git and an authenticated Codex CLI are external prerequisites for coding.\r\n');
await rm(zip, { force: true });
run('tar.exe', ['-a', '-c', '-f', zip, '-C', stage, appName]);
const sha256 = createHash('sha256');
for await (const chunk of createReadStream(zip)) sha256.update(chunk);
await rm(stage, { recursive: true, force: true });
console.log(JSON.stringify({ kind: 'internal-unsigned-windows-zip', zip,
  sha256: sha256.digest('hex'), pythonVersion: pinnedPython, hostProbe: probe,
  installer: false, signed: false, testedOnWindows: false }));
