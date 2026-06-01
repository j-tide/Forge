import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hostProtocolVersion, hostWireResponseSchema, projectTrustVersion } from '@forge/contracts';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function next(child, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Host response timed out')); }, 5000);
    const onMessage = (raw) => {
      const parsed = hostWireResponseSchema.safeParse(raw);
      if (!parsed.success) { cleanup(); reject(new Error('Invalid response')); return; }
      if (predicate(parsed.data)) { cleanup(); resolve(parsed.data); }
    };
    const onExit = () => { cleanup(); reject(new Error('Host exited')); };
    function cleanup() { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); }
    child.on('message', onMessage); child.on('exit', onExit);
  });
}

async function command(child, type, payload, options = {}) {
  const requestId = randomUUID();
  const response = next(child, (item) => item.requestId === requestId);
  child.send({ kind: 'project-command', requestId, command: {
    schemaVersion: '1.0', commandId: options.commandId ?? randomUUID(), type,
    createdAt: new Date().toISOString(), protocolVersion: options.protocolVersion ?? hostProtocolVersion, payload,
  } });
  return response;
}

async function conversationCommand(child, type, payload, options = {}) {
  const requestId = randomUUID();
  const response = next(child, (item) => item.requestId === requestId);
  child.send({ kind: 'conversation-command', requestId, command: {
    schemaVersion: '1.0', commandId: options.commandId ?? randomUUID(), type,
    createdAt: new Date().toISOString(), protocolVersion: options.protocolVersion ?? hostProtocolVersion, payload,
  } });
  return response;
}

async function draftCommand(child, type, payload) {
  const requestId = randomUUID();
  const response = next(child, (item) => item.requestId === requestId);
  child.send({ kind: 'draft-command', requestId, command: {
    schemaVersion: '1.0', commandId: randomUUID(), type,
    createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload,
  } });
  return response;
}

test('real Host project IPC probes, requires trust, persists activation and rejects malformed commands', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'forge-host-project-ipc-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, '真实 项目');
  await mkdir(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Forge Test'); git('config', 'user.email', 'forge@example.invalid');
  await writeFile(join(repo, 'package.json'), '{"scripts":{"build":"node never-run.js"}}');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const token = randomUUID();
  const child = fork(entry, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {
    ...process.env, FORGE_HOST_TRANSPORT: 'cli', FORGE_HOST_OWNERSHIP_TOKEN: token,
    FORGE_HOST_DATA_DIR: join(root, 'data'), FORGE_ENVIRONMENT: 'test',
  } });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = await next(child, (item) => item.kind === 'ready');
  const unauth = await command(child, 'project.list', {});
  assert.equal(unauth.result.error.code, 'UNAUTHENTICATED');
  const helloId = randomUUID();
  const hello = next(child, (item) => item.requestId === helloId);
  child.send({ kind: 'hello', requestId: helloId, protocolVersion: hostProtocolVersion,
    productVersion: '0.0.1', hostVersion: '0.0.1', ownershipToken: token });
  assert.equal((await hello).ok, true);
  const invalid = await command(child, 'project.probe', { rootPath: 'relative' });
  assert.equal(invalid.result.error.code, 'PROJECT_INVALID_PATH');
  const probe = await command(child, 'project.probe', { rootPath: repo });
  assert.equal(probe.result.ok, true);
  assert.equal(probe.result.data.repositoryType, 'git');
  const untrusted = await command(child, 'project.create', { rootPath: repo, fingerprint: probe.result.data.fingerprint,
    trustVersion: projectTrustVersion, approved: false, expectedRevision: 0 });
  assert.equal(untrusted.kind, 'protocol-error');
  assert.equal(untrusted.error.code, 'VALIDATION_ERROR');
  assert.deepEqual((await command(child, 'project.list', {})).result.data, []);
  const created = await command(child, 'project.create', { rootPath: repo, fingerprint: probe.result.data.fingerprint,
    trustVersion: projectTrustVersion, approved: true, expectedRevision: 0 });
  assert.equal(created.result.ok, true);
  const projectId = created.result.data.projectId;
  const conversation = await conversationCommand(child, 'conversation.create', {
    projectId, title: 'A real local conversation', expectedRevision: 0 });
  assert.equal(conversation.result.ok, true);
  const conversationId = conversation.result.data.conversationId;
  const send = { projectId, conversationId, idempotencyKey: randomUUID(),
    text: 'Please clarify the parser requirement', attachmentIds: [] };
  const firstMessage = await conversationCommand(child, 'conversation.send', send);
  assert.equal(firstMessage.result.ok, true);
  assert.equal(firstMessage.result.data.replyStatus, 'unavailable');
  assert.equal(firstMessage.result.data.replay, false);
  const duplicateMessage = await conversationCommand(child, 'conversation.send', send);
  assert.equal(duplicateMessage.result.data.message.messageId, firstMessage.result.data.message.messageId);
  assert.equal(duplicateMessage.result.data.replay, true);
  const draftInput = { projectId, conversationId,
    sourceMessageId: firstMessage.result.data.message.messageId, idempotencyKey: randomUUID() };
  const manual = await draftCommand(child, 'draft.manual', draftInput);
  assert.equal(manual.result.ok, true);
  assert.equal(manual.result.data.status, 'manual');
  assert.equal((await draftCommand(child, 'draft.manual', draftInput)).result.data.draftId,
    manual.result.data.draftId);
  assert.equal((await draftCommand(child, 'draft.list', { projectId, conversationId })).result.data.length, 1);
  assert.equal((await draftCommand(child, 'draft.get', { projectId,
    draftId: manual.result.data.draftId })).result.data.editableText, send.text);
  const editedDraft = await draftCommand(child, 'draft.updateText', { projectId,
    draftId: manual.result.data.draftId, expectedRevision: manual.result.data.revision,
    editableText: 'Clarified local draft' });
  assert.equal(editedDraft.result.data.editableText, 'Clarified local draft');
  assert.equal((await draftCommand(child, 'draft.get', { projectId: randomUUID(),
    draftId: manual.result.data.draftId })).result.data, null);
  const invalidDraft = await draftCommand(child, 'draft.generate', { ...draftInput, approved: true });
  assert.equal(invalidDraft.kind, 'protocol-error');
  assert.equal(invalidDraft.error.code, 'VALIDATION_ERROR');
  assert.deepEqual((await conversationCommand(child, 'conversation.messages', { projectId, conversationId }))
    .result.data.map((item) => item.content), [send.text]);
  const crossed = await conversationCommand(child, 'conversation.messages', { projectId: randomUUID(), conversationId });
  assert.equal(crossed.result.error.code, 'PROJECT_NOT_FOUND');
  assert.equal((await command(child, 'project.active', {})).result.data.projectId, projectId);
  assert.equal((await command(child, 'project.list', {})).result.data.length, 1);
  const duplicate = await command(child, 'project.create', { rootPath: repo, fingerprint: probe.result.data.fingerprint,
    trustVersion: projectTrustVersion, approved: true, expectedRevision: created.result.data.revision });
  assert.equal(duplicate.result.data.projectId, projectId);
  const environment = await command(child, 'environment.save', { projectId, expectedRevision: 0,
    name: 'QA', config: { commandPresetIds: [], envRefs: [], networkMode: 'trusted-local' } });
  assert.equal(environment.result.ok, true);
  assert.equal((await command(child, 'environment.list', { projectId })).result.data.length, 2);
  const presetPayload = { projectId, environmentId: environment.result.data.environmentId,
    expectedRevision: 0, name: 'Build', executable: 'pnpm', argv: ['build'],
    cwdRelative: '.', envRefs: [], timeoutSeconds: 60, scriptsHash: probe.result.data.scriptsHash };
  const saveId = randomUUID();
  const preset = await command(child, 'commandPreset.save', presetPayload, { commandId: saveId });
  assert.equal(preset.result.ok, true);
  const replay = await command(child, 'commandPreset.save', presetPayload, { commandId: saveId });
  assert.deepEqual(replay.result, preset.result);
  assert.equal((await command(child, 'commandPreset.list', { projectId,
    environmentId: environment.result.data.environmentId })).result.data.length, 1);
  const approved = await command(child, 'commandPreset.approve', { projectId,
    presetId: preset.result.data.presetId, expectedRevision: preset.result.data.revision,
    scriptsHash: probe.result.data.scriptsHash });
  assert.match(approved.result.data.approvalHash, /^[a-f0-9]{64}$/);
  const stale = await command(child, 'environment.save', { projectId,
    environmentId: environment.result.data.environmentId, expectedRevision: 0,
    name: 'Stale', config: environment.result.data.config });
  assert.equal(stale.result.error.code, 'REVISION_CONFLICT');
  const invalidPreset = await command(child, 'commandPreset.save', { ...presetPayload,
    expectedRevision: 0, name: 'Unsafe', cwdRelative: '../outside' });
  assert.equal(invalidPreset.result.error.code, 'PROJECT_INVALID_PATH');
  const mismatched = await command(child, 'project.list', {}, { protocolVersion: 'forge-host-protocol/v0' });
  assert.equal(mismatched.result.error.code, 'PROTOCOL_MISMATCH');
  const removed = await command(child, 'project.remove', { projectId, expectedRevision: created.result.data.revision });
  assert.equal(removed.result.data.removedId, projectId);
  assert.equal((await command(child, 'project.active', {})).result.data, null);
  assert.match(await readFile(join(repo, 'package.json'), 'utf8'), /never-run/);
  const exit = once(child, 'exit');
  const shutdownId = randomUUID(); const shutdown = next(child, (item) => item.requestId === shutdownId);
  child.send({ kind: 'shutdown', requestId: shutdownId, hostId: ready.info.hostId, ownershipToken: token });
  assert.equal((await shutdown).ok, true); await exit;
});
