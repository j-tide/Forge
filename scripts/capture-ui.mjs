import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const screenshotDir = resolve('output/playwright');
mkdirSync(screenshotDir, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'forge-ui-capture-'));
function contrastRatio(foreground, background) {
  const luminance = (value) => {
    const [red, green, blue] = value.match(/[\d.]+/g).slice(0, 3).map((channel) => {
      const scaled = Number(channel) / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function checkReadingContrast(page, cardSelector) {
  const colors = await page.locator(cardSelector).first().evaluate((card) => ({
    background: getComputedStyle(card).backgroundColor,
    title: getComputedStyle(card.querySelector('strong')).color,
    detail: getComputedStyle(card.querySelector('p')).color,
  }));
  const title = contrastRatio(colors.title, colors.background);
  const detail = contrastRatio(colors.detail, colors.background);
  assert.ok(title >= 4.5 && detail >= 4.5, `reading contrast: ${JSON.stringify({ ...colors, title, detail })}`);
  return { title, detail };
}
let electronApp;
try {
  electronApp = await electron.launch({
    executablePath: requireDesktop('electron'), args: [desktopDirectory],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
  });
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const health = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(health.ok, true);
  assert.equal(health.data.storage.status, 'ready');
  for (const [width, height] of [[1440, 900], [1600, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
    await page.locator('.compose-pane').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    assert.ok(layout.width <= width, `horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: join(screenshotDir, `p0-07-desktop-${width}x${height}.png`) });
    console.log(JSON.stringify({ stage: 'desktop-ui', width, height, layout,
      readingContrast: await checkReadingContrast(page, '.project-summary'), hostStatus: health.data.status }));
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const compact = await page.evaluate(() => {
    document.body.style.zoom = '125%';
    const compose = document.querySelector('.compose-pane')?.getBoundingClientRect();
    const board = document.querySelector('.board-pane')?.getBoundingClientRect();
    const action = document.querySelector('.compose-action')?.getBoundingClientRect();
    const content = document.querySelector('.shell-content');
    return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      composeVisible: Boolean(compose && compose.left >= 0 && compose.right <= innerWidth),
      boardVisible: Boolean(board && board.left >= 0 && board.right <= innerWidth),
      actionContained: Boolean(compose && action && action.bottom <= compose.bottom),
      contentScrolls: Boolean(content && content.scrollHeight > content.clientHeight),
      devicePixelRatio };
  });
  assert.ok(compact.scrollWidth <= compact.viewportWidth);
  assert.equal(compact.composeVisible, true);
  assert.equal(compact.boardVisible, true);
  assert.equal(compact.actionContained, true);
  assert.equal(compact.contentScrolls, true);
  await page.screenshot({ path: join(screenshotDir, 'p0-07-desktop-1280-css-zoom-125.png') });
  await page.getByRole('button', { name: '选择项目' }).first().scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: '选择项目' }).first().isVisible(), true);
  console.log(JSON.stringify({ stage: 'desktop-compact-css-zoom-125', compact }));
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('界面主题').selectOption('dark');
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'dark');
  await page.locator('.utility-view').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: join(screenshotDir, 'p6-01-desktop-dark-settings-1440x900.png') });
  console.log(JSON.stringify({ stage: 'desktop-dark-contrast',
    readingContrast: await checkReadingContrast(page, '.settings-card') }));
  await page.getByRole('button', { name: '返回工作台' }).click();
  await page.locator('.compose-pane').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: join(screenshotDir, 'p6-01-desktop-dark-home-1440x900.png') });
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '线性配置' }).waitFor();
  await page.getByText('正在读取或校验 Workflow…').waitFor({ state: 'hidden', timeout: 15000 });
  await page.screenshot({ path: join(screenshotDir, 'p6-01-desktop-dark-workflows-1440x900.png') });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('界面主题').selectOption('light');
  await page.getByRole('switch', { name: '减少透明度' }).click();
  await page.getByRole('switch', { name: '减少动效' }).click();
  await page.getByRole('button', { name: '返回工作台' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const preferences = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    const panel = document.querySelector('.compose-pane');
    return { transparency: shell?.getAttribute('data-reduce-transparency'), motion: shell?.getAttribute('data-reduce-motion'), blur: shell ? getComputedStyle(shell).backdropFilter : null, animation: panel ? getComputedStyle(panel).animationDuration : null };
  });
  assert.equal(preferences.transparency, 'true');
  assert.equal(preferences.motion, 'true');
  assert.match(preferences.blur ?? '', /blur\(0px\)|none/);
  await page.screenshot({ path: join(screenshotDir, 'p0-07-desktop-reduced-transparency.png') });
  console.log(JSON.stringify({ stage: 'desktop-accessibility', preferences }));
} finally {
  await electronApp?.close();
  rmSync(dataDir, { recursive: true, force: true });
}
