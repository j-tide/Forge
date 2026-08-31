import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = await mkdtemp(path.join(tmpdir(), 'forge-glass-preview-'));
const screenshotRoot = path.join(repositoryRoot, 'output', 'playwright', 'forge-glass-preview');
const electronPath = path.join(
  repositoryRoot,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron'
);

await mkdir(screenshotRoot, { recursive: true });
process.stdout.write(`Isolated test data: ${profileRoot}\n`);

for (const theme of ['light', 'dark']) {
  const userDataPath = path.join(profileRoot, theme);
  await mkdir(userDataPath, { recursive: true });
  await writeFile(
    path.join(userDataPath, 'settings.json'),
    JSON.stringify({
      onboardingCompleted: true,
      theme,
      colorTheme: 'forge-glass',
      sentryEnabled: false
    })
  );

  const app = await electron.launch({
    executablePath: electronPath,
    args: [path.join(repositoryRoot, 'apps', 'desktop')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FORGE_GLASS_PREVIEW_USER_DATA_DIR: userDataPath
    }
  });

  try {
    await app.firstWindow();
    let page;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      page = app.windows().find((window) => !window.url().startsWith('devtools://'));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!page) throw new Error('Forge preview did not open an application window');
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await page.locator('.forge-glass-welcome').waitFor({ timeout: 15000 });
    } catch (error) {
      await page.screenshot({ path: path.join(screenshotRoot, `startup-error-${theme}.png`) });
      process.stderr.write(`Startup page: ${page.url()} ${(await page.locator('body').innerText()).slice(0, 1000)}\n`);
      throw error;
    }
    await page.screenshot({
      path: path.join(screenshotRoot, `welcome-${theme}-1440.png`),
      animations: 'disabled'
    });
    const state = await page.evaluate(() => ({
      title: document.title,
      theme: document.documentElement.getAttribute('data-theme'),
      dark: document.documentElement.classList.contains('dark'),
      projectCount: document.querySelectorAll('.forge-glass-welcome-project').length
    }));
    if (state.title !== 'Forge' || state.theme !== 'forge-glass' || state.dark !== (theme === 'dark') || state.projectCount !== 0) {
      throw new Error(`Unexpected Electron UI state for ${theme}: ${JSON.stringify(state)}`);
    }
    process.stdout.write(`${theme}: ${JSON.stringify(state)}\n`);
  } finally {
    await app.close();
  }
}

process.stdout.write(`Screenshots: ${screenshotRoot}\n`);
