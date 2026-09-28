import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output', 'playwright', 'logo');
const profiles = await mkdtemp(path.join(tmpdir(), 'forge-logo-qa-'));
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const report = {
  recordedAt: new Date().toISOString(),
  platform: process.platform,
  architecture: process.arch,
  modelCalls: 0,
  mode: 'built-source-electron',
  build: {},
  cases: [],
};
await mkdir(output, { recursive: true });
for (const file of ['apps/desktop/out/main/index.js', 'apps/desktop/out/renderer/index.html', 'apps/desktop/resources/branding/forge-mark.png', 'apps/desktop/resources/branding/forge-app-icon.png']) {
  report.build[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}

async function launch(theme, onboardingCompleted) {
  const profile = path.join(profiles, `${theme}-${onboardingCompleted ? 'home' : 'onboarding'}`);
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, 'settings.json'), JSON.stringify({
    onboardingCompleted,
    language: 'zh-CN',
    theme,
    colorTheme: 'forge-glass',
    sidebarCollapsed: false,
    sentryEnabled: false,
  }));
  const app = await electron.launch({
    executablePath,
    args: [path.join(root, 'apps/desktop')],
    env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile },
  });
  try {
    await app.firstWindow();
    let page;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      page = app.windows().find((window) => !window.url().startsWith('devtools://'));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(page, 'Forge did not create an application window');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.forge-brand-mark').first().waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await page.title(), 'Forge');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'forge-glass');
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('dark')), theme === 'dark');
    return { app, page };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function inspectMark(locator) {
  await locator.waitFor({ state: 'visible' });
  return locator.evaluate(async (node) => {
    const styles = getComputedStyle(node);
    const mask = styles.maskImage || styles.webkitMaskImage;
    const match = /^url\(["']?(.*?)["']?\)$/.exec(mask);
    if (!match) throw new Error(`Forge mark has no image mask: ${mask}`);
    const image = new Image();
    image.src = match[1];
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to inspect decoded logo');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let visible = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent += 1;
      if (pixels[offset] > 0) visible += 1;
    }
    const rect = node.getBoundingClientRect();
    return {
      mask,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      width: rect.width,
      height: rect.height,
      cssWidth: styles.width,
      cssHeight: styles.height,
      backgroundImage: styles.backgroundImage,
      opacity: styles.opacity,
      transparentPixels: transparent,
      visiblePixels: visible,
    };
  });
}

function assertMark(mark, size) {
  assert.ok(mark.imageWidth > 0 && mark.imageHeight > 0, 'Logo image did not decode');
  assert.equal(mark.cssWidth, `${size}px`, 'Unexpected mark CSS width');
  assert.equal(mark.cssHeight, `${size}px`, 'Unexpected mark CSS height');
  // Chromium's device-pixel geometry can differ by floating point roundoff.
  assert.ok(Math.abs(mark.width - size) < 0.01, 'Unexpected rendered mark width');
  assert.ok(Math.abs(mark.height - size) < 0.01, 'Unexpected rendered mark height');
  assert.ok(mark.transparentPixels > 0 && mark.visiblePixels > 0, 'Logo mask must contain transparency and a visible silhouette');
  assert.notEqual(mark.backgroundImage, 'none', 'Logo has no visible theme color');
  assert.ok(Number(mark.opacity) > 0, 'Logo is invisible');
}

async function inspectTheme(page) {
  return page.evaluate(() => {
    const sample = document.createElement('span');
    document.body.append(sample);
    const colors = {};
    for (const token of ['foreground', 'accent-foreground', 'background']) {
      sample.style.color = `var(--${token})`;
      colors[token] = getComputedStyle(sample).color;
    }
    sample.remove();
    const luminance = (value) => {
      const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
        const linear = channel / 255;
        return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (left, right) => {
      const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    return {
      colors,
      foregroundContrast: contrast(colors.foreground, colors.background),
      accentContrast: contrast(colors['accent-foreground'], colors.background),
    };
  });
}

async function inspectFavicon(page) {
  return page.evaluate(async () => {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) throw new Error('Forge favicon link is missing');
    const image = new Image();
    image.src = link.href;
    await image.decode();
    return { src: link.href, width: image.naturalWidth, height: image.naturalHeight };
  });
}

try {
  for (const theme of ['light', 'dark']) {
    let session = await launch(theme, true);
    try {
      const { page } = session;
      await page.locator('.forge-glass-welcome').waitFor({ timeout: 20000 });
      const state = { theme, case: 'home', viewport: { width: 1440, height: 900 } };
      state.sidebarExpanded = await inspectMark(page.locator('.forge-glass-sidebar-header .forge-brand-mark'));
      assertMark(state.sidebarExpanded, 24);
      state.welcomeBrandCount = await page.locator('.forge-glass-welcome .forge-brand-mark').count();
      assert.equal(state.welcomeBrandCount, 0, 'Welcome must not repeat the sidebar brand as an oversized empty-state logo');
      await page.locator('.forge-glass-welcome').getByRole('heading', { name: '从一个项目开始', exact: true }).waitFor();
      await page.locator('.forge-glass-welcome').getByRole('button', { name: '打开项目', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.locator('.forge-glass-sidebar-header .forge-brand-name').innerText(), 'Forge');
      state.themeColors = await inspectTheme(page);
      assert.ok(state.themeColors.foregroundContrast >= 4.5, 'Brand foreground must remain readable');
      assert.ok(state.themeColors.accentContrast >= 3, 'Brand gradient endpoint must remain visible');
      state.favicon = await inspectFavicon(page);
      assert.ok(state.favicon.width > 0 && state.favicon.height > 0, 'Favicon did not decode');
      await page.screenshot({ path: path.join(output, `home-${theme}-1440.png`), animations: 'disabled' });

      await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
      await page.locator('.forge-glass-sidebar[data-collapsed="true"]').waitFor();
      state.sidebarCollapsed = await inspectMark(page.locator('.forge-glass-sidebar-header .forge-brand-mark'));
      assertMark(state.sidebarCollapsed, 24);
      assert.equal(await page.locator('.forge-glass-sidebar-header').getByRole('img', { name: 'Forge' }).count(), 1);
      assert.equal(await page.locator('.forge-glass-sidebar-header .forge-brand-name').count(), 0);
      await page.screenshot({ path: path.join(output, `home-collapsed-${theme}-1440.png`), animations: 'disabled' });
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
      await page.locator('.forge-glass-sidebar[data-collapsed="false"]').waitFor();
      await page.getByRole('button', { name: '关于 Forge', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      state.about = await inspectMark(dialog.locator('.forge-brand-mark'));
      assertMark(state.about, 28);
      await dialog.getByText(/AGPL-3\.0/).waitFor();
      await page.screenshot({ path: path.join(output, `about-${theme}-1440.png`), animations: 'disabled' });
      report.cases.push(state);
    } finally {
      await session.app.close();
    }

    session = await launch(theme, false);
    try {
      const { page } = session;
      let entry = 'automatic-first-launch';
      // The application's existing account detection can suppress automatic
      // onboarding. Exercise its normal rerun entry rather than faking auth.
      if (!(await page.getByRole('dialog').getByRole('heading', { name: '欢迎使用 Forge', exact: true }).isVisible())) {
        entry = 'settings-rerun';
        await page.getByRole('button', { name: '设置', exact: true }).click();
        await page.getByRole('button', { name: /重新运行向导/ }).click();
      }
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: '欢迎使用 Forge', exact: true }).waitFor();
      const marks = dialog.locator('.forge-brand-mark');
      assert.equal(await marks.count(), 2, 'Onboarding must display header and welcome marks');
      const header = await inspectMark(marks.nth(0));
      const welcome = await inspectMark(marks.nth(1));
      assertMark(header, 24);
      assertMark(welcome, 48);
      await page.screenshot({ path: path.join(output, `onboarding-${theme}-1440.png`), animations: 'disabled' });
      report.cases.push({ theme, case: 'onboarding', entry, header, welcome });
    } finally {
      await session.app.close();
    }
    console.log(`${theme}: real Electron logo, favicon, collapsed sidebar, About and onboarding passed`);
  }
  report.valid = true;
} catch (error) {
  report.valid = false;
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`Actual Electron logo screenshots and evidence: ${output}`);
