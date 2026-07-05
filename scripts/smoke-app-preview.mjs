import assert from 'node:assert/strict';
/* global window */
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'forge-preview-smoke-'));
let app;
let foreignRequests = 0;
const foreign = createServer((_request, response) => {
  foreignRequests += 1; response.writeHead(200); response.end('forbidden');
});
foreign.on('upgrade', (_request, socket) => { foreignRequests += 1; socket.destroy(); });
const local = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Untrusted fixture</title>' +
    '<h1>Independent app preview fixture</h1><p>Code from a disposable local server.</p>');
});
async function listen(server) {
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  return server.address().port;
}
try {
  const foreignPort = await listen(foreign);
  const localPort = await listen(local);
  const url = `http://127.0.0.1:${localPort}/`;
  const env = { ...process.env, FORGE_DEV_SERVER_URL: '',
    FORGE_HOST_DATA_DIR: join(temporaryRoot, 'data'), FORGE_MODEL_PROVIDER: 'disabled',
    OPENAI_API_KEY: '', CODEX_API_KEY: '', ANTHROPIC_API_KEY: '',
    CODEX_HOME: join(temporaryRoot, 'empty-codex-home') };
  mkdirSync(env.CODEX_HOME);
  app = await electron.launch({ executablePath: requireDesktop('electron'),
    args: [desktopDirectory], env });
  const manager = await app.firstWindow();
  await manager.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  await assert.rejects(manager.evaluate(() => window.forge.openAppPreview({
    url: 'file:///etc/passwd',
  })), /PREVIEW_URL_REJECTED/);
  const pending = app.waitForEvent('window');
  const result = await manager.evaluate((target) => window.forge.openAppPreview({ url: target }), url);
  assert.equal(result.origin, new URL(url).origin);
  const preview = await pending;
  await preview.getByRole('heading', { name: 'Independent app preview fixture' }).waitFor();
  const isolation = await preview.evaluate(async (badUrl) => {
    let crossOriginBlocked = false;
    try { await fetch(badUrl); } catch { crossOriginBlocked = true; }
    const websocketBlocked = await new Promise((resolveBlocked) => {
      const socket = new WebSocket(badUrl.replace('http:', 'ws:'));
      socket.onopen = () => { socket.close(); resolveBlocked(false); };
      socket.onerror = () => resolveBlocked(true);
    });
    const child = window.open('https://example.com/', '_blank');
    return { forge: typeof window.forge, require: typeof window.require,
      process: typeof window.process, ipcRenderer: typeof window.ipcRenderer,
      crossOriginBlocked, websocketBlocked, popupBlocked: child === null };
  }, `http://127.0.0.1:${foreignPort}/private`);
  assert.deepEqual(isolation, { forge: 'undefined', require: 'undefined',
    process: 'undefined', ipcRenderer: 'undefined', crossOriginBlocked: true,
    websocketBlocked: true,
    popupBlocked: true });
  assert.equal(foreignRequests, 0);
  const preferences = await app.evaluate(({ BrowserWindow }, allowedOrigin) => {
    const previewWindow = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().startsWith(`${allowedOrigin}/`));
    if (!previewWindow) throw new Error('PREVIEW_WINDOW_MISSING');
    const values = previewWindow.webContents.getLastWebPreferences();
    return { preload: values.preload ?? null, nodeIntegration: values.nodeIntegration,
      contextIsolation: values.contextIsolation, sandbox: values.sandbox,
      webSecurity: values.webSecurity, webviewTag: values.webviewTag,
      disableDialogs: values.disableDialogs };
  }, result.origin);
  assert.deepEqual(preferences, { preload: null, nodeIntegration: false,
    contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
    disableDialogs: true });
  const separateIpcIdentity = await app.evaluate(({ BrowserWindow }, allowedOrigin) => {
    const windows = BrowserWindow.getAllWindows();
    const untrusted = windows.find((item) => item.webContents.getURL().startsWith(`${allowedOrigin}/`));
    const trusted = windows.find((item) => item !== untrusted);
    if (!trusted || !untrusted) throw new Error('WINDOW_IDENTITY_MISSING');
    return untrusted.webContents !== trusted.webContents &&
      untrusted.webContents.mainFrame !== trusted.webContents.mainFrame;
  }, result.origin);
  assert.equal(separateIpcIdentity, true);
  await preview.evaluate(() => { window.location.href = 'file:///etc/passwd'; });
  await preview.waitForTimeout(300);
  assert.equal(new URL(preview.url()).origin, new URL(url).origin);
  await manager.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  const output = resolve('output/playwright'); mkdirSync(output, { recursive: true });
  await preview.screenshot({ path: join(output, 'p6-03-isolated-app-preview.png') });
  console.log(JSON.stringify({ result: 'pass', origin: result.origin,
    isolated: isolation, preferences, separateIpcIdentity, foreignRequests,
    screenshot: 'output/playwright/p6-03-isolated-app-preview.png' }, null, 2));
} finally {
  await app?.close();
  await Promise.all([new Promise((resolveClose) => local.close(resolveClose)),
    new Promise((resolveClose) => foreign.close(resolveClose))]);
  rmSync(temporaryRoot, { recursive: true, force: true });
}
