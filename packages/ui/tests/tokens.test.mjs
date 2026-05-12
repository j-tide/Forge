import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const css = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');
const componentCss = await readFile(new URL('../src/components.css', import.meta.url), 'utf8');
const values = JSON.parse(await readFile(new URL('../src/tokens/values.json', import.meta.url), 'utf8'));
const design = JSON.parse(await readFile(new URL('../../../forge_glass_v1.1/design/tokens.json', import.meta.url), 'utf8'));
const motion = JSON.parse(await readFile(new URL('../../../forge_glass_v1.1/design/motion.json', import.meta.url), 'utf8'));

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

test('reading text and state labels meet 4.5:1 on their opaque surfaces', () => {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [
    ['color-text', 'surface-reading'], ['color-text-secondary', 'surface-reading'],
    ['color-accent-text', 'surface-reading'], ['color-info', 'surface-icon'],
    ['color-neutral-text', 'surface-control'], ['color-success', 'surface-reading'],
    ['color-warning', 'surface-reading'], ['color-danger', 'surface-reading'],
  ]) {
    const a = luminance(values[foreground]);
    const b = luminance(values[background]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});
