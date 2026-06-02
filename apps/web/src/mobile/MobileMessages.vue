<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ForgeButton, ForgeCard, ForgeInput, ForgeTextarea } from '@forge/ui';
import type { RemoteConversationPage, RemoteMessagePage, RemoteDraftPage,
  TaskContract } from '@forge/contracts';
import type { MobileSession } from './pairing';
import { readConversationPage, readMessagePage, readDraftPage } from './read';
import { createMessageCommand, readMessageReceipt, submitMessage,
  type MobileMessageCommand, type MobileMessageReceipt } from './message';
import { clearMessageDraft, readMessageDraft, saveMessageDraft,
  updateMessageDraft, type LocalMessageDraft } from './message-draft';
import { createDraftCommand, readDraftReceipt, reviseDraftCommand, submitDraft,
  type MobileDraftCommand, type MobileDraftReceipt } from './draft';

const props = defineProps<{
  projectId: string | null;
  session: MobileSession | null;
  connected: boolean;
}>();
const emit = defineEmits<{ sessionRefreshRequired: [] }>();
const conversations = ref<RemoteConversationPage['items']>([]);
const cursor = ref<string | null>(null);
const hostMessages = ref<RemoteMessagePage['items']>([]);
const messageCursor = ref<string | null>(null);
const messageListBusy = ref(false);
const messageListLoaded = ref(false);
const messageListNote = ref('');
const hostDrafts = ref<RemoteDraftPage['items']>([]);
const draftCursor = ref<string | null>(null);
const draftListBusy = ref(false);
const draftListLoaded = ref(false);
const draftListMessage = ref('');
const selectedId = ref('');
const text = ref('');
const busy = ref(false);
const message = ref('');
const lastSaved = ref<MobileMessageReceipt | null>(null);
const uncertain = ref<MobileMessageCommand | null>(null);
const savedDraft = ref<LocalMessageDraft | null>(readMessageDraft(props.session));
const draftTitle = ref('');
const draftGoal = ref('');
const draftCriterion = ref('');
const draftQuestions = ref('');
const draftType = ref<TaskContract['type']>('feature');
const draftPriority = ref<TaskContract['priority']>('normal');
const draftWorkflow = ref('standard@1');
const draftReason = ref('');
const draftBusy = ref(false);
const draftMessage = ref('');
const createdDraft = ref<MobileDraftReceipt | null>(null);
const activeContract = ref<TaskContract | null>(null);
const uncertainDraft = ref<MobileDraftCommand | null>(null);
let generation = 0;
let messageGeneration = 0;
let draftGeneration = 0;
let initialized = false;
let lastKnownDeviceId = props.session?.deviceId;
const selected = computed(() => conversations.value.find((item) =>
  item.conversationId === selectedId.value));
const draftInView = computed(() => savedDraft.value &&
  (!props.projectId || savedDraft.value.projectId === props.projectId)
  ? savedDraft.value : null);
const draftRevisionChanged = computed(() => {
  const previous = activeContract.value;
  return !!previous && (
    previous.title !== draftTitle.value.trim() ||
    previous.goal !== draftGoal.value.trim() ||
    previous.acceptance[0]?.statement !== draftCriterion.value.trim() ||
    previous.type !== draftType.value || previous.priority !== draftPriority.value ||
    previous.workflowRef !== draftWorkflow.value.trim()
  );
});
if (draftInView.value) {
  text.value = draftInView.value.text;
  selectedId.value = draftInView.value.conversationId;
}

async function refresh(more = false): Promise<void> {
  if (!props.connected || !props.session || !props.projectId || busy.value) return;
  const currentGeneration = ++generation;
  const projectId = props.projectId;
  const sessionId = props.session.sessionId;
  busy.value = true;
  message.value = '';
  try {
    const page = await readConversationPage(projectId, more ? cursor.value ?? undefined : undefined);
    if (currentGeneration !== generation || !props.connected ||
        props.projectId !== projectId || props.session?.sessionId !== sessionId) return;
    conversations.value = more ? [...conversations.value, ...page.items.filter((item) =>
      !conversations.value.some((old) => old.conversationId === item.conversationId))] : page.items;
    cursor.value = page.page.cursor;
    if (!conversations.value.some((item) => item.conversationId === selectedId.value)) {
      // A draft written for a vanished conversation must not be sent to the
      // first other conversation merely because a new session loaded it.
      const requiresChoice = !!text.value.trim();
      selectedId.value = requiresChoice ? '' : conversations.value[0]?.conversationId ?? '';
      if (requiresChoice) {
        message.value = '原会话不可用；请先核对内容，再明确选择新的会话。';
      }
      lastSaved.value = null; createdDraft.value = null; activeContract.value = null;
      messageGeneration += 1; draftGeneration += 1;
      hostMessages.value = []; messageCursor.value = null;
      messageListBusy.value = false; messageListLoaded.value = false;
      messageListNote.value = '';
      hostDrafts.value = []; draftCursor.value = null;
      draftListBusy.value = false; draftListLoaded.value = false;
      draftListMessage.value = '';
    }
  } catch (error) {
    if (currentGeneration !== generation || props.session?.sessionId !== sessionId) return;
    if (error instanceof Error && error.message === 'REMOTE_CURSOR_STALE') {
      message.value = '会话列表已变化，请重新读取 Host 数据。';
    } else {
      conversations.value = []; cursor.value = null; selectedId.value = '';
      messageGeneration += 1; draftGeneration += 1;
      hostMessages.value = []; messageCursor.value = null;
      messageListBusy.value = false; messageListLoaded.value = false;
      hostDrafts.value = []; draftCursor.value = null;
      draftListBusy.value = false; draftListLoaded.value = false;
      lastSaved.value = null; activeContract.value = null; createdDraft.value = null;
      message.value = '无法读取当前项目的会话。请检查连接和项目授权。';
    }
  } finally { if (currentGeneration === generation) busy.value = false; }
}

function choose(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (conversations.value.some((item) => item.conversationId === value)) {
    if (selectedId.value && value !== selectedId.value && (text.value.trim() ||
        draftRevisionChanged.value || draftReason.value.trim() ||
        (!activeContract.value && (draftTitle.value.trim() || draftGoal.value.trim() ||
          draftCriterion.value.trim())))) {
      (event.target as HTMLSelectElement).value = selectedId.value;
      message.value = '请先处理当前未提交消息或草稿修改，再切换会话，避免丢失或发错项目。';
      return;
    }
    selectedId.value = value;
    lastSaved.value = null;
    createdDraft.value = null; activeContract.value = null;
    uncertainDraft.value = null; draftMessage.value = '';
    messageGeneration += 1;
    hostMessages.value = []; messageCursor.value = null;
    messageListBusy.value = false; messageListLoaded.value = false;
    messageListNote.value = '';
    hostDrafts.value = []; draftCursor.value = null; draftListMessage.value = '';
    draftListLoaded.value = false;
  }
}

async function refreshMessages(more = false, afterWrite = false): Promise<void> {
  if (!props.connected || !props.session || !props.projectId || !selectedId.value ||
      (messageListBusy.value && !afterWrite)) return;
  const current = ++messageGeneration;
  const projectId = props.projectId;
  const conversationId = selectedId.value;
  const deviceId = props.session.deviceId;
  const sessionId = props.session.sessionId;
  messageListBusy.value = true; messageListNote.value = '';
  try {
    const page = await readMessagePage(projectId, conversationId,
      more ? messageCursor.value ?? undefined : undefined);
    if (current !== messageGeneration || !props.connected ||
        props.projectId !== projectId || selectedId.value !== conversationId ||
        props.session?.deviceId !== deviceId || props.session?.sessionId !== sessionId) return;
    hostMessages.value = more ? [...page.items.filter((item) =>
      !hostMessages.value.some((old) => old.messageId === item.messageId)),
      ...hostMessages.value] : page.items;
    messageCursor.value = page.page.cursor;
    messageListLoaded.value = true;
  } catch {
    if (current !== messageGeneration) return;
    hostMessages.value = []; messageCursor.value = null;
    messageListLoaded.value = false;
    messageListNote.value = '无法读取 Host 消息；请检查当前设备的 task:draft 授权和连接。';
  } finally { if (current === messageGeneration) messageListBusy.value = false; }
}

async function refreshDrafts(more = false, afterWrite = false): Promise<void> {
  if (!props.connected || !props.session || !props.projectId ||
      !selectedId.value || (draftListBusy.value && !afterWrite)) return;
  const current = ++draftGeneration;
  const projectId = props.projectId;
  const conversationId = selectedId.value;
  const deviceId = props.session.deviceId;
  const sessionId = props.session.sessionId;
  draftListBusy.value = true;
  draftListMessage.value = '';
  try {
    const page = await readDraftPage(projectId, conversationId,
      more ? draftCursor.value ?? undefined : undefined);
    if (current !== draftGeneration || !props.connected ||
        props.projectId !== projectId || selectedId.value !== conversationId ||
        props.session?.deviceId !== deviceId || props.session?.sessionId !== sessionId) return;
    hostDrafts.value = more ? [...hostDrafts.value, ...page.items.filter((item) =>
      !hostDrafts.value.some((old) => old.draftId === item.draftId))] : page.items;
    draftCursor.value = page.page.cursor;
    draftListLoaded.value = true;
    const active = hostDrafts.value.find((item) => item.draftId === activeContract.value?.taskId);
    if (active && (!active.canRevise || active.revision !== activeContract.value?.revision)) {
      activeContract.value = null; createdDraft.value = null;
      draftListMessage.value = '草稿版本或批准状态已变化；请重新审阅 Host 草稿。';
    }
  } catch {
    if (current !== draftGeneration) return;
    hostDrafts.value = []; draftCursor.value = null; draftListLoaded.value = false;
    draftListMessage.value = '无法读取当前会话草稿；请检查设备的 task:draft 授权和连接。';
  } finally { if (current === draftGeneration) draftListBusy.value = false; }
}

function openHostDraft(item: RemoteDraftPage['items'][number]): void {
  if (!item.canRevise || !item.contract || item.conversationId !== selectedId.value ||
      !props.connected || uncertainDraft.value) return;
  const contract = item.contract;
  activeContract.value = contract;
  createdDraft.value = null; lastSaved.value = null;
  draftTitle.value = contract.title; draftGoal.value = contract.goal;
  draftCriterion.value = contract.acceptance[0]?.statement ?? '';
  draftQuestions.value = contract.openQuestions.join('\n');
  draftType.value = contract.type; draftPriority.value = contract.priority;
  draftWorkflow.value = contract.workflowRef; draftReason.value = '';
  draftMessage.value = `正在审阅 Host 草稿版本 ${item.revision}；修改后须明确填写原因。`;
}

function saveLocally(): void {
  const value = text.value.trim();
  if (!value || busy.value || uncertain.value) return;
  const draft = props.connected && props.session && props.projectId && selected.value
    ? saveMessageDraft(props.session, props.projectId, selected.value.conversationId, value)
    : savedDraft.value && draftInView.value ? updateMessageDraft(value) : null;
  if (!draft) {
    message.value = '本机草稿未保存；请先连接授权项目并选择会话，或检查浏览器存储。';
    return;
  }
  savedDraft.value = draft;
  message.value = '消息草稿只保存在此浏览器标签页；不会自动发送。';
}

function discardLocal(): void {
  clearMessageDraft(); savedDraft.value = null; text.value = '';
  message.value = '本机未提交消息草稿已清除。';
}

async function send(): Promise<void> {
  if (busy.value || uncertain.value || !props.connected || !props.session ||
      !props.projectId || !selected.value || !text.value.trim()) return;
  if (!navigator.onLine) {
    message.value = '当前离线。文字只保留在此输入框；不会排队提交。';
    return;
  }
  const currentProjectId = props.projectId;
  const currentDeviceId = props.session.deviceId;
  const command = createMessageCommand(currentProjectId, selected.value.conversationId,
    selected.value.revision, text.value.trim());
  busy.value = true; message.value = '';
  try {
    const receipt = await submitMessage(command, props.session.csrfToken);
    if (!props.connected || props.projectId !== currentProjectId ||
        props.session?.deviceId !== currentDeviceId) return;
    lastSaved.value = receipt;
    createdDraft.value = null; activeContract.value = null;
    uncertainDraft.value = null; draftMessage.value = '';
    if (text.value.trim() === command.payload.text) text.value = '';
    if (savedDraft.value?.projectId === currentProjectId &&
        savedDraft.value.conversationId === command.resourceId &&
        savedDraft.value.text === command.payload.text) {
      clearMessageDraft(); savedDraft.value = null;
    }
    const refreshed = await refreshAfterWrite(currentProjectId, currentDeviceId);
    if (messageListLoaded.value) void refreshMessages(false, true);
    message.value = refreshed
      ? 'Host 已保存用户消息；此操作没有自动生成任务或运行 Agent。'
      : 'Host 已保存用户消息，但会话列表刷新失败；请手动刷新。';
  } catch (error) {
    if (!props.connected || props.projectId !== currentProjectId ||
        props.session?.deviceId !== currentDeviceId) return;
    if (error instanceof Error && error.message === 'REMOTE_CSRF_REJECTED') {
      message.value = '会话校验令牌已更新，本次消息未保存。重新检查连接并核对会话后再手动发送；文字仍保留。';
      emit('sessionRefreshRequired');
    } else if (error instanceof Error && error.message === 'REMOTE_CONVERSATION_STALE') {
      message.value = '会话版本已变化。请刷新、核对当前版本后手动重新发送；文字仍保留。';
    } else if (error instanceof Error && error.message === 'REMOTE_MESSAGE_NOT_AUTHORIZED') {
      message.value = '此设备没有当前项目的 task:draft 操作授权，消息未保存。';
    } else if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE') {
      message.value = '会话已失效。请重新连接；文字仍保留在此输入框。';
    } else {
      uncertain.value = command;
      message.value = '提交结果不确定。不会自动重试；只能手工查询原命令回执。';
    }
  } finally { busy.value = false; }
}

async function refreshAfterWrite(projectId: string, deviceId: string): Promise<boolean> {
  try {
    const page = await readConversationPage(projectId);
    if (!props.connected || props.projectId !== projectId ||
        props.session?.deviceId !== deviceId) return false;
    conversations.value = page.items;
    cursor.value = page.page.cursor;
    return true;
  } catch {
    return false;
  }
}

async function inspectReceipt(): Promise<void> {
  const command = uncertain.value;
  if (!command || !props.connected || !props.session || busy.value) return;
  const currentDeviceId = props.session.deviceId;
  busy.value = true;
  try {
    const receipt = await readMessageReceipt(command.commandId);
    if (!props.connected || props.projectId !== command.projectId ||
        props.session?.deviceId !== currentDeviceId) return;
    if (!receipt) {
      message.value = 'Host 当前没有该命令回执；不会自动重发，文字仍保留。';
      return;
    }
    if (receipt.result.message.conversationId !== command.resourceId ||
        receipt.result.message.content !== command.payload.text ||
        receipt.resourceRevision !== command.expectedRevision + 1) {
      throw new Error('REMOTE_MESSAGE_RECEIPT_MISMATCH');
    }
    uncertain.value = null;
    lastSaved.value = receipt;
    createdDraft.value = null; activeContract.value = null;
    uncertainDraft.value = null; draftMessage.value = '';
    if (text.value.trim() === command.payload.text) {
      text.value = '';
      if (savedDraft.value?.projectId === command.projectId &&
          savedDraft.value.conversationId === command.resourceId &&
          savedDraft.value.text === command.payload.text) {
        clearMessageDraft(); savedDraft.value = null;
      }
    }
    const refreshed = await refreshAfterWrite(command.projectId, currentDeviceId);
    if (messageListLoaded.value) void refreshMessages(false, true);
    message.value = refreshed
      ? '已从 Host 查到原命令回执，用户消息已保存。'
      : '已从 Host 查到原命令回执，用户消息已保存；会话列表刷新失败。';
  } catch {
    if (props.connected && props.projectId === command.projectId &&
        props.session?.deviceId === currentDeviceId) {
      message.value = '回执尚不可确认。不会自动重发；请稍后检查 Host。';
    }
  } finally { busy.value = false; }
}

async function createManualDraft(): Promise<void> {
  const source = lastSaved.value?.result.message;
  const previous = activeContract.value;
  if (draftBusy.value || uncertainDraft.value ||
      !props.connected || !props.session || !props.projectId ||
      (!previous && (!source || source.conversationId !== selectedId.value)) ||
      !draftTitle.value.trim() || !draftGoal.value.trim() ||
      !draftCriterion.value.trim() || !draftWorkflow.value.trim()) return;
  if (previous && (!draftRevisionChanged.value || !draftReason.value.trim())) return;
  const sourceRef = source ? `message:${source.messageId}` : '';
  const contract: TaskContract = previous ? {
    ...previous, revision: previous.revision + 1,
    title: draftTitle.value.trim(), goal: draftGoal.value.trim(),
    type: draftType.value, priority: draftPriority.value,
    workflowRef: draftWorkflow.value.trim(),
    acceptance: previous.acceptance.map((item, index) => index === 0
      ? { ...item, statement: draftCriterion.value.trim() } : item),
  } : {
    schemaVersion: '1.0', taskId: crypto.randomUUID(), projectId: props.projectId,
    revision: 1, title: draftTitle.value.trim(), type: draftType.value,
    goal: draftGoal.value.trim(), acceptance: [{
      id: 'ac1', statement: draftCriterion.value.trim(), method: 'manual',
      required: true, sourceRefs: [sourceRef],
    }], constraints: [], scope: [], outOfScope: [], dependencies: [],
    openQuestions: draftQuestions.value.split('\n').map((item) => item.trim()).filter(Boolean),
    assumptions: [], sourceRefs: [sourceRef], workflowRef: draftWorkflow.value.trim(),
    priority: draftPriority.value,
  };
  let command: MobileDraftCommand;
  try {
    command = previous
      ? reviseDraftCommand(previous, contract, draftReason.value.trim())
      : createDraftCommand(contract);
  } catch {
    draftMessage.value = '草稿字段不符合合同约束；请检查长度、工作流引用和必填内容。';
    return;
  }
  const currentDeviceId = props.session.deviceId;
  draftBusy.value = true; draftMessage.value = '';
  try {
    const receipt = await submitDraft(command, props.session.csrfToken);
    if (!props.connected || props.projectId !== command.projectId ||
        props.session?.deviceId !== currentDeviceId) return;
    createdDraft.value = receipt;
    activeContract.value = command.payload.contract;
    draftReason.value = '';
    if (draftListLoaded.value) void refreshDrafts(false, true);
    draftMessage.value = receipt.result.status === 'needs_clarification'
      ? 'Host 已保存人工草稿；澄清问题仍需在 Desktop 明确解决。'
      : `Host 已保存人工草稿版本 ${receipt.result.revision}；请在 Desktop 单独请求批准。不会自动进入 TODO。`;
  } catch (error) {
    if (!props.connected || props.projectId !== command.projectId ||
        props.session?.deviceId !== currentDeviceId) return;
    if (error instanceof Error && error.message === 'REMOTE_CSRF_REJECTED') {
      draftMessage.value = '会话校验令牌已更新，本次草稿未保存。重新检查连接并审阅当前版本后再手动提交。';
      emit('sessionRefreshRequired');
    } else if (error instanceof Error && error.message === 'REMOTE_DRAFT_STALE') {
      draftMessage.value = '来源消息或草稿版本已变化；请在 Desktop 检查。';
    } else if (error instanceof Error && error.message === 'REMOTE_DRAFT_NOT_AUTHORIZED') {
      draftMessage.value = '此设备没有当前项目的 task:draft 授权，草稿未保存。';
    } else if (error instanceof Error && error.message === 'REMOTE_SESSION_UNAVAILABLE') {
      draftMessage.value = '设备会话已失效；草稿未确认保存。';
    } else if (error instanceof Error && error.message === 'REMOTE_DRAFT_INVALID') {
      draftMessage.value = 'Host 拒绝了草稿字段；请核对合同内容后再操作。';
    } else {
      uncertainDraft.value = command;
      draftMessage.value = '草稿提交结果不确定。不会自动重试；可查询原命令回执。';
    }
  } finally { draftBusy.value = false; }
}

async function inspectDraftReceipt(): Promise<void> {
  const command = uncertainDraft.value;
  if (!command || !props.connected || !props.session || draftBusy.value) return;
  const deviceId = props.session.deviceId;
  draftBusy.value = true;
  try {
    const receipt = await readDraftReceipt(command.commandId);
    if (!props.connected || props.projectId !== command.projectId ||
        props.session?.deviceId !== deviceId) return;
    if (!receipt) {
      draftMessage.value = 'Host 没有该草稿命令回执；不会自动重发。';
      return;
    }
    if (receipt.result.draftId !== command.resourceId) {
      throw new Error('REMOTE_DRAFT_RECEIPT_MISMATCH');
    }
    uncertainDraft.value = null;
    createdDraft.value = receipt;
    activeContract.value = command.payload.contract;
    draftReason.value = '';
    if (draftListLoaded.value) void refreshDrafts(false, true);
    draftMessage.value = '已从 Host 确认原命令：人工草稿已保存，尚未批准或开工。';
  } catch {
    draftMessage.value = '原草稿回执仍无法确认；不会自动重发。';
  } finally { draftBusy.value = false; }
}

watch(() => [props.projectId, props.session?.deviceId, props.session?.sessionId,
  props.session?.policyRevision] as const,
  ([projectId, deviceId, sessionId, policyRevision], previous) => {
    const [oldProjectId, oldDeviceId, oldSessionId, oldPolicyRevision] = previous ??
      [null, undefined, undefined, undefined];
    const projectChanged = !initialized || projectId !== oldProjectId;
    const identityChanged = deviceId !== oldDeviceId || sessionId !== oldSessionId ||
      policyRevision !== oldPolicyRevision;
    const deviceOwnerChanged = !!deviceId && !!lastKnownDeviceId &&
      deviceId !== lastKnownDeviceId;
    initialized = true;
    if (deviceId) lastKnownDeviceId = deviceId;
    if (!projectChanged && !identityChanged) return;
    generation += 1;
    messageGeneration += 1;
    draftGeneration += 1;
    conversations.value = []; cursor.value = null;
    if (projectChanged || deviceOwnerChanged) selectedId.value = '';
    hostMessages.value = []; messageCursor.value = null;
    messageListBusy.value = false; messageListLoaded.value = false;
    messageListNote.value = '';
    hostDrafts.value = []; draftCursor.value = null; draftListBusy.value = false;
    draftListLoaded.value = false; draftListMessage.value = '';
    lastSaved.value = null; uncertain.value = null;
    createdDraft.value = null; activeContract.value = null;
    uncertainDraft.value = null; draftMessage.value = ''; draftReason.value = '';
    savedDraft.value = readMessageDraft(props.session);
    if (savedDraft.value && (!projectId || savedDraft.value.projectId === projectId)) {
      if (projectChanged || deviceOwnerChanged || !text.value.trim()) {
        text.value = savedDraft.value.text;
      }
      selectedId.value = savedDraft.value.conversationId;
    } else if (projectChanged || deviceOwnerChanged) text.value = '';
    if (props.connected && props.session && props.projectId) void refresh();
  }, { immediate: true });
watch(() => props.connected, (connected) => {
  if (connected && props.session && props.projectId) void refresh();
  if (!connected) {
    generation += 1; messageGeneration += 1; draftGeneration += 1;
    conversations.value = []; cursor.value = null;
    busy.value = false;
    hostMessages.value = []; messageCursor.value = null;
    messageListBusy.value = false; messageListLoaded.value = false;
    messageListNote.value = '';
    hostDrafts.value = []; draftCursor.value = null;
    draftListBusy.value = false; draftListLoaded.value = false;
    draftListMessage.value = '';
    lastSaved.value = null; activeContract.value = null; createdDraft.value = null;
    uncertain.value = null; uncertainDraft.value = null;
  }
});
</script>

<template>
  <div class="mobile-read-panel mobile-messages" aria-label="项目会话与消息">
    <ForgeCard tone="reading" class="mobile-detail-card">
      <h2>现有项目会话</h2>
      <p>只能向 Desktop 已创建的会话保存文字；没有自动需求整理或 Agent 运行。</p>
      <label class="mobile-message-select">会话
        <select :value="selectedId" :disabled="!connected || busy || !conversations.length"
          @change="choose">
          <option v-if="!conversations.length" value="">当前没有可用会话</option>
          <option v-for="item in conversations" :key="item.conversationId"
            :value="item.conversationId">{{ item.title }} · 版本 {{ item.revision }}</option>
        </select>
      </label>
      <div class="mobile-message-actions">
        <ForgeButton variant="secondary" size="sm" :disabled="!connected || busy"
          @click="refresh()">刷新会话</ForgeButton>
        <ForgeButton v-if="cursor" variant="ghost" size="sm" :disabled="!connected || busy"
          @click="refresh(true)">更多会话</ForgeButton>
      </div>
      <p v-if="!conversations.length && connected">请先在 Desktop 的该项目中创建会话。</p>
    </ForgeCard>
    <ForgeCard v-if="selected" tone="reading" class="mobile-detail-card">
      <h2>Host 会话消息</h2>
      <p>仅显示当前授权会话的用户和助手文字；工具、系统消息与附件不出现在手机。</p>
      <ForgeButton variant="secondary" size="sm" :disabled="!connected || messageListBusy"
        :loading="messageListBusy" @click="refreshMessages()">读取 Host 消息</ForgeButton>
      <ForgeButton v-if="messageCursor" variant="ghost" size="sm"
        :disabled="!connected || messageListBusy" @click="refreshMessages(true)">更早消息</ForgeButton>
      <ol v-if="hostMessages.length" class="mobile-message-history">
        <li v-for="item in hostMessages" :key="item.messageId">
          <strong>{{ item.role === 'user' ? '你' : '助手' }} · {{ item.status }}</strong>
          <p>{{ item.content }}</p>
          <small v-if="item.truncated">长消息只显示前 4000 字；完整内容可在 Desktop 查看。</small>
        </li>
      </ol>
      <p v-if="messageListLoaded && !hostMessages.length">当前会话还没有可显示的消息。</p>
      <p v-if="messageListNote" role="status" class="mobile-read-note">{{ messageListNote }}</p>
    </ForgeCard>
    <ForgeCard v-if="selected" tone="reading" class="mobile-detail-card">
      <h2>Host 中的任务草稿</h2>
      <p>从当前授权会话读取真实草稿；刷新页面后可重新审阅并修订未批准版本。</p>
      <ForgeButton variant="secondary" size="sm" :disabled="!connected || draftListBusy"
        :loading="draftListBusy" @click="refreshDrafts()">读取 Host 草稿</ForgeButton>
      <div v-for="item in hostDrafts" :key="item.draftId" class="mobile-draft-list-item">
        <strong>{{ item.contract?.title ?? '待整理草稿' }}</strong>
        <span>版本 {{ item.revision }} · {{ item.status }}</span>
        <ForgeButton variant="ghost" size="sm" :disabled="!item.canRevise || !connected"
          @click="openHostDraft(item)">审阅并修订</ForgeButton>
      </div>
      <ForgeButton v-if="draftCursor" variant="ghost" size="sm"
        :disabled="!connected || draftListBusy" @click="refreshDrafts(true)">更多草稿</ForgeButton>
      <p v-if="draftListLoaded && !hostDrafts.length">此会话尚无 Host 草稿。</p>
      <p v-if="draftListMessage" role="status" class="mobile-read-note">{{ draftListMessage }}</p>
    </ForgeCard>
    <ForgeCard tone="reading" class="mobile-detail-card">
      <h2>保存用户消息</h2>
      <ForgeTextarea v-model="text" label="消息内容" :rows="4" :max-height="220"
        placeholder="记录补充信息或需求；不会自动创建任务" />
      <p>发送需要该设备的 task:draft 授权。可明确保存一条本机消息草稿；离线和失败不会自动重放。</p>
      <ForgeButton :disabled="!connected || !session || !selected || !text.trim() || busy || !!uncertain"
        :loading="busy" @click="send">保存到 Host</ForgeButton>
      <ForgeButton variant="secondary" :disabled="!text.trim() || busy || !!uncertain ||
        (!draftInView && (!connected || !selected))" @click="saveLocally">保存本机草稿</ForgeButton>
      <ForgeButton v-if="draftInView" variant="ghost" :disabled="busy" @click="discardLocal">
        清除本机草稿</ForgeButton>
      <p v-if="draftInView" class="mobile-read-note">
        本机未提交草稿 · 保存于 {{ new Date(draftInView.savedAt).toLocaleString() }} ·
        {{ connected ? '提交前仍须核对会话和版本' : '当前离线，无法验证授权或提交' }}
      </p>
      <ForgeButton v-if="uncertain" variant="secondary" :disabled="!connected || busy"
        @click="inspectReceipt">查询原命令回执</ForgeButton>
      <p v-if="message" role="status" class="mobile-read-note">{{ message }}</p>
      <p v-if="lastSaved" class="mobile-read-note">
        Host 消息 {{ lastSaved.result.message.messageId.slice(0, 8) }} ·
        会话版本 {{ lastSaved.resourceRevision }} · 模型回复不可用
      </p>
    </ForgeCard>
    <ForgeCard v-if="activeContract || (lastSaved &&
      selected?.conversationId === lastSaved.result.message.conversationId)"
      tone="reading" class="mobile-detail-card">
      <h2>{{ activeContract ? '修订 Host 人工草稿' : '从这条消息建立人工草稿' }}</h2>
      <p v-if="lastSaved && !activeContract">来源是 Host 已保存的消息
        {{ lastSaved.result.message.messageId.slice(0, 8) }}。
        请亲自填写合同；这里不会调用模型、自动批准或启动 Agent。</p>
      <p v-else>来源与先前决定由 Host 草稿保留；修改后须填写原因并再次核对版本。</p>
      <ForgeInput v-model="draftTitle" label="任务标题" :max-length="120" />
      <ForgeTextarea v-model="draftGoal" label="目标" :rows="3" :max-height="160" />
      <ForgeTextarea v-model="draftCriterion" label="至少一条验收条件" :rows="2" :max-height="120" />
      <ForgeTextarea v-model="draftQuestions" label="尚待澄清的问题（可选，每行一条）"
        :rows="2" :max-height="120" :disabled="!!activeContract" />
      <p v-if="activeContract" class="mobile-read-note">
        本机可修订标题、目标、验收文字、类型、优先级和工作流；
        澄清答案、删除验收条件与范围变更须在 Desktop 明确确认。
      </p>
      <label class="mobile-message-select">任务类型
        <select v-model="draftType" :disabled="draftBusy">
          <option value="feature">功能</option><option value="bug">修复</option>
          <option value="refactor">重构</option><option value="chore">维护</option>
        </select>
      </label>
      <label class="mobile-message-select">优先级
        <select v-model="draftPriority" :disabled="draftBusy">
          <option value="low">低</option><option value="normal">正常</option>
          <option value="high">高</option><option value="urgent">紧急</option>
        </select>
      </label>
      <ForgeInput v-model="draftWorkflow" label="工作流引用" />
      <ForgeInput v-if="activeContract" v-model="draftReason" label="本次修订原因" />
      <ForgeButton :disabled="!connected || !session || draftBusy ||
        !!uncertainDraft || !draftTitle.trim() || !draftGoal.trim() ||
        !draftCriterion.trim() || !draftWorkflow.trim() ||
        (!!activeContract && (!draftRevisionChanged || !draftReason.trim()))"
        :loading="draftBusy" @click="createManualDraft">
        {{ activeContract ? '保存草稿修订' : '保存人工任务草稿' }}
      </ForgeButton>
      <ForgeButton v-if="uncertainDraft" variant="secondary" :disabled="!connected || draftBusy"
        @click="inspectDraftReceipt">查询草稿原命令回执</ForgeButton>
      <p v-if="draftMessage" role="status" class="mobile-read-note">{{ draftMessage }}</p>
      <p v-if="createdDraft" class="mobile-read-note">草稿 {{ createdDraft.result.draftId.slice(0, 8) }} ·
        版本 {{ createdDraft.resourceRevision }} · {{ createdDraft.result.status }}</p>
    </ForgeCard>
  </div>
</template>
