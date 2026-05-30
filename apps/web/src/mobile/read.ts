import { remoteApprovalDetailSchema, remoteApprovalPageSchema, remoteBoardSchema,
  remoteNotificationPageSchema,
  remoteConversationPageSchema,
  remoteMessagePageSchema,
  remoteDraftPageSchema,
  remoteProjectPageSchema,
  remoteTaskActivityPageSchema, remoteTaskDetailSchema, remoteTaskDiffPageSchema,
  remoteTaskPageSchema, type RemoteApprovalPage, type RemoteBoard,
  type RemoteConversationPage, type RemoteMessagePage, type RemoteDraftPage,
  type RemoteNotificationPage,
  type RemoteProjectPage, type RemoteApprovalDetail, type RemoteTaskActivityPage,
  type RemoteTaskDetail,
  type RemoteTaskDiffPage, type RemoteTaskPage } from '@forge/contracts';
import { allowedOrigin } from './pairing';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function read(path: string): Promise<unknown> {
  if (!allowedOrigin()) throw new Error('REMOTE_SECURE_ORIGIN_REQUIRED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      method: 'GET', credentials: 'same-origin', mode: 'same-origin',
      cache: 'no-store', redirect: 'error',
      headers: { 'X-Forge-Session': '1' }, signal: controller.signal,
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('REMOTE_SESSION_UNAVAILABLE');
    }
    if (response.status === 409) throw new Error('REMOTE_CURSOR_STALE');
    if (response.status === 503 || response.status === 504) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (!response.ok) throw new Error('REMOTE_READ_FAILED');
    return response.json();
  } finally { clearTimeout(timeout); }
}

export async function readProjectPage(cursor?: string): Promise<RemoteProjectPage> {
  if (cursor && !uuid.test(cursor)) throw new Error('REMOTE_INVALID_CURSOR');
  const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
  return remoteProjectPageSchema.parse(await read(`/v1/projects${query}`));
}

export async function readConversationPage(projectId: string, cursor?: string):
  Promise<RemoteConversationPage> {
  if (!uuid.test(projectId)) throw new Error('REMOTE_INVALID_PROJECT');
  if (cursor && !/^c:[a-f0-9]{16}:(0|[1-9][0-9]{0,15})$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
  const page = remoteConversationPageSchema.parse(
    await read(`/v1/projects/${projectId}/conversations${query}`));
  if (page.projectId !== projectId || page.items.some((item) => item.projectId !== projectId)) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  return page;
}

export async function readMessagePage(projectId: string, conversationId: string,
                                      cursor?: string): Promise<RemoteMessagePage> {
  if (!uuid.test(projectId) || !uuid.test(conversationId)) {
    throw new Error('REMOTE_INVALID_PROJECT');
  }
  if (cursor && !/^m:[1-9][0-9]{0,15}$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=20&cursor=${encodeURIComponent(cursor)}` : '?limit=20';
  const page = remoteMessagePageSchema.parse(await read(
    `/v1/projects/${projectId}/conversations/${conversationId}/messages${query}`));
  if (page.projectId !== projectId || page.conversationId !== conversationId ||
      page.items.some((item) => item.conversationId !== conversationId)) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  for (let index = 1; index < page.items.length; index += 1) {
    if (page.items[index]!.sequence <= page.items[index - 1]!.sequence) {
      throw new Error('REMOTE_MESSAGE_ORDER_INVALID');
    }
  }
  return page;
}

export async function readDraftPage(projectId: string, conversationId: string,
                                    cursor?: string): Promise<RemoteDraftPage> {
  if (!uuid.test(projectId) || !uuid.test(conversationId)) {
    throw new Error('REMOTE_INVALID_PROJECT');
  }
  if (cursor && !/^d:[1-9][0-9]{0,15}$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=20&cursor=${encodeURIComponent(cursor)}` : '?limit=20';
  const page = remoteDraftPageSchema.parse(await read(
    `/v1/projects/${projectId}/conversations/${conversationId}/drafts${query}`));
  if (page.projectId !== projectId || page.conversationId !== conversationId ||
      page.items.some((item) => item.projectId !== projectId ||
        item.conversationId !== conversationId ||
        item.contract && (item.contract.projectId !== projectId ||
          item.contract.taskId !== item.draftId || item.contract.revision !== item.revision))) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  return page;
}

export async function readBoard(projectId: string): Promise<RemoteBoard> {
  if (!uuid.test(projectId)) throw new Error('REMOTE_INVALID_PROJECT');
  const board = remoteBoardSchema.parse(await read(`/v1/projects/${projectId}/board`));
  if (board.projectId !== projectId || board.tasks.some((task) => task.projectId !== projectId)) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  return board;
}

export async function readNotifications(projectId: string): Promise<RemoteNotificationPage> {
  if (!uuid.test(projectId)) throw new Error('REMOTE_INVALID_PROJECT');
  const page = remoteNotificationPageSchema.parse(
    await read(`/v1/projects/${projectId}/notifications?limit=20`));
  if (page.projectId !== projectId || page.items.some((item) => item.projectId !== projectId)) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  return page;
}

export async function readApprovals(cursor?: string): Promise<RemoteApprovalPage> {
  if (cursor && !/^a:[1-9][0-9]{0,15}$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
  return remoteApprovalPageSchema.parse(await read(`/v1/approvals${query}`));
}

export async function readApprovalDetail(approvalId: string): Promise<RemoteApprovalDetail> {
  if (!uuid.test(approvalId)) throw new Error('REMOTE_INVALID_APPROVAL');
  const detail = remoteApprovalDetailSchema.parse(await read(`/v1/approvals/${approvalId}`));
  if (detail.approvalId !== approvalId || detail.taskId !== detail.contract.taskId ||
      detail.projectId !== detail.contract.projectId ||
      detail.expectedRevision !== detail.contract.revision) {
    throw new Error('REMOTE_APPROVAL_MISMATCH');
  }
  return detail;
}

export async function readTaskPage(projectId: string, cursor?: string): Promise<RemoteTaskPage> {
  if (!uuid.test(projectId)) throw new Error('REMOTE_INVALID_PROJECT');
  if (cursor && !/^b:(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
  const page = remoteTaskPageSchema.parse(await read(`/v1/projects/${projectId}/tasks${query}`));
  if (page.projectId !== projectId || page.tasks.some((task) => task.projectId !== projectId)) {
    throw new Error('REMOTE_PROJECT_MISMATCH');
  }
  return page;
}

export async function readTaskDetail(taskId: string): Promise<RemoteTaskDetail> {
  if (!uuid.test(taskId)) throw new Error('REMOTE_INVALID_TASK');
  const detail = remoteTaskDetailSchema.parse(await read(`/v1/tasks/${taskId}`));
  if (detail.task.id !== taskId || detail.contract.taskId !== taskId ||
      detail.contract.projectId !== detail.task.projectId ||
      detail.contract.revision !== detail.task.contractRevision) {
    throw new Error('REMOTE_TASK_MISMATCH');
  }
  return detail;
}

export async function readTaskActivity(taskId: string, cursor?: string):
  Promise<RemoteTaskActivityPage> {
  if (!uuid.test(taskId)) throw new Error('REMOTE_INVALID_TASK');
  if (cursor && !/^o:[1-9][0-9]{0,15}$/.test(cursor)) throw new Error('REMOTE_INVALID_CURSOR');
  const query = cursor ? `?limit=20&cursor=${encodeURIComponent(cursor)}` : '?limit=20';
  const page = remoteTaskActivityPageSchema.parse(await read(`/v1/tasks/${taskId}/activity${query}`));
  if (page.taskId !== taskId) throw new Error('REMOTE_TASK_MISMATCH');
  return page;
}

export async function readTaskDiff(taskId: string, cursor?: string): Promise<RemoteTaskDiffPage> {
  if (!uuid.test(taskId)) throw new Error('REMOTE_INVALID_TASK');
  if (cursor && !/^d:[a-f0-9]{16}:(0|[1-9][0-9]{0,15})$/.test(cursor)) {
    throw new Error('REMOTE_INVALID_CURSOR');
  }
  const query = cursor ? `?limit=4096&cursor=${encodeURIComponent(cursor)}` : '?limit=4096';
  const page = remoteTaskDiffPageSchema.parse(await read(`/v1/tasks/${taskId}/diff${query}`));
  if (page.taskId !== taskId) throw new Error('REMOTE_TASK_MISMATCH');
  return page;
}
