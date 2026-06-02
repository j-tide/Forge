import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftCommand, readDraftReceipt, reviseDraftCommand, submitDraft } from './draft';
import type { TaskContract } from '@forge/contracts';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const messageId = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
const sourceRef = `message:${messageId}`;
const contract: TaskContract = {
  schemaVersion: '1.0', taskId: crypto.randomUUID(), projectId, revision: 1,
  title: 'Check input', type: 'feature', goal: 'Reject invalid input',
  acceptance: [{ id: 'ac1', statement: 'Shows an error', method: 'manual',
    required: true, sourceRefs: [sourceRef] }], constraints: [], scope: [],
  outOfScope: [], dependencies: [], openQuestions: [], assumptions: [],
  sourceRefs: [sourceRef], workflowRef: 'standard@1', priority: 'normal',
};
afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('manual mobile Task draft command', () => {
  it('uses explicit user Contract and verifies exact Host receipt', async () => {
    const command = createDraftCommand(contract);
    const receipt = { commandId: command.commandId, status: 'completed',
      operationId: null, resourceRevision: 1, result: {
        draftId: contract.taskId, status: 'proposed', revision: 1,
      }, error: null };
    const fetch = vi.fn().mockImplementation(async () => reply(200, receipt));
    vi.stubGlobal('fetch', fetch);
    expect(await submitDraft(command, 'csrf')).toEqual(receipt);
    const [, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({
      method: 'tasks.createDraft', projectId, resourceId: contract.taskId,
      expectedRevision: 0, payload: { contract: {
        ...contract, sourceRefs: [sourceRef, `decision:${command.commandId}`],
        acceptance: [{ ...contract.acceptance[0],
          sourceRefs: [sourceRef, `decision:${command.commandId}`] }],
      } },
    });
    expect(await readDraftReceipt(command.commandId)).toEqual(receipt);
    expect(fetch.mock.calls[1]?.[0]).toBe(`/v1/commands/${command.commandId}`);
  });

  it('rejects a wrong receipt and never retries the write', async () => {
    const command = createDraftCommand(contract);
    const fetch = vi.fn().mockResolvedValue(reply(200, {
      commandId: command.commandId, status: 'completed', operationId: null,
      resourceRevision: 1, result: { draftId: crypto.randomUUID(),
        status: 'proposed', revision: 1 }, error: null,
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(submitDraft(command, 'csrf')).rejects.toThrow('REMOTE_DRAFT_RECEIPT_MISMATCH');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a definite CSRF refusal from an uncertain draft result', async () => {
    const command = createDraftCommand(contract);
    const fetch = vi.fn().mockResolvedValue(reply(403, { code: 'REMOTE_CSRF_REJECTED' }));
    vi.stubGlobal('fetch', fetch);
    await expect(submitDraft(command, 'stale-csrf')).rejects.toThrow('REMOTE_CSRF_REJECTED');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('binds an explicit revision reason and new decision to the prior source', async () => {
    const created = createDraftCommand(contract);
    const previous = created.payload.contract;
    const revised = reviseDraftCommand(previous, {
      ...previous, revision: 2, goal: 'Reject malformed and nonnumeric input',
      acceptance: [{ ...previous.acceptance[0]!, statement: 'Show clear validation error' }],
    }, 'Clarified validation');
    expect(revised).toMatchObject({ method: 'tasks.revise', expectedRevision: 1,
      resourceId: previous.taskId, payload: { reason: 'Clarified validation',
        contract: { revision: 2,
          sourceRefs: [sourceRef, `decision:${created.commandId}`,
            `decision:${revised.commandId}`],
          acceptance: [{ sourceRefs: [sourceRef, `decision:${created.commandId}`,
            `decision:${revised.commandId}`] }],
        } } });
    const receipt = { commandId: revised.commandId, status: 'completed',
      operationId: null, resourceRevision: 2, result: {
        draftId: previous.taskId, status: 'proposed', revision: 2,
      }, error: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, receipt)));
    expect(await submitDraft(revised, 'csrf')).toEqual(receipt);
  });
});
