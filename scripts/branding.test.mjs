import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

test('Forge package names, application name, and npm workspace lock agree', () => {
  const workspace = json('package.json');
  const desktop = json('apps/desktop/package.json');
  const lock = json('package-lock.json');
  assert.equal(workspace.name, 'forge-desktop-workspace');
  assert.equal(desktop.name, 'forge-desktop');
  assert.equal(desktop.build.productName, 'Forge');
  assert.equal(desktop.version, workspace.version);
  assert.equal(lock.name, workspace.name);
  assert.equal(lock.version, workspace.version);
  assert.equal(lock.packages[''].version, workspace.version);
  assert.equal(lock.packages['apps/desktop'].version, workspace.version);
  assert.equal(lock.packages[''].name, workspace.name);
  assert.equal(lock.packages['apps/desktop'].name, desktop.name);
  assert.equal(lock.packages[`node_modules/${desktop.name}`].resolved, 'apps/desktop');
  assert.equal(desktop.build.appId, 'dev.iamzjt.forgeglasspreview');
  assert.equal(desktop.build.publish, null);
});

test('ordinary localized product copy has no previous product branding', () => {
  const source = path.join(root, 'apps/desktop/src/shared/i18n/locales');
  const allowedLegalNotices = new Set(['settings:updates.previewOrigin', 'uiShell:about.provenance']);
  const visit = (value, location, file) => {
    if (typeof value === 'string') {
      if (!allowedLegalNotices.has(location)) {
        assert.doesNotMatch(value, /\bAperant\b|\bAuto[- ]Claude\b/i, `${file}: ${location}`);
      }
      assert.doesNotMatch(value, /github\.com\/sponsors\/AndyMik90|discord\.gg\/QhRnz9m5HE/i, file);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, `${location}${location.endsWith(':') ? '' : '.'}${key}`, file);
    }
  };
  for (const language of ['en', 'zh-CN', 'fr']) {
    for (const file of readdirSync(path.join(source, language)).filter((file) => file.endsWith('.json'))) {
      visit(JSON.parse(readFileSync(path.join(source, language, file), 'utf8')), `${path.basename(file, '.json')}:`, `${language}/${file}`);
    }
  }
});

test('source and license notices remain in packaged resources', () => {
  const desktop = json('apps/desktop/package.json');
  assert.equal(desktop.license, 'AGPL-3.0');
  for (const notice of ['LICENSE', 'UPSTREAM.md']) {
    assert.ok(desktop.build.extraResources.some((resource) => resource.to === notice), notice);
  }
  assert.match(readFileSync(path.join(root, 'UPSTREAM.md'), 'utf8'), /Aperant/);
  assert.match(readFileSync(path.join(root, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE/);
});

test('the generated Forge logo is the shared source for native and renderer branding', () => {
  const directory = 'apps/desktop/resources/branding';
  const manifest = json(`${directory}/assets.json`);
  for (const [file, asset] of Object.entries(manifest.sourceAssets)) {
    const bytes = readFileSync(path.join(root, directory, file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], asset.size);
    assert.equal(bytes[25], 6, 'Source PNG must include an alpha channel');
  }
  const desktop = json('apps/desktop/package.json');
  assert.equal(desktop.build.mac.icon, 'resources/icon.icns');
  assert.equal(desktop.build.win.icon, 'resources/icon.ico');
  for (const file of ['icon.ico', 'icon.png', 'icon-256.png']) {
    assert.ok(desktop.build.extraResources.some((resource) => resource.to === file), `${file} must survive packaging`);
  }
  const renderer = readFileSync(path.join(root, 'apps/desktop/src/renderer/components/ForgeBrand.tsx'), 'utf8');
  assert.match(renderer, /resources\/branding\/forge-mark\.png/);
  const generator = readFileSync(path.join(root, 'apps/desktop/resources/generate-preview-icon.py'), 'utf8');
  assert.doesNotMatch(generator, /ImageDraw|polygon\(/, 'Conversions must not redraw a divergent logo');
});
