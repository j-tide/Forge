import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutorEventGate, executorCapabilitiesSchema, executorEventSchema,
  executorRunRequestSchema, executorUsageSchema, scheduledExecutorRunRequestSchema } from '../dist/index.js';

test('executor request rejects unknown fields, empty workspace and unsupported permission', () => {
  const request = { runId: 'r1', taskId: 't1', workspace: '/tmp/example', goal: 'Read code', context: [],
    permission: 'read-only', approval: 'never', maxDurationMs: 1000 };
  assert.equal(executorRunRequestSchema.parse(request).runId, 'r1');
  assert.equal(executorRunRequestSchema.safeParse({ ...request, arbitraryShell: true }).success, false);
  assert.equal(executorRunRequestSchema.safeParse({ ...request, workspace: '' }).success, false);
  assert.equal(executorRunRequestSchema.safeParse({ ...request, permission: 'danger-full-access' }).success, false);
});

test('usage requires real token counts and leaves unknown cost unavailable', () => {
  const usage = { inputTokens: 10, outputTokens: 2, cachedInputTokens: 3, cost: null, currency: null };
  assert.deepEqual(executorUsageSchema.parse(usage), usage);
  assert.equal(executorUsageSchema.safeParse({ ...usage, inputTokens: -1 }).success, false);
});

test('capabilities distinguish measured support and reject unknown fields', () => {
  const capabilities = { executorId: 'executor.codex', adapterVersion: '0.0.1', upstreamVersion: 'codex-cli 0.155.1',
    platform: 'darwin/arm64', available: true, streaming: true, resume: true, interrupt: true, approval: true,
    structuredEvents: true, structuredOutput: true, workspaceControl: true, toolEvents: false, sessionPersistence: true,
    modelSelection: true, usageReporting: true, readOnlyEnforced: true, networkPolicyEnforced: false,
    enforcement: 'native-sandbox', modelIds: ['gpt-6-luna'], authModes: ['chatgpt-session'], warnings: [] };
  assert.equal(executorCapabilitiesSchema.parse(capabilities).toolEvents, false);
  assert.equal(executorCapabilitiesSchema.safeParse({ ...capabilities, invented: true }).success, false);
});

test('executor events require monotonic-ready metadata and forbid raw provider payloads', () => {
  const event = { type: 'run.started', runId: 'r1', sequence: 1, timestamp: new Date().toISOString(), providerSessionId: 's1' };
  assert.equal(executorEventSchema.parse(event).type, 'run.started');
  assert.equal(executorEventSchema.safeParse({ ...event, rawCodexEvent: {} }).success, false);
  assert.equal(executorEventSchema.safeParse({ ...event, sequence: 0 }).success, false);
});

test('scheduled request binds attempt, lease epoch and versioned context without arbitrary grants', () => {
  const request = { runId: 'r1', taskId: 't1', workspace: '/fixture', goal: 'Inspect code',
    context: [], permission: 'read-only', approval: 'never', maxDurationMs: 1000,
    attempt: { attemptId: 'a1', leaseEpoch: 2, contractRevision: 1,
      workspaceLeaseId: '9ed91d0e-3952-48ef-8285-d56cb4b26188',
      contextBundleId: 'context1', profileRevision: 1, outputSchemaId: 'result1' } };
  assert.equal(scheduledExecutorRunRequestSchema.parse(request).attempt.leaseEpoch, 2);
  assert.equal(scheduledExecutorRunRequestSchema.safeParse({ ...request, attempt: undefined }).success, false);
  assert.equal(scheduledExecutorRunRequestSchema.safeParse({ ...request, attempt: {
    ...request.attempt, leaseEpoch: 0 } }).success, false);
  assert.equal(scheduledExecutorRunRequestSchema.safeParse({ ...request, attempt: {
    ...request.attempt, shell: 'rm -rf /' } }).success, false);
});

test('event gate rejects wrong run, duplicate, gaps, invalid output and post-terminal events', () => {
  const gate = new ExecutorEventGate('r1');
  const started = { type: 'run.started', runId: 'r1', sequence: 1,
    timestamp: new Date().toISOString(), providerSessionId: 'session1' };
  assert.throws(() => gate.accept({ ...started, type: 'assistant.message', text: 'early' }),
    { code: 'EXECUTOR_PROTOCOL_ERROR' });
  assert.throws(() => gate.accept({ ...started, runId: 'r2' }), { code: 'EXECUTOR_PROTOCOL_ERROR' });
  assert.deepEqual(gate.accept(started), started);
  assert.throws(() => gate.accept(started), { code: 'EXECUTOR_PROTOCOL_ERROR' });
  assert.throws(() => gate.accept({ ...started, sequence: 3, type: 'assistant.message', text: 'gap' }),
    { code: 'EXECUTOR_PROTOCOL_ERROR' });
  assert.throws(() => gate.accept({ ...started, sequence: 2, rawProviderPayload: {} }),
    { code: 'EXECUTOR_PROTOCOL_ERROR' });
  assert.equal(gate.accept({ type: 'run.cancelled', runId: 'r1', sequence: 2,
    timestamp: started.timestamp }).type,
    'run.cancelled');
  assert.throws(() => gate.accept({ ...started, sequence: 3 }), { code: 'EXECUTOR_PROTOCOL_ERROR' });
});
