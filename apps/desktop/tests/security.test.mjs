import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { isTrustedHostIpcSender } from '../dist/main/ipc-auth.js';
import { createWindowOptions } from '../dist/main/window-options.js';
import { hostEnvironment } from '../dist/main/host-environment.js';

test('owned Host gets runtime hints and non-credential proxies but no arbitrary secrets', () => {
  assert.deepEqual(hostEnvironment({ HOME: '/example/home', PATH: '/bin', HTTPS_PROXY: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://name:secret@proxy.invalid:8080', OPENAI_API_KEY: 'private',
    ANOTHER_TOKEN: 'private' }), {
    HOME: '/example/home', PATH: '/bin', HTTPS_PROXY: 'http://127.0.0.1:7890',
  });
});

test('BrowserWindow enables renderer isolation and sandboxing', () => {
  const options = createWindowOptions('/absolute/preload.cjs');
  assert.equal(options.webPreferences.preload, '/absolute/preload.cjs');
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.webviewTag, false);
  assert.equal(options.minWidth, 1280);
  assert.equal(options.minHeight, 800);
});

test('compiled preload exposes only fixed Host methods and releases its listener', async () => {
  const code = await readFile(new URL('../dist/preload/index.cjs', import.meta.url), 'utf8');
  const exposed = [];
  const calls = [];
  const listeners = new Map();
  runInNewContext(code, {
    exports: {},
    process: { platform: 'darwin' },
    require(id) {
      assert.equal(id, 'electron');
      return {
        contextBridge: { exposeInMainWorld(name, value) { exposed.push({ name, value }); } },
        ipcRenderer: {
          invoke(channel, ...args) { calls.push({ channel, args }); return Promise.resolve({ ok: true }); },
          on(channel, listener) { listeners.set(channel, listener); },
          removeListener(channel, listener) { assert.equal(listeners.get(channel), listener); listeners.delete(channel); },
        },
      };
    },
    Object,
  });
  assert.equal(exposed.length, 1);
  assert.equal(exposed[0].name, 'forge');
  assert.deepEqual(Object.keys(exposed[0].value), ['platform', 'hostStatus', 'hostHealth', 'pythonHostStatus', 'invokeSystem', 'inspectBundledPlugin', 'chooseProjectFolder', 'invokeProject', 'invokeConversation', 'invokeDraft', 'invokeApproval', 'invokeBoard', 'invokeRun', 'onConversationEvent', 'onHostStatus', 'onPythonHostStatus']);
  assert.equal(exposed[0].value.platform, 'darwin');
  assert.equal(Object.isFrozen(exposed[0].value), true);
  await exposed[0].value.hostStatus();
  await exposed[0].value.hostHealth();
  await exposed[0].value.pythonHostStatus();
  await exposed[0].value.invokeSystem({ type: 'system.ping' });
  await exposed[0].value.inspectBundledPlugin();
  await exposed[0].value.chooseProjectFolder();
  await exposed[0].value.invokeProject({ type: 'project.list' });
  await exposed[0].value.invokeConversation({ type: 'conversation.list' });
  await exposed[0].value.invokeDraft({ type: 'draft.list' });
  await exposed[0].value.invokeApproval({ type: 'approval.forDraft' });
  await exposed[0].value.invokeBoard({ type: 'board.snapshot' });
  await exposed[0].value.invokeRun({ type: 'run.list' });
  assert.deepEqual(calls.map((call) => call.channel), ['forge:host-status', 'forge:host-health', 'forge:python-host-status', 'forge:system-command', 'forge:plugin-inspect-bundled', 'forge:choose-project-folder', 'forge:project-command', 'forge:conversation-command', 'forge:draft-command', 'forge:approval-command', 'forge:board-command', 'forge:run-command']);
  const stop = exposed[0].value.onHostStatus(() => {});
  assert.equal(listeners.size, 1);
  stop();
  assert.equal(listeners.size, 0);
  const stopPython = exposed[0].value.onPythonHostStatus(() => {});
  assert.equal(listeners.size, 1);
  stopPython();
  assert.equal(listeners.size, 0);
});

test('Host IPC rejects a different frame, URL or WebContents', () => {
  const frame = { url: 'file:///trusted/index.html' };
  const trustedContents = { mainFrame: frame, isDestroyed: () => false };
  const event = { sender: trustedContents, senderFrame: frame };
  assert.equal(isTrustedHostIpcSender(event, trustedContents, frame.url), true);
  const trustedUrl = frame.url;
  frame.url = `${trustedUrl}#/tasks/063210d2-7d24-4f16-9ad1-a2062f51a845`;
  assert.equal(isTrustedHostIpcSender(event, trustedContents, trustedUrl), true);
  frame.url = `${trustedUrl}?inject=1`;
  assert.equal(isTrustedHostIpcSender(event, trustedContents, trustedUrl), false);
  frame.url = trustedUrl;
  assert.equal(isTrustedHostIpcSender({ ...event, senderFrame: { url: frame.url } }, trustedContents, frame.url), false);
  assert.equal(isTrustedHostIpcSender({ ...event, sender: {} }, trustedContents, frame.url), false);
  assert.equal(isTrustedHostIpcSender(event, trustedContents, 'file:///other/index.html'), false);
});
