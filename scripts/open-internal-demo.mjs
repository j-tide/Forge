/** Prepare and open the exact validated internal DMG as a persistent human demo. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const demoRoot = join(homedir(), 'Documents', 'Forge Demo');
const appData = join(demoRoot, 'app-data');
const source = join(demoRoot, 'project');
const app = join(homedir(), 'Applications', 'Forge INTERNAL.app');
const executable = join(app, 'Contents', 'MacOS', 'Forge');
const dmg = join(root, 'build', 'macos',
  'Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg');
const expectedSha256 = 'a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9';
const receipt = join(demoRoot, 'installed-dmg-sha256.txt');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sha256(path) {
  return run('shasum', ['-a', '256', path]).split(' ')[0];
}

function prepareFixture() {
  mkdirSync(demoRoot, { recursive: true, mode: 0o700 });
  mkdirSync(appData, { recursive: true, mode: 0o700 });
  if (existsSync(source)) {
    if (!existsSync(join(source, '.git'))) throw new Error('Demo project path already exists without Git; refusing to overwrite it');
    return;
  }
  mkdirSync(source);
  run('git', ['init', '-b', 'main', source]);
  run('git', ['-C', source, 'config', 'user.name', 'Forge Demo']);
  run('git', ['-C', source, 'config', 'user.email', 'forge-demo@example.invalid']);
  writeFileSync(join(source, 'package.json'),
    '{"name":"forge-demo-project","private":true,"type":"module","scripts":{"test":"node test.js"}}\n');
  writeFileSync(join(source, 'math.js'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(source, 'test.js'),
    "import assert from 'node:assert/strict';\nimport { add } from './math.js';\nassert.equal(add(1, 2), 3);\nconsole.log('Demo tests passed');\n");
  mkdirSync(join(source, 'docs'));
  writeFileSync(join(source, 'docs', 'add-contract.md'),
    '# Add contract\nOnly finite JavaScript numbers are valid inputs. Reject NaN, Infinity and non-numbers with TypeError. Do not silently coerce strings.\n');
  run('git', ['-C', source, 'add', '.']);
  run('git', ['-C', source, 'commit', '-m', 'Initial disposable demo']);
}

function prepareApp() {
  if (!existsSync(dmg) || sha256(dmg) !== expectedSha256) {
    throw new Error('The validated internal DMG is missing or its SHA-256 differs; refusing to substitute a build');
  }
  if (existsSync(app)) {
    if (!existsSync(receipt) || readFileSync(receipt, 'utf8').trim() !== expectedSha256) {
      throw new Error('An app already exists at the demo install path without the matching receipt; refusing to overwrite it');
    }
    run('codesign', ['--verify', '--deep', '--strict', app]);
    return;
  }
  mkdirSync(dirname(app), { recursive: true });
  const mount = join(demoRoot, '.mounted-dmg');
  const stage = mkdtempSync(join(dirname(app), '.forge-demo-install-'));
  let mounted = false;
  try {
    mkdirSync(mount);
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
    mounted = true;
    run('ditto', [join(mount, 'Forge INTERNAL.app'), join(stage, 'Forge INTERNAL.app')]);
    run('codesign', ['--verify', '--deep', '--strict', join(stage, 'Forge INTERNAL.app')]);
    run('hdiutil', ['detach', mount]);
    mounted = false;
    renameSync(join(stage, 'Forge INTERNAL.app'), app);
    writeFileSync(receipt, `${expectedSha256}\n`, { mode: 0o600 });
  } finally {
    if (mounted) run('hdiutil', ['detach', mount]);
    rmSync(mount, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
}

function prepareShortcut() {
  const shortcut = join(demoRoot, 'Open Forge Demo.command');
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const content = `#!/bin/zsh
set -e
app=${quote(app)}
data=${quote(appData)}
if [[ ! -x "$app/Contents/MacOS/Forge" || ! -f "$app/Contents/Resources/FORGE_INTERNAL_TEST_BUILD" ]]; then
  echo 'The validated Forge INTERNAL app is missing.' >&2
  exit 1
fi
/usr/bin/codesign --verify --deep --strict "$app"
FORGE_INTERNAL_TEST_HOME="$data" FORGE_DEV_SERVER_URL='' /usr/bin/nohup "$app/Contents/MacOS/Forge" </dev/null >/dev/null 2>&1 &
disown
`;
  if (existsSync(shortcut)) {
    const current = readFileSync(shortcut, 'utf8');
    if (current === content) return;
    // Never replace a hand-edited shortcut. Only upgrade our previous one-line generator.
    if (!/^#!\/bin\/zsh\nexec '.*open-internal-demo\.mjs' --open\n$/.test(current)) return;
  }
  writeFileSync(shortcut, content, { mode: 0o700 });
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The validated internal Demo artifact is macOS arm64 only');
}
prepareFixture();
prepareApp();
prepareShortcut();
const summary = { app, dmg, sha256: expectedSha256, demoRoot, source,
  database: join(appData, 'Forge', 'production', 'forge.sqlite'),
  shortcut: join(demoRoot, 'Open Forge Demo.command'),
  codexCli: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout?.trim() || 'unavailable',
  git: run('git', ['--version']) };
if (process.argv.includes('--open')) {
  const child = spawn(executable, [], { detached: true, stdio: 'ignore',
    env: { ...process.env, FORGE_INTERNAL_TEST_HOME: appData, FORGE_DEV_SERVER_URL: '' } });
  child.unref();
  await delay(3500);
  try { process.kill(child.pid, 0); }
  catch { throw new Error('The installed app exited during startup; the Demo was left intact for diagnosis'); }
  summary.appPid = child.pid;
}
console.log(JSON.stringify(summary, null, 2));
