import { afterEach, describe, expect, it, vi } from 'vitest';
import { readApprovalDetail, readApprovals, readBoard, readMessagePage,
  readNotifications, readProjectPage, readTaskActivity, readTaskDetail,
  readTaskDiff, readTaskPage } from './read';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const taskId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => vi.unstubAllGlobals());

describe('authenticated fixed-path mobile reads', () => {
  it('reads only ordered visible Host messages from a fixed scoped path', async () => {
    const conversationId = taskId;
    const current = { messageId: projectId, conversationId, sequence: 2,
      role: 'user', content: '真实消息', truncated: false,
      status: 'completed', createdAt: new Date().toISOString() };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, {
      projectId, conversationId, items: [current],
      page: { cursor: 'm:2', hasMore: true },
    })).mockResolvedValueOnce(reply(200, {
      projectId, conversationId, items: [{ ...current, conversationId: projectId }],
      page: { cursor: null, hasMore: false },
    })).mockResolvedValueOnce(reply(200, {
      projectId, conversationId, items: [{ ...current, sequence: 2 },
        { ...current, messageId: taskId, sequence: 1 }],
      page: { cursor: null, hasMore: false },
    }));
    vi.stubGlobal('fetch', fetch);
    expect((await readMessagePage(projectId, conversationId)).items[0]?.content)
      .toBe('真实消息');
    await expect(readMessagePage(projectId, conversationId, 'm:2'))
      .rejects.toThrow('REMOTE_PROJECT_MISMATCH');
    await expect(readMessagePage(projectId, conversationId))
      .rejects.toThrow('REMOTE_MESSAGE_ORDER_INVALID');
    await expect(readMessagePage(projectId, '../private'))
      .rejects.toThrow('REMOTE_INVALID_PROJECT');
    await expect(readMessagePage(projectId, conversationId, 'm:../private'))
      .rejects.toThrow('REMOTE_INVALID_CURSOR');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/projects/${projectId}/conversations/${conversationId}/messages?limit=20`,
      `/v1/projects/${projectId}/conversations/${conversationId}/messages?limit=20&cursor=m%3A2`,
      `/v1/projects/${projectId}/conversations/${conversationId}/messages?limit=20`,
    ]);
  });
  it('reads only a bounded project-scoped in-app notification list', async () => {
    const event = { id: 'p:2', hostId: 'host-fixture', projectId,
      taskId, entityId: taskId, type: 'board.changed',
      occurredAt: new Date().toISOString() };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, { projectId,
      items: [event], lastEventCursor: 'p:2' }))
      .mockResolvedValueOnce(reply(200, { projectId: taskId,
        items: [event], lastEventCursor: 'p:2' }));
    vi.stubGlobal('fetch', fetch);
    expect((await readNotifications(projectId)).items[0]?.id).toBe('p:2');
    await expect(readNotifications(projectId)).rejects.toThrow('REMOTE_PROJECT_MISMATCH');
    await expect(readNotifications('../private')).rejects.toThrow('REMOTE_INVALID_PROJECT');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/projects/${projectId}/notifications?limit=20`,
      `/v1/projects/${projectId}/notifications?limit=20`,
    ]);
  });
  it('reads a project cursor and keeps the Host blocked state intact', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, { items: [{
      id: projectId, name: '真实项目', revision: 1, defaultBranch: 'main', online: true,
    }], page: { cursor: projectId, hasMore: true } })).mockResolvedValueOnce(reply(200, {
      projectId, eventCursor: 'p:9', serverTime: new Date().toISOString(),
      tasks: [{ id: taskId, projectId, title: '阻塞的任务', state: 'blocked',
        boardColumn: 'review', revision: 3, contractRevision: 2,
        approvedRevision: 2, activeRunId: null, blockReason: '审查未通过',
        allowedCommands: [] }],
    }));
    vi.stubGlobal('fetch', fetch);
    expect((await readProjectPage(projectId)).items[0]?.name).toBe('真实项目');
    expect((await readBoard(projectId)).tasks[0]?.state).toBe('blocked');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/projects?limit=50&cursor=${projectId}`,
      `/v1/projects/${projectId}/board`,
    ]);
    for (const call of fetch.mock.calls) {
      expect(call[1]).toMatchObject({ credentials: 'same-origin', mode: 'same-origin',
        redirect: 'error', cache: 'no-store' });
    }
  });

  it('rejects forged paths, mismatched project data and revoked sessions', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, { projectId,
      eventCursor: 'p:0', serverTime: new Date().toISOString(), tasks: [{
        id: taskId, projectId: taskId, title: 'Wrong project', state: 'todo',
        boardColumn: 'todo', revision: 1, contractRevision: 1,
        approvedRevision: 1, activeRunId: null, blockReason: null,
        allowedCommands: [],
      }] })).mockResolvedValueOnce(reply(403, { code: 'REMOTE_PROJECT_FORBIDDEN' }));
    vi.stubGlobal('fetch', fetch);
    await expect(readBoard('../private')).rejects.toThrow('REMOTE_INVALID_PROJECT');
    await expect(readProjectPage('../private')).rejects.toThrow('REMOTE_INVALID_CURSOR');
    await expect(readBoard(projectId)).rejects.toThrow('REMOTE_PROJECT_MISMATCH');
    await expect(readBoard(projectId)).rejects.toThrow('REMOTE_SESSION_UNAVAILABLE');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('accepts only a closed current approval page and fixed cursor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, {
      items: [{ approvalId: taskId, projectId, taskId,
        expectedRevision: 2, scopeHash: '0'.repeat(64),
        expiresAt: new Date().toISOString(), summary: 'Review this scope',
        risk: 'medium', requiredScope: 'task:create:todo' }],
      page: { cursor: null, hasMore: false },
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(readApprovals('a:1')).resolves.toMatchObject({
      items: [{ approvalId: taskId, summary: 'Review this scope' }],
    });
    await expect(readApprovals('a:1/../../private')).rejects.toThrow('REMOTE_INVALID_CURSOR');
    expect(fetch.mock.calls[0]?.[0]).toBe('/v1/approvals?limit=50&cursor=a%3A1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requires a matching current approval detail with a valid draft contract', async () => {
    const approvalId = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
    const contract = { schemaVersion: '1.0', taskId, projectId, revision: 2,
      title: '真实草稿', type: 'feature', goal: '明确范围',
      acceptance: [{ id: 'AC-01', statement: '检查结果', method: 'inspection',
        required: true, sourceRefs: [] }], constraints: [], scope: [], outOfScope: [],
      dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
      workflowRef: 'standard@1', priority: 'normal' };
    const detail = { approvalId, projectId, taskId, expectedRevision: 2,
      scopeHash: 'a'.repeat(64), snapshotId: null, actionDigest: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      summary: 'Approve current draft', risk: 'medium',
      requiredScope: 'task:create:todo', deviceOperationScope: 'task:approve',
      contract };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, { ...detail,
        contract: { ...contract, projectId: taskId } }))
      .mockResolvedValueOnce(reply(409, { code: 'REMOTE_APPROVAL_STALE' }));
    vi.stubGlobal('fetch', fetch);
    expect((await readApprovalDetail(approvalId)).contract.title).toBe('真实草稿');
    await expect(readApprovalDetail(approvalId)).rejects.toThrow('REMOTE_APPROVAL_MISMATCH');
    await expect(readApprovalDetail(approvalId)).rejects.toThrow('REMOTE_CURSOR_STALE');
    await expect(readApprovalDetail('../other')).rejects.toThrow('REMOTE_INVALID_APPROVAL');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/approvals/${approvalId}`, `/v1/approvals/${approvalId}`,
      `/v1/approvals/${approvalId}`,
    ]);
  });

  it('reads a bounded task page and rejects forged cursors or cross-project items', async () => {
    const task = { id: taskId, projectId, title: '真实任务', state: 'blocked',
      boardColumn: 'development', revision: 2, contractRevision: 2,
      approvedRevision: 2, activeRunId: null, blockReason: '实际运行失败',
      allowedCommands: [] };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, {
      projectId, tasks: [task], boardRevision: 7, eventCursor: 'p:5',
      serverTime: new Date().toISOString(),
      page: { cursor: 'b:7:1', hasMore: true },
    })).mockResolvedValueOnce(reply(200, {
      projectId, tasks: [{ ...task, projectId: taskId }],
      boardRevision: 7, eventCursor: 'p:5', serverTime: new Date().toISOString(),
      page: { cursor: null, hasMore: false },
    }));
    vi.stubGlobal('fetch', fetch);
    expect((await readTaskPage(projectId)).tasks[0]?.state).toBe('blocked');
    await expect(readTaskPage(projectId, 'b:7:1')).rejects.toThrow('REMOTE_PROJECT_MISMATCH');
    await expect(readTaskPage(projectId, 'b:7:1/../../private')).rejects.toThrow('REMOTE_INVALID_CURSOR');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/projects/${projectId}/tasks?limit=50`,
      `/v1/projects/${projectId}/tasks?limit=50&cursor=b%3A7%3A1`,
    ]);
  });

  it('validates the authorized Task, activity and bounded redacted Diff paths', async () => {
    const task = { id: taskId, projectId, title: '真实任务', state: 'todo',
      boardColumn: 'todo', revision: 1, contractRevision: 2,
      approvedRevision: 2, activeRunId: null, blockReason: null,
      allowedCommands: [] };
    const contract = { schemaVersion: '1.0', taskId, projectId, revision: 2,
      title: '真实任务', type: 'feature', goal: 'Inspect real changes',
      acceptance: [{ id: 'AC-01', statement: 'Check the file', method: 'inspection',
        required: true, sourceRefs: [] }], constraints: [], scope: [], outOfScope: [],
      dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
      workflowRef: 'standard@1', priority: 'normal' };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, { task, contract,
      runIds: [], artifactIds: [], pendingApprovalIds: [], evidence: [] }))
      .mockResolvedValueOnce(reply(200, { taskId, items: [{ cursor: 7,
        runId: taskId, type: 'run.started', text: 'Started',
        timestamp: new Date().toISOString() }],
      page: { cursor: 'o:7', hasMore: true } }))
      .mockResolvedValueOnce(reply(200, { taskId, available: true, runId: taskId,
        files: [{ path: 'src/math.ts', status: 'modified' }], textChunk: 'redacted diff',
        nextCursor: 'd:aaaaaaaaaaaaaaaa:13', truncated: false,
        capturedAt: new Date().toISOString() }));
    vi.stubGlobal('fetch', fetch);
    expect((await readTaskDetail(taskId)).contract.goal).toBe('Inspect real changes');
    expect((await readTaskActivity(taskId)).items[0]?.text).toBe('Started');
    expect((await readTaskDiff(taskId)).textChunk).toBe('redacted diff');
    await expect(readTaskDiff(taskId, 'd:../private:3')).rejects.toThrow('REMOTE_INVALID_CURSOR');
    expect(fetch.mock.calls.map((item) => item[0])).toEqual([
      `/v1/tasks/${taskId}`, `/v1/tasks/${taskId}/activity?limit=20`,
      `/v1/tasks/${taskId}/diff?limit=4096`,
    ]);
  });

  it('distinguishes an unavailable Host from a stale task cursor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(503, {
      code: 'REMOTE_HOST_UNAVAILABLE',
    })).mockResolvedValueOnce(reply(409, { code: 'REMOTE_CURSOR_STALE' }));
    vi.stubGlobal('fetch', fetch);
    await expect(readTaskDiff(taskId)).rejects.toThrow('REMOTE_GATEWAY_UNAVAILABLE');
    await expect(readTaskDiff(taskId)).rejects.toThrow('REMOTE_CURSOR_STALE');
  });
});
