<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { ForgeButton, ForgeCard } from '@forge/ui';
import { RemoteStreamTransport, browserMobilePlatformBridge,
  type MobilePlatformBridge, type RemoteStreamState } from '@forge/client';
import type { RemoteApprovalPage, RemoteProjectPage, RemoteTaskActivityPage,
  RemoteNotificationPage, RemoteTaskDetail, RemoteTaskDiffPage, RemoteTaskPage } from '@forge/contracts';
import { mobileTabHref, parseMobileRoute, type MobileTab } from './routes';
import { checkPairing, claimPairing, currentSession, revokeSession,
  type MobileSession } from './pairing';
import { readApprovals, readNotifications, readProjectPage, readTaskActivity, readTaskDetail,
  readTaskDiff, readTaskPage } from './read';
import MobileApproval from './MobileApproval.vue';
import MobileMessages from './MobileMessages.vue';
import { clearMobileShellCache, registerMobileShell } from './pwa';
import { clearRedactedSummary, readRedactedSummary, saveRedactedSummary } from './offline-summary';
import { clearMessageDraft, readMessageDraft } from './message-draft';

const props = defineProps<{
  theme: 'light' | 'dark';
  reduceTransparency: boolean;
  reduceMotion: boolean;
  platformBridge?: MobilePlatformBridge;
}>();
const platformBridge = computed(() => props.platformBridge ?? browserMobilePlatformBridge);
const route = ref(parseMobileRoute(typeof location === 'undefined' ? '' : location.hash));
const remoteState = ref<'checking' | 'unavailable' | 'unpaired' | 'pending' | 'connected'>('checking');
const session = ref<MobileSession | null>(null);
const claimSecret = ref<string | null>(null);
const nonce = ref('');
const deviceLabel = ref('');
const pairingBusy = ref(false);
const pairingMessage = ref('');
const cacheMessage = ref('');
const shellRegistered = ref<boolean | null>(null);
const offlineSummary = ref(readRedactedSummary());
const cacheBusy = ref(false);
const lastConfirmedAt = ref<string | null>(null);
const projects = ref<RemoteProjectPage['items']>([]);
const projectCursor = ref<string | null>(null);
const moreProjects = ref(false);
const selectedProjectId = ref<string | null>(null);
const board = ref<RemoteTaskPage | null>(null);
const taskCursor = ref<string | null>(null);
const moreTasks = ref(false);
const approvals = ref<RemoteApprovalPage['items']>([]);
const approvalCursor = ref<string | null>(null);
const moreApprovals = ref(false);
const approvalOutcome = ref('');
const readBusy = ref(false);
const readMessage = ref('');
const lastSnapshotAt = ref<string | null>(null);
const streamState = ref<RemoteStreamState>('stopped');
const streamIssue = ref('');
const notificationsOpen = ref(false);
const notifications = ref<RemoteNotificationPage['items']>([]);
const notificationBusy = ref(false);
const notificationMessage = ref('');
const detail = ref<RemoteTaskDetail | null>(null);
const detailBusy = ref(false);
const detailMessage = ref('');
const activity = ref<RemoteTaskActivityPage['items']>([]);
const activityCursor = ref<string | null>(null);
const diff = ref<RemoteTaskDiffPage | null>(null);
const diffText = ref('');
const diffCursor = ref<string | null>(null);
const diffFold = ref<HTMLDetailsElement | null>(null);
const diffPreview = ref<HTMLElement | null>(null);
let detailGeneration = 0;
let readGeneration = 0;
let notificationGeneration = 0;
let sessionCheckGeneration = 0;
let lastAuthorizedSession: MobileSession | null = null;
let shellCheckGeneration = 0;
let sessionExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let stream: RemoteStreamTransport | null = null;
let streamProjectId: string | null = null;
const notificationLabel: Record<RemoteNotificationPage['items'][number]['type'], string> = {
  'board.changed': '任务看板已更新', 'run.changed': '运行状态已更新',
  'approval.changed': '审批状态已更新', 'review.changed': '审查状态已更新',
  'verify.changed': '验证状态已更新', 'acceptance.changed': '人工验收已更新',
  'conversation.changed': '消息已更新', 'draft.changed': '任务草稿已更新',
};
const tabs: { id: MobileTab; title: string; icon: string }[] = [
  { id: 'inbox', title: '待处理', icon: '◌' },
  { id: 'tasks', title: '任务', icon: '▤' },
  { id: 'messages', title: '消息', icon: '⌁' },
  { id: 'account', title: '连接', icon: '◇' },
];
const title = computed(() => route.value.taskId ? '任务详情' :
  tabs.find((item) => item.id === route.value.tab)?.title ?? '待处理');
const relevantTasks = computed(() => {
  const tasks = board.value?.tasks ?? [];
  return route.value.tab === 'inbox'
    ? tasks.filter((item) => item.state === 'awaiting_acceptance' || item.state === 'blocked')
      .sort((a, b) => Number(b.state === 'awaiting_acceptance') - Number(a.state === 'awaiting_acceptance'))
    : tasks;
});
const relevantApprovals = computed(() => approvals.value.filter((item) =>
  item.projectId === selectedProjectId.value));
const taskStateLabel: Record<RemoteTaskPage['tasks'][number]['state'], string> = {
  draft: '草稿', todo: '待开始', active: '进行中', blocked: '已阻塞',
  awaiting_acceptance: '待人工验收', done: '已完成', cancelled: '已取消',
  archived: '已归档',
};
const boardColumnLabel: Record<RemoteTaskPage['tasks'][number]['boardColumn'], string> = {
  todo: 'TODO', development: '开发', review: '审查', verify: '验证', done: '完成',
};
const evidenceLabel: Record<RemoteTaskDetail['evidence'][number]['kind'], string> = {
  review: '审查', verify: '验证', owner: '人工验收', delivery: '交付记录',
};
function syncRoute(): void {
  const previousTask = route.value.taskId;
  route.value = parseMobileRoute(location.hash);
  if (!route.value.taskId && previousTask) clearDetail();
  if (route.value.taskId && route.value.taskId !== previousTask && session.value &&
      remoteState.value === 'connected') {
    void loadTaskDetail(route.value.taskId);
  }
}
function navigate(tab: MobileTab): void {
  location.hash = mobileTabHref(tab);
  syncRoute();
}
function openTask(taskId: string): void {
  if (remoteState.value !== 'connected') return;
  location.hash = `#/m/tasks/${taskId}`;
  syncRoute();
}
function clearDetail(): void {
  detailGeneration += 1;
  detailBusy.value = false; detail.value = null; detailMessage.value = '';
  activity.value = []; activityCursor.value = null;
  diff.value = null; diffText.value = ''; diffCursor.value = null;
}
function stopStream(): void {
  stream?.stop(); stream = null; streamProjectId = null;
  streamState.value = 'stopped';
  streamIssue.value = '';
}
function clearRemoteData(): void {
  stopStream();
  readGeneration += 1;
  notificationGeneration += 1;
  clearDetail();
  readBusy.value = false;
  projects.value = []; projectCursor.value = null; moreProjects.value = false;
  selectedProjectId.value = null; board.value = null; lastSnapshotAt.value = null;
  taskCursor.value = null; moreTasks.value = false;
  approvals.value = []; approvalCursor.value = null; moreApprovals.value = false;
  approvalOutcome.value = '';
  readMessage.value = '';
  notifications.value = []; notificationsOpen.value = false;
  notificationBusy.value = false; notificationMessage.value = '';
}
function fenceAuthorizedReads(): void {
  stopStream();
  readGeneration += 1; notificationGeneration += 1;
  clearDetail();
  readBusy.value = false; notificationBusy.value = false;
  board.value = null; taskCursor.value = null; moreTasks.value = false;
  approvals.value = []; approvalCursor.value = null; moreApprovals.value = false;
  approvalOutcome.value = ''; notifications.value = []; notificationMessage.value = '';
  lastSnapshotAt.value = null; readMessage.value = '';
}
function sameProjects(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}
function updateOfflineSummary(): void {
  if (!session.value || !selectedProjectId.value || !board.value) return;
  offlineSummary.value = saveRedactedSummary(session.value, {
    viewedProjectCount: projects.value.length,
    viewedTaskCount: board.value.tasks.length,
    pendingApprovalCount: approvals.value.filter((item) =>
      item.projectId === selectedProjectId.value).length,
    blockedTaskCount: board.value.tasks.filter((item) => item.state === 'blocked').length,
    partial: moreProjects.value || moreTasks.value || moreApprovals.value,
  });
}
function forgetOfflineSummary(): void {
  clearRedactedSummary();
  offlineSummary.value = null;
}
function readFailure(error: unknown, hadSnapshot: boolean): void {
  stopStream();
  readGeneration += 1;
  notificationGeneration += 1;
  readBusy.value = false; notificationBusy.value = false;
  session.value = null;
  notifications.value = []; notificationsOpen.value = false;
  if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE') {
    lastAuthorizedSession = null;
    remoteState.value = 'unpaired';
    clearMessageDraft();
    forgetOfflineSummary();
    clearRemoteData();
    pairingMessage.value = '授权已失效，请重新配对。';
    void refreshSession();
  } else {
    remoteState.value = 'unavailable';
    clearDetail();
    detailMessage.value = '连接中断。任务详情与差异已隐藏，请重新连接读取权威版本。';
    readMessage.value = hadSnapshot
      ? '连接中断。以下仅显示上次确认的只读快照。'
      : '无法从 Host 读取数据；请重新检查连接。';
  }
}
function connectionFailed(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error instanceof TypeError || error.name === 'AbortError' || [
    'REMOTE_GATEWAY_UNAVAILABLE', 'REMOTE_SECURE_ORIGIN_REQUIRED',
  ].includes(error.message);
}
async function loadTaskDetail(taskId: string): Promise<void> {
  if (!session.value || remoteState.value !== 'connected') return;
  const generation = ++detailGeneration;
  detailBusy.value = true;
  detailMessage.value = '';
  try {
    const [current, events, preview] = await Promise.all([
      readTaskDetail(taskId), readTaskActivity(taskId), readTaskDiff(taskId),
    ]);
    if (generation !== detailGeneration || route.value.taskId !== taskId || !session.value) return;
    if (!session.value.projectIds.includes(current.task.projectId)) {
      throw new Error('REMOTE_PROJECT_MISMATCH');
    }
    detail.value = current;
    activity.value = events.items; activityCursor.value = events.page.cursor;
    diff.value = preview; diffText.value = preview.textChunk;
    diffCursor.value = preview.nextCursor;
  } catch (error) {
    if (generation === detailGeneration) {
      if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE' ||
          connectionFailed(error)) {
        readFailure(error, board.value !== null);
      } else {
        clearDetail();
        detailMessage.value = '无法读取当前任务详情；请检查连接或项目授权。';
      }
    }
  } finally { if (generation === detailGeneration) detailBusy.value = false; }
}
async function loadMoreActivity(): Promise<void> {
  const taskId = route.value.taskId;
  if (!taskId || !activityCursor.value || !session.value || detailBusy.value ||
      remoteState.value !== 'connected') return;
  const generation = detailGeneration;
  detailBusy.value = true;
  try {
    const page = await readTaskActivity(taskId, activityCursor.value);
    if (generation !== detailGeneration || !session.value) return;
    activity.value = [...activity.value, ...page.items.filter((item) =>
      !activity.value.some((old) => old.cursor === item.cursor))];
    activityCursor.value = page.page.cursor;
  } catch (error) {
    if (generation === detailGeneration) {
      if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE' ||
          connectionFailed(error)) {
        readFailure(error, board.value !== null);
      } else detailMessage.value = '活动翻页失败，请重新读取详情。';
    }
  } finally { if (generation === detailGeneration) detailBusy.value = false; }
}
async function loadMoreDiff(): Promise<void> {
  const taskId = route.value.taskId;
  if (!taskId || !diffCursor.value || !session.value || detailBusy.value ||
      remoteState.value !== 'connected') return;
  const generation = detailGeneration;
  detailBusy.value = true;
  try {
    const page = await readTaskDiff(taskId, diffCursor.value);
    if (generation !== detailGeneration || !session.value) return;
    if (page.runId !== diff.value?.runId) throw new Error('REMOTE_CURSOR_STALE');
    diffText.value += page.textChunk;
    diffCursor.value = page.nextCursor;
  } catch (error) {
    if (generation === detailGeneration) {
      if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE' ||
          connectionFailed(error)) {
        readFailure(error, board.value !== null);
      } else {
        diffText.value = ''; diffCursor.value = null; diff.value = null;
        detailMessage.value = '差异版本已变化或无法读取；请刷新任务详情。';
      }
    }
  } finally { if (generation === detailGeneration) detailBusy.value = false; }
}
async function jumpToFile(path: string): Promise<void> {
  if (!diff.value?.files.some((item) => item.path === path)) return;
  while (!diffText.value.includes(path) && diffCursor.value &&
         remoteState.value === 'connected') {
    const before = diffCursor.value;
    await loadMoreDiff();
    if (diffCursor.value === before) break;
  }
  await nextTick();
  if (diffFold.value) diffFold.value.open = true;
  const element = diffPreview.value;
  if (!element) return;
  const index = diffText.value.indexOf(path);
  if (index >= 0) {
    const lines = diffText.value.slice(0, index).split('\n').length - 1;
    element.scrollTop = lines * Math.max(1, Number.parseFloat(getComputedStyle(element).lineHeight));
    element.scrollIntoView({ block: 'nearest' });
  } else detailMessage.value = '该文件的文字差异不在当前预览中。';
}
async function loadBoard(projectId: string, generation: number): Promise<void> {
  try {
    const snapshot = await readTaskPage(projectId);
    if (generation !== readGeneration || selectedProjectId.value !== projectId ||
        remoteState.value !== 'connected' ||
        !session.value?.projectIds.includes(projectId)) return;
    board.value = snapshot;
    taskCursor.value = snapshot.page.cursor;
    moreTasks.value = snapshot.page.hasMore;
    lastSnapshotAt.value = new Date().toLocaleString();
    updateOfflineSummary();
    readMessage.value = '';
    startStream(projectId);
  } catch (error) {
    if (generation === readGeneration) readFailure(error, board.value !== null);
  }
}
async function loadNotifications(projectId: string): Promise<void> {
  if (!session.value || remoteState.value !== 'connected') return;
  const generation = ++notificationGeneration;
  notificationBusy.value = true;
  notificationMessage.value = '';
  try {
    const page = await readNotifications(projectId);
    if (generation !== notificationGeneration || selectedProjectId.value !== projectId ||
        !session.value) return;
    notifications.value = page.items;
  } catch (error) {
    if (generation !== notificationGeneration || selectedProjectId.value !== projectId ||
        !session.value) return;
    notifications.value = [];
    notificationMessage.value = '无法读取当前通知；请重新检查连接或项目授权。';
    if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE' ||
        connectionFailed(error)) readFailure(error, board.value !== null);
  } finally { if (generation === notificationGeneration) notificationBusy.value = false; }
}
function toggleNotifications(): void {
  notificationsOpen.value = !notificationsOpen.value;
  if (notificationsOpen.value && selectedProjectId.value) {
    void loadNotifications(selectedProjectId.value);
  } else {
    notificationGeneration += 1;
    notificationBusy.value = false;
  }
}
async function refreshFromStream(projectId: string, eventId?: string): Promise<string> {
  if (!session.value || remoteState.value !== 'connected' || selectedProjectId.value !== projectId) {
    throw new Error('REMOTE_SESSION_UNAVAILABLE');
  }
  const generation = ++readGeneration;
  readBusy.value = true;
  try {
    const [snapshot, pending] = await Promise.all([
      readTaskPage(projectId), readApprovals(),
    ]);
    if (snapshot.projectId !== projectId ||
        pending.items.some((item) => !session.value?.projectIds.includes(item.projectId)) ||
        (eventId && BigInt(snapshot.eventCursor.slice(2)) < BigInt(eventId.slice(2)))) {
      throw new Error('REMOTE_SNAPSHOT_STALE');
    }
    if (generation !== readGeneration || selectedProjectId.value !== projectId || !session.value) {
      throw new Error('REMOTE_SNAPSHOT_STALE');
    }
    board.value = snapshot;
    taskCursor.value = snapshot.page.cursor; moreTasks.value = snapshot.page.hasMore;
    approvals.value = pending.items;
    approvalCursor.value = pending.page.cursor; moreApprovals.value = pending.page.hasMore;
    // The optional in-app notification list cannot block authoritative Task
    // and Approval refresh or hold the event cursor behind a transient error.
    if (notificationsOpen.value) void loadNotifications(projectId);
    lastSnapshotAt.value = new Date().toLocaleString();
    readMessage.value = '';
    updateOfflineSummary();
    if (route.value.taskId) void loadTaskDetail(route.value.taskId);
    return snapshot.eventCursor;
  } catch (error) {
    readMessage.value = '实时更新暂未确认；正在重试读取 Host 权威状态。';
    throw error;
  } finally { if (generation === readGeneration) readBusy.value = false; }
}
function startStream(projectId: string): void {
  if (!board.value || !session.value || remoteState.value !== 'connected') return;
  if (stream && streamProjectId === projectId) return;
  stopStream();
  const current = new RemoteStreamTransport(projectId, board.value.eventCursor, {
    onInvalidation: async (event) => { await refreshFromStream(projectId, event.id); },
    onResync: async () => refreshFromStream(projectId),
    onState: (state) => {
      if (streamProjectId !== projectId) return;
      streamState.value = state;
      if (state === 'unauthorized') {
        stopStream(); void refreshSession();
      } else if (state === 'connected' && remoteState.value === 'unavailable') {
        void refreshSession();
      }
    },
    onIssue: (code) => { if (streamProjectId === projectId) streamIssue.value = code; },
  }, undefined, undefined, session.value.policyRevision);
  stream = current; streamProjectId = projectId; current.start();
}
async function loadMoreTasks(): Promise<void> {
  const projectId = selectedProjectId.value;
  if (!session.value || remoteState.value !== 'connected' || !projectId ||
      !board.value || !moreTasks.value || !taskCursor.value || readBusy.value) return;
  readBusy.value = true;
  const generation = readGeneration;
  try {
    const page = await readTaskPage(projectId, taskCursor.value);
    if (generation !== readGeneration || !board.value || !session.value) return;
    if (page.boardRevision !== board.value.boardRevision) throw new Error('REMOTE_CURSOR_STALE');
    board.value = { ...page, tasks: [...board.value.tasks, ...page.tasks.filter((item) =>
      !board.value?.tasks.some((current) => current.id === item.id))] };
    taskCursor.value = page.page.cursor;
    moreTasks.value = page.page.hasMore;
    lastSnapshotAt.value = new Date().toLocaleString();
    updateOfflineSummary();
  } catch (error) {
    if (generation === readGeneration) {
      if (error instanceof Error && error.message === 'REMOTE_CURSOR_STALE') {
        readMessage.value = '看板版本在翻页时变化；请刷新权威快照。';
      } else readFailure(error, board.value !== null);
    }
  } finally { if (generation === readGeneration) readBusy.value = false; }
}
async function loadApprovals(more = false, generation = readGeneration): Promise<void> {
  try {
    const page = await readApprovals(more ? approvalCursor.value ?? undefined : undefined);
    if (generation !== readGeneration || !session.value) return;
    if (page.items.some((item) => !session.value?.projectIds.includes(item.projectId))) {
      throw new Error('REMOTE_PROJECT_MISMATCH');
    }
    approvals.value = more ? [...approvals.value, ...page.items.filter((item) =>
      !approvals.value.some((current) => current.approvalId === item.approvalId))] : page.items;
    approvalCursor.value = page.page.cursor;
    moreApprovals.value = page.page.hasMore;
    updateOfflineSummary();
  } catch (error) {
    if (generation === readGeneration) readFailure(error, board.value !== null);
  }
}
async function loadMoreApprovals(): Promise<void> {
  if (!session.value || remoteState.value !== 'connected' || !moreApprovals.value || readBusy.value) return;
  readBusy.value = true;
  await loadApprovals(true);
  readBusy.value = false;
}
async function loadProjects(more = false): Promise<void> {
  if (!session.value || remoteState.value !== 'connected' || readBusy.value) return;
  readBusy.value = true;
  const generation = ++readGeneration;
  try {
    const page = await readProjectPage(more ? projectCursor.value ?? undefined : undefined);
    if (generation !== readGeneration || !session.value) return;
    if (page.items.some((item) => !session.value?.projectIds.includes(item.id))) {
      throw new Error('REMOTE_PROJECT_MISMATCH');
    }
    projects.value = more ? [...projects.value, ...page.items.filter((item) =>
      !projects.value.some((current) => current.id === item.id))] : page.items;
    projectCursor.value = page.page.cursor;
    moreProjects.value = page.page.hasMore;
    if (!more || !selectedProjectId.value) {
      if (!projects.value.some((item) => item.id === selectedProjectId.value)) {
        selectedProjectId.value = projects.value[0]?.id ?? null;
      }
      board.value = null; taskCursor.value = null; moreTasks.value = false;
    }
    readMessage.value = '';
    if (selectedProjectId.value && !more) await loadBoard(selectedProjectId.value, generation);
    if (!more && session.value && remoteState.value === 'connected') {
      await loadApprovals(false, generation);
    }
  } catch (error) {
    if (generation === readGeneration) readFailure(error, board.value !== null);
  } finally { if (generation === readGeneration) readBusy.value = false; }
}
function selectProject(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (!projects.value.some((item) => item.id === value) || remoteState.value !== 'connected') return;
  selectedProjectId.value = value;
  stopStream(); notificationGeneration += 1;
  notifications.value = []; notificationsOpen.value = false;
  notificationBusy.value = false;
  board.value = null; taskCursor.value = null; moreTasks.value = false;
  lastSnapshotAt.value = null;
  const generation = ++readGeneration;
  void loadBoard(value, generation);
}
function refreshData(): void { void loadProjects(); }
function approvalSucceeded(receipt: { result: { taskId: string; state: 'todo' } }): void {
  approvalOutcome.value = `Host 已确认任务 ${receipt.result.taskId.slice(0, 8)} 进入 TODO；不会自动开工。`;
  void loadProjects();
}
function approvalStale(): void {
  approvalOutcome.value = '审批已失效或版本变化；已重新读取 Host 的权威列表。';
  void loadProjects();
}
async function refreshSession(): Promise<void> {
  const checkGeneration = ++sessionCheckGeneration;
  try {
    const current = await currentSession();
    if (checkGeneration !== sessionCheckGeneration) return;
    const previous = lastAuthorizedSession;
    if (current && previous) {
      const deviceChanged = previous.deviceId !== current.deviceId;
      const projectsChanged = !sameProjects(previous.projectIds, current.projectIds);
      if (deviceChanged || projectsChanged) {
        clearRemoteData(); forgetOfflineSummary(); clearMessageDraft();
      } else if (previous.sessionId !== current.sessionId ||
                 previous.policyRevision !== current.policyRevision ||
                 remoteState.value !== 'connected') {
        // A new session or grant revision must not inherit responses requested
        // under the prior identity. Keep same-device unsent local text mounted.
        fenceAuthorizedReads();
      }
    }
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
    session.value = current;
    lastAuthorizedSession = current;
    if (current) {
      if (offlineSummary.value && offlineSummary.value.deviceId !== current.deviceId) {
        forgetOfflineSummary();
      }
      const remaining = Date.parse(current.expiresAt) - Date.now();
      if (remaining <= 0) { session.value = null; lastAuthorizedSession = null; }
      else sessionExpiryTimer = setTimeout(() => {
        session.value = null;
        lastAuthorizedSession = null;
        remoteState.value = 'unpaired';
        clearMessageDraft();
        forgetOfflineSummary();
        clearRemoteData();
        pairingMessage.value = '会话已到期，请重新配对。';
      }, remaining);
    }
    remoteState.value = session.value ? 'connected' : 'unpaired';
    if (session.value) {
      lastConfirmedAt.value = new Date().toLocaleString();
      await loadProjects();
      if (route.value.taskId && session.value) await loadTaskDetail(route.value.taskId);
    } else { clearMessageDraft(); forgetOfflineSummary(); clearRemoteData(); }
  } catch (error) {
    if (checkGeneration !== sessionCheckGeneration) return;
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
    session.value = null;
    if (error instanceof Error && error.message === 'REMOTE_AUTH_REVOKED') {
      lastAuthorizedSession = null;
      remoteState.value = 'unpaired';
      clearRemoteData();
      shellCheckGeneration += 1;
      let cleared = false;
      try { cleared = await clearMobileShellCache(); } catch { cleared = false; }
      offlineSummary.value = null;
      if (cleared) shellRegistered.value = false;
      pairingMessage.value = cleared
        ? 'Desktop 已撤销此设备；本机脱敏摘要和 Forge 静态缓存已清除。'
        : 'Desktop 已撤销此设备；无法确认静态缓存已清除，请清除此站点数据。';
      return;
    }
    readFailure(error, board.value !== null);
  }
}
async function beginPairing(): Promise<void> {
  if (remoteState.value !== 'unpaired' || pairingBusy.value) return;
  pairingBusy.value = true;
  pairingMessage.value = '';
  try {
    const claim = await claimPairing(nonce.value.trim(), deviceLabel.value);
    claimSecret.value = claim.claimSecret;
    nonce.value = '';
    remoteState.value = 'pending';
    pairingMessage.value = '配对请求已发送。请在 Forge Desktop 上核对设备与项目权限并确认。';
  } catch { pairingMessage.value = '配对请求未被接受。请检查一次性代码、设备名称和 Host 状态。'; }
  finally { pairingBusy.value = false; }
}
async function checkApproval(): Promise<void> {
  if (!claimSecret.value || pairingBusy.value) return;
  pairingBusy.value = true;
  try {
    const result = await checkPairing(claimSecret.value);
    if (result.status === 'approved') {
      claimSecret.value = null;
      await refreshSession();
      pairingMessage.value = session.value ? '设备已由 Desktop 确认。' : '确认已完成，但本机会话不可用。';
    } else if (result.status === 'expired') {
      claimSecret.value = null;
      remoteState.value = 'unpaired';
      pairingMessage.value = '配对已过期，请在 Desktop 重新生成一次性代码。';
    } else pairingMessage.value = '仍在等待 Desktop 的人工确认。';
  } catch {
    claimSecret.value = null;
    remoteState.value = 'unpaired';
    pairingMessage.value = '配对已被拒绝或不可用，请在 Desktop 重新开始。';
  } finally { pairingBusy.value = false; }
}
async function disconnect(): Promise<void> {
  if (!session.value || pairingBusy.value) return;
  pairingBusy.value = true;
  try {
    await revokeSession(session.value.csrfToken);
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
    session.value = null;
    lastAuthorizedSession = null;
    remoteState.value = 'unpaired';
    clearRemoteData();
    offlineSummary.value = null;
    shellCheckGeneration += 1;
    let cleared = false;
    try { cleared = await clearMobileShellCache(); } catch { cleared = false; }
    if (cleared) shellRegistered.value = false;
    pairingMessage.value = cleared
      ? '本机远程会话已撤销，Forge 静态外壳缓存已清除。'
      : '本机远程会话已撤销；无法确认浏览器缓存已清除，请在浏览器设置中清除此站点数据。';
  } catch {
    pairingMessage.value = '撤销失败。请在 Desktop 撤销此设备授权。';
    await refreshSession();
  }
  finally { pairingBusy.value = false; }
}
async function clearCache(): Promise<void> {
  if (cacheBusy.value) return;
  cacheBusy.value = true;
  shellCheckGeneration += 1;
  try {
    const cleared = await clearMobileShellCache();
    if (cleared) { shellRegistered.value = false; offlineSummary.value = null; }
    cacheMessage.value = cleared
      ? 'Forge 静态外壳缓存已清除；Host 项目、任务和审批数据未删除。'
      : '浏览器没有可管理的 Forge 静态缓存，或清除未完成。';
  } catch {
    cacheMessage.value = '缓存清除失败；请在浏览器设置中清除此站点数据。';
  } finally { cacheBusy.value = false; }
}
function onVisible(): void {
  if (document.visibilityState === 'visible') {
    void refreshSession();
  }
}
function onOnline(): void { void refreshSession(); }
function onOffline(): void {
  if (remoteState.value === 'connected') {
    readFailure(new TypeError('Network unavailable'), board.value !== null);
  }
}
function onWorkerReady(): void {
  const generation = ++shellCheckGeneration;
  void registerMobileShell().then((ready) => {
    if (generation === shellCheckGeneration) shellRegistered.value = ready;
  });
}
onMounted(() => { window.addEventListener('hashchange', syncRoute);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline); void refreshSession();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', onWorkerReady);
  }
  onWorkerReady(); });
onUnmounted(() => { window.removeEventListener('hashchange', syncRoute);
  sessionCheckGeneration += 1;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('controllerchange', onWorkerReady);
  }
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  stopStream();
  claimSecret.value = null; });
</script>

<template>
  <div class="mobile-app" :data-theme="theme" :data-reduce-transparency="reduceTransparency" :data-reduce-motion="reduceMotion">
    <header class="mobile-header">
      <div class="mobile-brand"><strong>Forge</strong><span>Companion</span></div>
      <span class="mobile-connection" :data-connected="remoteState === 'connected'">{{ remoteState === 'connected' ? '会话已验证' : 'Host 未连接' }}</span>
    </header>
    <main class="mobile-main" id="mobile-main">
      <div v-if="route.taskId" class="mobile-page-heading">
        <ForgeButton variant="ghost" size="sm" @click="navigate('tasks')">返回任务</ForgeButton>
        <p class="eyebrow">FORGE / TASK</p>
        <h1>{{ title }}</h1>
      </div>
      <div v-else class="mobile-page-heading">
        <p class="eyebrow">FORGE / {{ route.tab.toUpperCase() }}</p>
        <h1>{{ title }}</h1>
        <p>{{ session ? `已授权 ${session.projectIds.length} 个项目` :
          projects.length ? `上次授权 ${projects.length} 个项目 · 离线只读` : '尚未连接项目' }}</p>
      </div>
      <section v-if="route.taskId" class="mobile-detail" aria-label="任务详情">
        <p v-if="detailBusy" role="status">正在从 Host 读取任务、活动与差异…</p>
        <p v-if="detailMessage" class="mobile-read-warning" role="status">{{ detailMessage }}</p>
        <template v-if="detail">
          <ForgeCard tone="reading" class="mobile-detail-card">
            <span class="mobile-task-state">{{ taskStateLabel[detail.task.state] }} · 修订 {{ detail.task.contractRevision }}</span>
            <h2>{{ detail.contract.title }}</h2>
            <p>{{ detail.contract.goal }}</p>
            <p v-if="detail.task.blockReason" class="mobile-read-warning">{{ detail.task.blockReason }}</p>
            <p>已有运行 {{ detail.runIds.length }} 次 · 来源引用 {{ detail.contract.sourceRefs.length }} 项</p>
          </ForgeCard>
          <ForgeCard tone="reading" class="mobile-detail-card">
            <h2>验收条件</h2>
            <ol class="mobile-acceptance-list">
              <li v-for="criterion in detail.contract.acceptance" :key="criterion.id">
                <strong>{{ criterion.id }}</strong> · {{ criterion.statement }}
                <small>{{ criterion.method }} · {{ criterion.required ? '必需' : '可选' }}</small>
              </li>
            </ol>
          </ForgeCard>
          <ForgeCard tone="reading" class="mobile-detail-card">
            <h2>运行活动</h2>
            <p v-if="activity.length === 0">尚无可查看的运行活动。</p>
            <ol v-else class="mobile-activity-list">
              <li v-for="event in activity" :key="event.cursor">
                <span>{{ event.type }} · {{ event.timestamp }}</span>
                <p>{{ event.text }}</p>
              </li>
            </ol>
            <ForgeButton v-if="activityCursor" variant="secondary" size="sm"
              :disabled="remoteState !== 'connected' || detailBusy" @click="loadMoreActivity">更多活动</ForgeButton>
          </ForgeCard>
          <ForgeCard tone="reading" class="mobile-detail-card">
            <h2>留存证据</h2>
            <p class="mobile-read-note">按产生时间显示历史记录；版本变化后不能据此判定当前验收通过。</p>
            <p v-if="detail.evidence.length === 0">暂无审查、验证或人工验收记录。</p>
            <ol v-else class="mobile-activity-list">
              <li v-for="item in detail.evidence" :key="item.id">
                <span>{{ evidenceLabel[item.kind] }} · {{ item.createdAt }}</span>
                <p>{{ item.status }} · 快照 {{ item.snapshotId.slice(0, 8) }}</p>
              </li>
            </ol>
          </ForgeCard>
          <ForgeCard tone="reading" class="mobile-detail-card">
            <h2>代码差异</h2>
            <p v-if="!diff?.available">最新运行尚无可分享的 Diff；这里不会读取工作区文件。</p>
            <template v-else>
              <p>捕获时间：{{ diff.capturedAt }} · 文件 {{ diff.files.length }} 个{{ diff.truncated ? ' · 预览已截断' : '' }}</p>
              <div class="mobile-diff-files" aria-label="变更文件">
                <button v-for="file in diff.files" :key="file.path" type="button"
                  :disabled="remoteState !== 'connected' || detailBusy" @click="jumpToFile(file.path)">
                  <span>{{ file.status }}</span>{{ file.path }}
                </button>
              </div>
              <details ref="diffFold" class="mobile-diff-fold">
                <summary>展开纯文本差异</summary>
                <pre ref="diffPreview">{{ diffText || '本次仅有文件摘要，没有文字差异。' }}</pre>
                <ForgeButton v-if="diffCursor" variant="secondary" size="sm"
                  :disabled="remoteState !== 'connected' || detailBusy" @click="loadMoreDiff">加载更多差异</ForgeButton>
              </details>
            </template>
          </ForgeCard>
          <p class="mobile-read-note">这里只读展示 Host 保存的记录；代码、审批和运行控制不在详情页直接执行。</p>
        </template>
        <ForgeCard v-else-if="!detailBusy" tone="reading" class="mobile-state-card">
          <h2>无法读取权威任务详情</h2>
          <p>请连接并获得此项目授权后重试；不会展示其他项目的任务或本机文件。</p>
          <ForgeButton v-if="remoteState === 'connected'" variant="secondary" @click="loadTaskDetail(route.taskId)">重新读取</ForgeButton>
        </ForgeCard>
      </section>
      <ForgeCard v-else-if="route.tab === 'account'" tone="reading" class="mobile-state-card mobile-pairing" aria-live="polite">
        <h2>连接到可信 Host</h2>
        <p class="mobile-state-footnote">{{ platformBridge.kind === 'web' ? '浏览器 PWA' : '原生外壳' }} ·
          {{ platformBridge.push.available ? '原生推送适配器可用' : '原生推送未接入' }} ·
          {{ platformBridge.secureStore.available ? '原生安全存储适配器可用' : '原生安全存储未接入' }} ·
          {{ platformBridge.scanner.available ? '扫码适配器可用' : '扫码未接入' }}。站内通知需当前 Host 连接。</p>
        <p v-if="remoteState === 'checking'">正在检查同源 Host 会话…</p>
        <template v-else-if="remoteState === 'unavailable'">
          <p>当前页面没有可用的同源安全网关。请使用经授权的私网 HTTPS 地址；普通 Web 开发入口不能连接本机 Host。</p>
          <ForgeButton variant="secondary" @click="refreshSession">重新检查连接</ForgeButton>
        </template>
        <template v-else-if="remoteState === 'unpaired'">
          <p>先在 Desktop 创建一次性配对请求，再在这里输入代码。批准必须由 Desktop 人工完成。</p>
          <label>设备名称<input v-model="deviceLabel" autocomplete="off" maxlength="80" placeholder="例如：我的手机" /></label>
          <label>一次性配对代码<input v-model="nonce" autocomplete="off" spellcheck="false" placeholder="从 Desktop 输入一次性代码" /></label>
          <ForgeButton :disabled="pairingBusy || !deviceLabel.trim() || !nonce.trim()" @click="beginPairing">提交配对请求</ForgeButton>
        </template>
        <template v-else-if="remoteState === 'pending'">
          <p>等待 Desktop 确认设备、项目和操作权限。此页面不会自动批准。</p>
          <ForgeButton :disabled="pairingBusy" @click="checkApproval">检查确认结果</ForgeButton>
        </template>
        <template v-else-if="session">
          <p>设备 ID：{{ session.deviceId }}<br />已授权项目：{{ session.projectIds.length }}<br />会话到期：{{ session.expiresAt }}</p>
          <ForgeButton variant="secondary" :disabled="pairingBusy" @click="disconnect">断开本机会话</ForgeButton>
        </template>
        <p v-if="pairingMessage" role="status">{{ pairingMessage }}</p>
        <span class="mobile-state-footnote">{{ lastConfirmedAt ? `上次确认时间：${lastConfirmedAt}` : '上次确认时间：暂无' }}</span>
        <div class="mobile-cache-controls">
          <h3>离线外壳</h3>
          <p>{{ shellRegistered === null ? '正在确认静态外壳安装…' : shellRegistered ? '当前构建已注册静态外壳；离线时 Host 操作仍不可用。' : '当前浏览器未注册可用的静态外壳。' }}</p>
          <ForgeButton variant="secondary" size="sm" :disabled="cacheBusy" @click="clearCache">清除本机 Forge 缓存及未提交草稿</ForgeButton>
          <p v-if="cacheMessage" role="status">{{ cacheMessage }}</p>
        </div>
        <div v-if="remoteState === 'unavailable' && offlineSummary" class="mobile-offline-summary">
          <h3>上次确认的脱敏摘要</h3>
          <p>读取于 {{ new Date(offlineSummary.confirmedAt).toLocaleString() }}；现在无法验证 Host 授权，以下数字不能用于审批或运行。</p>
          <p>已读取项目 {{ offlineSummary.viewedProjectCount }} 个 · 任务 {{ offlineSummary.viewedTaskCount }} 项 · 待批准 {{ offlineSummary.pendingApprovalCount }} 项 · 阻塞 {{ offlineSummary.blockedTaskCount }} 项{{ offlineSummary.partial ? '（分页尚未读完）' : '' }}</p>
        </div>
      </ForgeCard>
      <section v-else-if="route.tab === 'messages' && (projects.length ||
        (remoteState === 'unavailable' && readMessageDraft()))" class="mobile-read-panel"
        aria-label="已授权项目消息">
        <ForgeCard v-if="projects.length" tone="reading" class="mobile-read-toolbar">
          <label>项目<select :value="selectedProjectId ?? ''" :disabled="remoteState !== 'connected'"
            @change="selectProject">
            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select></label>
        </ForgeCard>
        <p v-if="remoteState !== 'connected'" class="mobile-read-warning" role="status">
          Host 已断开。本机未提交草稿可继续编辑，无法向 Host 提交。
        </p>
        <MobileMessages :key="selectedProjectId ?? 'none'" :project-id="selectedProjectId"
          :session="session" :connected="remoteState === 'connected'"
          @session-refresh-required="refreshSession" />
      </section>
      <section v-else-if="!route.taskId && (route.tab === 'inbox' || route.tab === 'tasks') && projects.length" class="mobile-read-panel" aria-label="已授权项目任务">
        <ForgeCard tone="reading" class="mobile-read-toolbar">
          <label>项目<select :value="selectedProjectId ?? ''" :disabled="remoteState !== 'connected'" @change="selectProject">
            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select></label>
          <ForgeButton variant="secondary" size="sm" :disabled="readBusy" @click="remoteState === 'connected' ? refreshData() : refreshSession()">{{ remoteState === 'connected' ? '刷新' : '重新检查连接' }}</ForgeButton>
          <ForgeButton v-if="moreProjects" variant="ghost" size="sm" :disabled="remoteState !== 'connected' || readBusy" @click="loadProjects(true)">更多项目</ForgeButton>
        </ForgeCard>
        <p v-if="readBusy" role="status">正在从 Host 读取…</p>
        <p v-if="readMessage || remoteState !== 'connected'" class="mobile-read-warning" role="status">{{ readMessage || '连接已中断。以下是只读快照。' }}</p>
        <p class="mobile-read-time">{{ lastSnapshotAt ? `上次从 Host 确认：${lastSnapshotAt}` : '尚无已确认快照' }}</p>
        <p v-if="remoteState === 'connected'" class="mobile-read-note" role="status">
          {{ streamState === 'connected' ? '实时连接已建立；事件到达后重新读取 Host。' :
            streamState === 'connecting' ? '正在建立实时连接；仍可手动刷新。' :
            streamState === 'reconnecting' ? `实时连接正在重试（${streamIssue || '等待响应'}）；不会把旧快照当作新状态。` :
            '实时连接未启动；可手动刷新 Host。' }}
        </p>
        <p v-if="route.tab === 'inbox'" class="mobile-read-note">待批准草稿来自 Host 当前审批；点击后须重新审阅范围并人工确认。断线不提交，阻塞任务来自最新看板快照。</p>
        <template v-if="route.tab === 'inbox'">
          <ForgeCard tone="reading" class="mobile-notifications">
            <h2>站内通知</h2>
            <p>仅列出 Host 已提交的状态变化；关闭页面后没有后台推送。通知本身不是审批或执行结果。</p>
            <ForgeButton variant="secondary" size="sm" :disabled="remoteState !== 'connected' || notificationBusy"
              :aria-expanded="notificationsOpen" @click="toggleNotifications">
              {{ notificationsOpen ? '收起通知' : '查看通知' }}
            </ForgeButton>
            <template v-if="notificationsOpen">
              <p v-if="notificationBusy" role="status">正在读取 Host 通知…</p>
              <p v-if="notificationMessage" role="status">{{ notificationMessage }}</p>
              <p v-if="!notificationBusy && !notificationMessage && notifications.length === 0">当前没有已提交的通知。</p>
              <ol v-else class="mobile-activity-list">
                <li v-for="notice in notifications" :key="notice.id">
                  <strong>{{ notificationLabel[notice.type] }}</strong>
                  <span>{{ new Date(notice.occurredAt).toLocaleString() }} · {{ notice.id }}</span>
                  <ForgeButton v-if="notice.taskId" variant="ghost" size="sm" @click="openTask(notice.taskId)">查看任务</ForgeButton>
                </li>
              </ol>
            </template>
          </ForgeCard>
          <p v-if="approvalOutcome" role="status" class="mobile-read-note">{{ approvalOutcome }}</p>
          <MobileApproval v-for="approval in relevantApprovals" :key="approval.approvalId"
            :summary="approval" :session="session" :connected="remoteState === 'connected'"
            @approved="approvalSucceeded" @stale="approvalStale"
            @session-refresh-required="refreshSession"
            @connection-lost="readFailure($event, board !== null)" />
          <ForgeButton v-if="moreApprovals" variant="secondary" size="sm" :disabled="remoteState !== 'connected' || readBusy" @click="loadMoreApprovals">更多待批准</ForgeButton>
        </template>
        <ForgeCard v-if="board && relevantTasks.length === 0 && (route.tab !== 'inbox' || relevantApprovals.length === 0)" tone="reading" class="mobile-read-empty">
          <h2>{{ route.tab === 'inbox' ? '当前没有待处理的已批准任务' : '当前项目没有任务' }}</h2>
          <p>数据来自上次 Host 快照；此页面不会创建任务或自动执行。</p>
        </ForgeCard>
        <ForgeCard v-for="item in relevantTasks" :key="item.id" tone="reading" class="mobile-task-row">
          <span class="mobile-task-state">{{ taskStateLabel[item.state] }}</span>
          <h2>{{ item.title }}</h2>
          <p v-if="item.blockReason">{{ item.blockReason }}</p>
          <p>版本 {{ item.revision }} · {{ boardColumnLabel[item.boardColumn] }}</p>
          <ForgeButton variant="ghost" size="sm" :disabled="remoteState !== 'connected'" @click="openTask(item.id)">查看详情</ForgeButton>
        </ForgeCard>
        <ForgeButton v-if="moreTasks" variant="secondary" size="sm" :disabled="remoteState !== 'connected' || readBusy" @click="loadMoreTasks">更多任务</ForgeButton>
      </section>
      <ForgeCard v-else tone="reading" class="mobile-state-card" aria-live="polite">
        <span class="mobile-state-symbol" aria-hidden="true">◇</span>
        <h2>{{ session ? '当前没有可显示的项目数据' : '等待可信 Host 连接' }}</h2>
        <p v-if="route.tab === 'inbox'">待处理事项会来自已授权项目。离线时不会显示虚构的审批，也不会补发审批决定。</p>
        <p v-else-if="route.tab === 'tasks'">任务列表需要已配对的 Forge Host。此页面不会把本机文件当作远程项目。</p>
        <p v-else-if="route.tab === 'messages'">消息需要已授权项目和现有 Desktop 会话；当前无法提交。</p>
        <span class="mobile-state-footnote">{{ lastConfirmedAt ? `上次确认时间：${lastConfirmedAt}` : '上次确认时间：暂无' }}</span>
        <div v-if="remoteState === 'unavailable' && offlineSummary &&
                   (route.tab === 'inbox' || route.tab === 'tasks')" class="mobile-offline-summary">
          <h3>上次确认的脱敏摘要</h3>
          <p>读取于 {{ new Date(offlineSummary.confirmedAt).toLocaleString() }}；当前未验证 Host，不能审批或运行。</p>
          <p>已读取任务 {{ offlineSummary.viewedTaskCount }} 项 · 待批准 {{ offlineSummary.pendingApprovalCount }} 项 · 阻塞 {{ offlineSummary.blockedTaskCount }} 项{{ offlineSummary.partial ? '（分页尚未读完）' : '' }}</p>
        </div>
      </ForgeCard>
    </main>
    <nav class="mobile-nav" aria-label="手机主导航">
      <button v-for="item in tabs" :key="item.id" type="button"
        :aria-current="route.tab === item.id ? 'page' : undefined"
        :aria-label="item.title" @click="navigate(item.id)">
        <span class="mobile-nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.title }}</span>
      </button>
    </nav>
  </div>
</template>
