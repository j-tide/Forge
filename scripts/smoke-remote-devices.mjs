import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'forge-remote-devices-'));
const projectRoot = join(directory, 'fixture project');
const dataDir = join(directory, 'data');
mkdirSync(projectRoot);
const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
let app;
try {
  const fixture = JSON.parse(execFileSync('uv', [
    '--directory', join(root, 'python'), 'run', '--frozen', 'python',
    'scripts/seed_remote_device_fixture.py', dataDir, projectRoot,
  ], { encoding: 'utf8' }));
  app = await electron.launch({
    executablePath: requireDesktop('electron'),
    args: [join(root, 'apps/desktop')],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
  });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  await page.getByRole('button', { name: '设置' }).click();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  const remotePost = async (origin, path, body) => fetch(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      Origin: origin, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify(body),
  });
  await page.getByRole('button', { name: '开启本机浏览器预览' }).click();
  const loopback = await page.evaluate(() => globalThis.forge.remoteLoopback('inspect'));
  assert.equal(loopback.running, true);
  assert.match(loopback.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  await page.getByText(loopback.origin, { exact: false }).waitFor();
  if (process.env.FORGE_REMOTE_LOOPBACK_SCREENSHOT) {
    await page.getByText(loopback.origin, { exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_REMOTE_LOOPBACK_SCREENSHOT });
  }
  const health = await page.evaluate(() => globalThis.forge.pythonHostStatus());
  assert.equal(loopback.hostId, health.info.hostId);
  await page.getByRole('button', { name: '创建一次性配对' }).click();
  const nonce = await page.locator('details').filter({ hasText: '查看临时 nonce' })
    .locator('code').textContent();
  assert.ok(nonce && nonce.length >= 40);
  const claimResponse = await remotePost(loopback.origin, '/v1/pair/claim', {
    nonce, deviceLabel: 'Same Desktop browser fixture',
  });
  assert.equal(claimResponse.status, 202);
  const claim = await claimResponse.json();
  assert.equal(claim.status, 'pending');
  await page.getByRole('button', { name: '检查状态' }).click();
  await page.getByText('Same Desktop browser fixture', { exact: false }).waitFor();
  const scope = page.locator('.pairing-scope-choices input[value="task:approve"]');
  await scope.check();
  await page.getByRole('button', { name: `批准访问 ${'fixture project'}` }).click();
  await page.getByText('手机 HTTPS 仍未启用', { exact: false }).waitFor();
  const sessionResponse = await remotePost(loopback.origin, '/v1/pair/status', {
    claimSecret: claim.claimSecret,
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).status, 'approved');
  const cookie = sessionResponse.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(cookie ?? '', /^__Host-forge_session=/);
  const currentResponse = await fetch(loopback.origin + '/v1/session/current', {
    headers: { Origin: loopback.origin, 'Sec-Fetch-Site': 'same-origin',
      'X-Forge-Session': '1', Cookie: cookie },
  });
  assert.equal(currentResponse.status, 200);
  const current = await currentResponse.json();
  assert.deepEqual(current.projectIds, [fixture.projectId]);
  const paired = await page.evaluate(() => globalThis.forge.invokeDevicePairing({
    type: 'list', payload: {},
  }));
  assert.deepEqual(paired.find((item) => item.name === 'Same Desktop browser fixture')?.scopes,
    ['task:approve']);
  await page.getByRole('button', { name: '关闭本机浏览器预览' }).click();
  await page.getByText('本机浏览器预览已关闭', { exact: false }).waitFor();
  assert.equal((await page.evaluate(() => globalThis.forge.remoteLoopback('inspect'))).running, false);
  await assert.rejects(fetch(loopback.origin + '/'));
  await page.getByRole('heading', { name: '远程连接与设备' }).waitFor();
  await page.getByText('Fixture phone').waitFor();
  const fixtureCard = page.locator('.remote-device-card').filter({ hasText: 'Fixture phone' });
  assert.match(await page.locator('.remote-devices').textContent(),
    /未过期会话凭据 1 个；这不是设备在线状态/);
  await fixtureCard.getByRole('button', { name: '收窄为只读' }).click();
  await page.getByText('设备已收窄为只读。').waitFor();
  await fixtureCard.getByRole('button', { name: '查看审计' }).click();
  await page.getByText(/操作 1 → 0/).waitFor();
  const firstAudit = await page.evaluate((deviceId) => globalThis.forge.invokeDevicePairing({
    type: 'audit', payload: { deviceId },
  }), fixture.deviceId);
  assert.equal(firstAudit[0].kind, 'narrow');
  assert.equal(firstAudit[0].newScopes.length, 0);
  if (process.env.FORGE_REMOTE_AUTHORIZED_SCREENSHOT) {
    await page.locator('.remote-devices').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_REMOTE_AUTHORIZED_SCREENSHOT });
  }
  await fixtureCard.getByRole('button', { name: '撤销设备' }).click();
  await page.getByText('设备及其会话已撤销；已提交的操作不会回滚。').waitFor();
  const listed = await page.evaluate(() => globalThis.forge.invokeDevicePairing({
    type: 'list', payload: {},
  }));
  const managed = listed.find((item) => item.deviceId === fixture.deviceId);
  assert.ok(managed);
  assert.equal(managed.status, 'revoked');
  assert.equal(managed.validSessionCount, 0);
  const finalAudit = await page.evaluate((deviceId) => globalThis.forge.invokeDevicePairing({
    type: 'audit', payload: { deviceId },
  }), fixture.deviceId);
  assert.deepEqual(finalAudit.map((item) => item.kind), ['revoke', 'narrow']);
  console.log(JSON.stringify({ stage: 'real-remote-device-management',
    deviceId: fixture.deviceId, projectId: fixture.projectId,
    policyRevision: managed.revision, status: managed.status,
    auditKinds: finalAudit.map((item) => item.kind) }));
} finally {
  if (app) await app.close();
  rmSync(directory, { recursive: true, force: true });
}
