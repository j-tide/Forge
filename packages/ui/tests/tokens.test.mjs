import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const css = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');
const componentCss = await readFile(new URL('../src/components.css', import.meta.url), 'utf8');
const values = JSON.parse(await readFile(new URL('../src/tokens/values.json', import.meta.url), 'utf8'));
const dark = JSON.parse(await readFile(new URL('../src/tokens/dark.json', import.meta.url), 'utf8'));
const design = JSON.parse(await readFile(new URL('./fixtures/tokens.json', import.meta.url), 'utf8'));
const motion = JSON.parse(await readFile(new URL('./fixtures/motion.json', import.meta.url), 'utf8'));

test('formal tokens preserve the selected glass palette and scale', () => {
  for (const [name, value] of Object.entries(values)) {
    assert.ok(css.includes(`--forge-${name}: ${value};`), `missing CSS token ${name}`);
  }
  assert.ok(css.includes(`--forge-color-text: ${design.color.text};`));
  assert.ok(css.includes(`--forge-color-accent: ${design.color.accent};`));
  assert.ok(css.includes(`--forge-color-action: ${design.color.primaryButton};`));
  assert.ok(css.includes(`--forge-radius-panel: ${design.radii.panel}px;`));
  assert.ok(css.includes(`--forge-rail-width: ${design.layout.rail}px;`));
  assert.ok(css.includes(`--forge-motion-page: ${motion.page.ms}ms;`));
});

test('tokens provide solid surfaces and reduced motion fallbacks', () => {
  assert.match(css, /\[data-reduce-transparency='true'\]/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /--forge-surface-reading: #f3f7ff;/);
  assert.match(css, /--forge-motion-page: 0ms;/);
  assert.match(css, /\[data-reduce-motion='true'\]/);
  assert.match(componentCss, /\[data-reduce-transparency='true'\] \.forge-glass.*backdrop-filter: none/);
  assert.match(componentCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('component motion follows the reference timing without continuous surface animation', () => {
  assert.equal(values['motion-hover'], `${motion.cardHover.ms}ms`);
  assert.equal(values['motion-card-lift'], `${motion.cardHover.translateY}px`);
  assert.equal(values['motion-dialog'], `${motion.dialog.ms}ms`);
  assert.equal(values['motion-dialog-offset'], `${motion.dialog.translateY}px`);
  assert.equal(values['motion-dialog-scale'], String(motion.dialog.scaleFrom));
  assert.equal(values['motion-drawer'], `${motion.drawer.ms}ms`);
  assert.equal(values['motion-drawer-offset'], `${motion.drawer.translateX}px`);
  assert.match(componentCss, /\.forge-card--interactive:hover \{ transform: translateY\(var\(--forge-motion-card-lift\)\)/);
  assert.match(componentCss, /\.forge-dialog \{[^\n]*animation: forge-dialog-enter var\(--forge-motion-dialog\)/);
  assert.match(componentCss, /\.forge-drawer \{[^\n]*animation: forge-drawer-enter var\(--forge-motion-drawer\)/);
  assert.doesNotMatch(componentCss, /(?:transition|animation):[^;]*backdrop-filter/);
});

test('user motion and transparency preferences reach teleported overlays', () => {
  assert.match(componentCss, /body:has\(\[data-reduce-motion='true'\]\) \.forge-overlay \.forge-dialog/);
  assert.match(componentCss, /body:has\(\[data-reduce-motion='true'\]\) \.forge-overlay \.forge-drawer/);
  assert.match(componentCss, /body:has\(\[data-reduce-transparency='true'\]\) \.forge-overlay \{ backdrop-filter: none; \}/);
});

test('reading text and state labels meet 4.5:1 on their opaque surfaces', () => {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [
    ['color-text', 'surface-reading'], ['color-text-secondary', 'surface-reading'],
    ['color-text-secondary', 'surface-control'],
    ['color-text-muted', 'surface-control'],
    ['color-eyebrow', 'surface-reading'], ['color-eyebrow', 'surface-control'],
    ['color-placeholder', 'surface-reading'], ['color-placeholder', 'surface-control'],
    ['color-footnote', 'surface-control'], ['color-footer', 'surface-control'],
    ['color-accent-text', 'surface-reading'], ['color-info', 'surface-icon'],
    ['color-neutral-text', 'surface-control'], ['color-success', 'surface-reading'],
    ['color-success', 'surface-control'], ['color-warning', 'surface-reading'],
    ['color-warning', 'surface-control'], ['color-danger', 'surface-reading'],
    ['color-danger', 'surface-control'],
  ]) {
    const a = luminance(values[foreground]);
    const b = luminance(values[background]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});

test('dark tokens have matching names, clear reading contrast and solid fallback', () => {
  for (const [name, value] of Object.entries(dark)) {
    assert.ok(name in values, `dark override has no light token: ${name}`);
    assert.ok(css.includes(`--forge-${name}: ${value};`), `missing dark CSS token ${name}`);
  }
  assert.match(css, /\[data-theme='dark'\] \{\n\s{2}color-scheme: dark;/);
  assert.match(css, /\[data-theme='dark'\]\[data-reduce-transparency='true'\]/);
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [
    ['color-text', 'surface-reading'], ['color-text-secondary', 'surface-reading'],
    ['color-text-secondary', 'surface-control'],
    ['color-eyebrow', 'surface-control'], ['color-placeholder', 'surface-control'],
    ['color-accent-text', 'surface-reading'], ['color-info', 'surface-icon'],
    ['color-neutral-text', 'surface-control'], ['color-success', 'surface-reading'],
    ['color-warning', 'surface-reading'], ['color-danger', 'surface-reading'],
    ['color-on-action', 'color-action'], ['color-on-danger', 'color-danger'],
  ]) {
    const a = luminance(dark[foreground]);
    const b = luminance(dark[background]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
      `dark ${foreground} on ${background}`);
  }
});

test('production Vue and CSS references resolve to formal tokens', async () => {
  const known = new Set(Object.keys(values));
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { await inspect(path); continue; }
      if (!/\.(vue|css)$/.test(entry.name)) continue;
      const source = await readFile(path, 'utf8');
      for (const [, token] of source.matchAll(/var\(--forge-([a-z0-9-]+)/g)) {
        assert.ok(known.has(token), `${path.pathname}: undefined --forge-${token}`);
      }
    }
  }
  await inspect(new URL('../../../apps/web/src/', import.meta.url));
  await inspect(new URL('../src/', import.meta.url));
});
