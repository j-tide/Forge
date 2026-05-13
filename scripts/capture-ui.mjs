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
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    assert.ok(layout.width <= width, `horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: join(screenshotDir, `p0-07-desktop-${width}x${height}.png`) });
    console.log(JSON.stringify({ stage: 'desktop-ui', width, height, layout, hostStatus: health.data.status }));
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
  await page.getByRole('button', { name: 'Agent runtime 尚未启用' }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: 'Agent runtime 尚未启用' }).isVisible(), true);
  console.log(JSON.stringify({ stage: 'desktop-compact-css-zoom-125', compact }));
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.getByRole('button', { name: '设置' }).click();
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
