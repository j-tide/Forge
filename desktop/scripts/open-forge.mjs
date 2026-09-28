import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'apps', 'desktop');
const metadata = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));

if (process.platform !== 'darwin') {
  throw new Error('Use the packaged launch command for your platform. This command opens a macOS application.');
}

const architecture = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const candidates = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
      path.join(desktop, 'dist', metadata.version, architecture, `${metadata.build.productName}.app`),
      path.join(desktop, 'dist', 'ui-redesign-unreleased', architecture, `${metadata.build.productName}.app`),
      path.join(desktop, 'dist', 'settings-unreleased', architecture, `${metadata.build.productName}.app`),
      path.join(desktop, 'dist', 'logo-unreleased', architecture, `${metadata.build.productName}.app`),
      path.join(desktop, 'dist', 'branding-unreleased', architecture, `${metadata.build.productName}.app`),
      path.join(desktop, 'dist', architecture, `${metadata.build.productName}.app`)
    ];
const bundle = candidates.find((candidate) => existsSync(path.join(candidate, 'Contents', 'Info.plist')));
if (!bundle) {
  throw new Error('Forge.app is not built. Run npm run build and package the macOS application, or pass an explicit .app path.');
}
const result = spawnSync('open', [bundle], { stdio: 'inherit', shell: false });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Opened ${bundle}`);
