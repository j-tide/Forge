<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { conversationMessageSchema, conversationSchema, taskApprovalSchema, type TaskApproval,
  taskDraftSchema, controlProposalSchema, type ControlProposal,
  type TaskDraft, type Conversation, type ConversationMessage, type AgentProfileCatalog } from '@forge/contracts';
import { ForgeButton, ForgeDialog, ForgeSelect, ForgeTextarea } from '@forge/ui';
import DraftSheet from './DraftSheet.vue';

const props = withDefaults(defineProps<{ client: ForgeClient; projectId: string; startNew?: boolean;
  connected?: boolean }>(), { connected: true });
const emit = defineEmits<{ approvalChanged: [approval: TaskApproval] }>();
const conversations = ref<Conversation[]>([]);
const current = ref<Conversation | null>(null);
const messages = ref<ConversationMessage[]>([]);
const taskDrafts = ref<TaskDraft[]>([]);
const approvalStates = ref<Record<string, TaskApproval['status']>>({});
const selectedDraft = ref<TaskDraft | null>(null);
const editorOpen = ref(false);
const editorBack = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const pendingReviewMessageId = ref<string | null>(null);
const draft = ref('');
const error = ref('');
const busy = ref(false);
const modelLoading = ref(false);
const provider = ref<AgentProfileCatalog['modelProviders'][number] | null>(null);
const modelId = ref('');
const modelOptions = computed(() => provider.value?.modelIds.map((id) => ({ value: id, label: id })) ?? []);
const isConnected = computed(() => props.connected !== false);
const canGenerate = computed(() => isConnected.value && !modelLoading.value && !!provider.value?.available && provider.value.structuredOutput &&
  provider.value.modelIds.includes(modelId.value));
const providerLabel = computed(() => provider.value?.providerId === 'model.codex' ? 'Codex' :
  provider.value?.providerId ?? '模型');
const generating = computed(() => taskDrafts.value.some((item) => item.status === 'generating'));
const modelProblem = computed(() => {
  if (!isConnected.value) return 'Host 暂时断开，输入会保留；连接恢复后可以发送。';
  if (modelLoading.value) return '正在连接模型…';
  if (canGenerate.value) return '';
  if (provider.value?.reason === 'MODEL_AUTH_UNAVAILABLE') return 'Codex 尚未登录，请在设置中检查连接。';
  if (provider.value?.reason === 'MODEL_PROVIDER_DISABLED') return 'AI 整理已停用，仍可手工填写草稿。';
  return 'AI 整理暂不可用。可以重试连接，或手工填写草稿。';
});
const submitted = ref('');
const proposals = ref<Record<string, ControlProposal>>({});
const selectedProposal = ref<ControlProposal | null>(null);
const proposalOpen = ref(false);
let idempotencyKey: string | null = null;
const draftIdempotencyKeys = new Map<string, string>();
let unsubscribeEvents: (() => void) | null = null;
let draftPoll: ReturnType<typeof setInterval> | null = null;

async function loadModel(): Promise<void> {
  if (!isConnected.value) return;
  modelLoading.value = true;
  try {
    const catalog = await props.client.agentProfileCatalog();
    provider.value = catalog?.modelProviders.find((item) => item.available && item.structuredOutput) ??
      catalog?.modelProviders[0] ?? null;
    if (!provider.value?.modelIds.includes(modelId.value)) {
      modelId.value = provider.value?.modelIds.includes('gpt-6-luna') ? 'gpt-6-luna' : provider.value?.modelIds[0] ?? '';
    }
  } catch { provider.value = null; modelId.value = ''; }
  finally { modelLoading.value = false; }
}

async function load(): Promise<void> {
  if (!isConnected.value) return;
  error.value = '';
  try {
    const result = await props.client.conversation({ type: 'conversation.list',
      payload: { projectId: props.projectId } });
    if (!result.ok) { error.value = result.error.message; return; }
    if (!Array.isArray(result.data)) { error.value = '会话列表格式无效，请重试。'; return; }
    conversations.value = result.data.filter((item) => conversationSchema.safeParse(item).success) as Conversation[];
    current.value = props.startNew ? null : conversations.value[0] ?? null;
    await loadMessages();
  } catch { error.value = '会话读取失败，请检查 Host 连接后重试。'; }
}

async function loadMessages(): Promise<void> {
  if (!isConnected.value) return;
  if (!current.value) { messages.value = []; taskDrafts.value = []; return; }
  const conversationId = current.value.conversationId;
  try {
    const result = await props.client.conversation({ type: 'conversation.messages',
      payload: { projectId: props.projectId, conversationId } });
    if (current.value?.conversationId !== conversationId) return;
    if (!result.ok) { error.value = result.error.message; return; }
    if (!Array.isArray(result.data)) { error.value = '消息列表格式无效，请重试。'; return; }
    messages.value = result.data.filter((item) => conversationMessageSchema.safeParse(item).success) as ConversationMessage[];
    await loadDrafts();
  } catch { if (current.value?.conversationId === conversationId) error.value = '消息读取失败，请重试。'; }
}

async function loadDrafts(): Promise<void> {
  if (!isConnected.value) return;
  if (!current.value) return;
  const conversationId = current.value.conversationId;
  try {
    const result = await props.client.draft({ type: 'draft.list', payload: {
      projectId: props.projectId, conversationId,
    } });
    if (current.value?.conversationId !== conversationId) return;
    if (!result.ok) { error.value = result.error.message; return; }
    if (!Array.isArray(result.data)) { error.value = '草稿列表格式无效，请重试。'; return; }
    taskDrafts.value = result.data.filter((item) => taskDraftSchema.safeParse(item).success) as TaskDraft[];
    let approvalReadFailed = false;
    const approvals = await Promise.all(taskDrafts.value.map(async (item) => {
      try {
        const approval = await props.client.approval({ type: 'approval.forDraft', payload: {
          projectId: props.projectId, draftId: item.draftId,
        } });
        const checked = approval.ok ? taskApprovalSchema.nullable().safeParse(approval.data) : null;
        if (!approval.ok || !checked?.success) approvalReadFailed = true;
        return [item.draftId, checked?.success ? checked.data?.status : undefined] as const;
      } catch {
        approvalReadFailed = true;
        return [item.draftId, undefined] as const;
      }
    }));
    if (current.value?.conversationId !== conversationId) return;
    const states: Record<string, TaskApproval['status']> = {};
    for (const [draftId, status] of approvals) if (status) states[draftId] = status;
    approvalStates.value = states;
    if (approvalReadFailed) error.value = '部分审批状态暂时无法读取，请重试。';
    if (taskDrafts.value.some((item) => item.status === 'generating')) startDraftPolling();
    else stopDraftPolling();
    if (pendingReviewMessageId.value) {
      const completed = taskDrafts.value.find((item) =>
        item.sourceMessageId === pendingReviewMessageId.value && item.status !== 'generating');
      if (completed) {
        pendingReviewMessageId.value = null;
        if (completed.intent === 'new_task' && completed.contract) openDraftEditor(completed);
      }
    }
  } catch { if (current.value?.conversationId === conversationId) error.value = '草稿读取失败，请重试。'; }
}

function stopDraftPolling(): void {
  if (draftPoll) clearInterval(draftPoll);
  draftPoll = null;
}
function startDraftPolling(): void {
  if (draftPoll) return;
  draftPoll = setInterval(() => { void loadDrafts(); }, 1500);
}

async function createDraft(message: ConversationMessage, mode: 'draft.generate' | 'draft.manual'): Promise<void> {
  if (!isConnected.value || !current.value || busy.value || taskDrafts.value.some((item) => item.sourceMessageId === message.messageId)) return;
  if (mode === 'draft.generate' && !canGenerate.value) return;
  busy.value = true; error.value = '';
  try { await requestDraft(message, mode); }
  catch { error.value = '整理请求失败，原始需求已保留，请重试。'; }
  finally { busy.value = false; }
}

async function requestDraft(message: ConversationMessage, mode: 'draft.generate' | 'draft.manual'): Promise<void> {
  if (!current.value) return;
  const requestIdentity = `${message.messageId}:${mode}:${mode === 'draft.generate' ? modelId.value : ''}`;
  let requestKey = draftIdempotencyKeys.get(requestIdentity);
  if (!requestKey) {
    requestKey = crypto.randomUUID();
    draftIdempotencyKeys.set(requestIdentity, requestKey);
  }
  try {
    const result = await props.client.draft({ type: mode, payload: {
      projectId: props.projectId, conversationId: current.value.conversationId,
      sourceMessageId: message.messageId, idempotencyKey: requestKey,
      ...(mode === 'draft.generate' ? { modelId: modelId.value } : {}),
    } });
    if (!result.ok) {
      try { await loadDrafts(); } catch { /* The original request remains retryable. */ }
      if (!taskDrafts.value.some((item) => item.sourceMessageId === message.messageId)) {
        error.value = result.error.message;
      }
      return;
    }
    const checked = taskDraftSchema.safeParse(result.data);
    if (!checked.success) { error.value = '整理结果无法读取，请重试。'; return; }
    pendingReviewMessageId.value = checked.data.status === 'generating' ? message.messageId : null;
    await loadDrafts();
    if (mode === 'draft.manual' || (checked.data.intent === 'new_task' && checked.data.contract &&
      checked.data.status !== 'generating')) openDraftEditor(checked.data);
  } catch {
    try { await loadDrafts(); } catch { /* Keep the request key for a safe retry. */ }
    if (!taskDrafts.value.some((item) => item.sourceMessageId === message.messageId)) {
      error.value = '整理请求失败，原始需求已保留，请重试。';
    }
  }
}

async function propose(message: ConversationMessage): Promise<void> {
  if (!current.value || busy.value) return;
  const cached = proposals.value[message.messageId];
  if (cached) { selectedProposal.value = cached; proposalOpen.value = true; return; }
  busy.value = true; error.value = '';
  try {
    const result = await props.client.conversation({ type: 'intent.propose', payload: {
      projectId: props.projectId, conversationId: current.value.conversationId,
      messageId: message.messageId,
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = controlProposalSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Host 返回了无效控制提议。'; return; }
    proposals.value[message.messageId] = checked.data;
    selectedProposal.value = checked.data; proposalOpen.value = true;
  } catch { error.value = '控制提议读取失败；没有执行任何任务命令。'; }
  finally { busy.value = false; }
}
async function editProposedDraft(item: TaskDraft): Promise<void> {
  proposalOpen.value = false;
  await nextTick();
  openDraftEditor(item);
}

async function saveDraftText(item: TaskDraft): Promise<void> {
  if (busy.value || !item.editableText.trim()) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.draft({ type: 'draft.updateText', payload: {
      projectId: props.projectId, draftId: item.draftId,
      expectedRevision: item.revision, editableText: item.editableText.trim(),
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    await loadDrafts();
  } catch { error.value = '保存草稿文字失败；请检查连接和版本。'; }
  finally { busy.value = false; }
}

async function select(conversation: Conversation): Promise<void> {
  stopDraftPolling();
  selectedDraft.value = null; editorOpen.value = false;
  pendingReviewMessageId.value = null;
  current.value = conversation; draft.value = ''; submitted.value = ''; idempotencyKey = null;
  proposals.value = {}; selectedProposal.value = null; proposalOpen.value = false;
  await loadMessages();
}

function newConversation(): void {
  stopDraftPolling(); taskDrafts.value = []; approvalStates.value = {};
  selectedDraft.value = null; editorOpen.value = false;
  pendingReviewMessageId.value = null;
  current.value = null; messages.value = []; draft.value = ''; submitted.value = '';
  proposals.value = {}; selectedProposal.value = null; proposalOpen.value = false;
  error.value = ''; idempotencyKey = null;
}

function openDraftEditor(item: TaskDraft): void {
  selectedDraft.value = item; editorOpen.value = true;
  void nextTick(() => editorBack.value?.focus());
}
function closeDraftEditor(): void {
  const draftId = selectedDraft.value?.draftId;
  editorOpen.value = false;
  void nextTick(() => {
    const trigger = [...(panel.value?.querySelectorAll<HTMLButtonElement>('[data-draft-id]') ?? [])]
      .find((button) => button.dataset.draftId === draftId);
    (trigger ?? panel.value?.querySelector<HTMLTextAreaElement>('.conversation-composer textarea'))?.focus();
  });
}
function onDraftSaved(item: TaskDraft): void {
  taskDrafts.value = taskDrafts.value.map((entry) => entry.draftId === item.draftId ? item : entry);
  selectedDraft.value = item;
}
function onApprovalChanged(item: TaskApproval): void {
  approvalStates.value = { ...approvalStates.value, [item.draftId]: item.status };
  emit('approvalChanged', item);
}
function draftFailure(item: TaskDraft): string {
  if (item.errorCode === 'REFINER_UNAVAILABLE') return '所选模型暂不可用，需求已保存；可以改用手工草稿。';
  if (item.errorCode === 'REFINER_INVALID_OUTPUT') return '整理结果无法形成有效任务，需求已保存；请手工完善。';
  return '整理失败，需求已保存；请检查模型连接或手工完善。';
}

async function saveMessage(mode: 'draft.generate' | 'draft.manual'): Promise<void> {
  const text = draft.value.trim();
  if (!isConnected.value || !text || busy.value || generating.value || (mode === 'draft.generate' && !canGenerate.value)) return;
  busy.value = true; error.value = '';
  try {
    if (!current.value) {
      const created = await props.client.conversation({ type: 'conversation.create', payload: {
        projectId: props.projectId, title: text.slice(0, 80), expectedRevision: 0,
      } });
      if (!created.ok) { error.value = created.error.message; return; }
      const checked = conversationSchema.safeParse(created.data);
      if (!checked.success) { error.value = 'Invalid conversation response'; return; }
      current.value = checked.data;
      conversations.value.unshift(checked.data);
    }
    if (!idempotencyKey || submitted.value !== text) idempotencyKey = crypto.randomUUID();
    submitted.value = text;
    const result = await props.client.conversation({ type: 'conversation.send', payload: {
      projectId: props.projectId, conversationId: current.value.conversationId,
      idempotencyKey, text, attachmentIds: [],
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    const saved = conversationMessageSchema.safeParse((result.data as { message?: unknown })?.message);
    if (!saved.success) { error.value = '消息回执无法读取，原文已保留。'; return; }
    await loadMessages();
    draft.value = ''; submitted.value = ''; idempotencyKey = null;
    await requestDraft(saved.data, mode);
  } catch { error.value = '保存消息失败。原文仍保留在输入框中。'; }
  finally { busy.value = false; }
}

onMounted(() => {
  unsubscribeEvents = props.client.onConversationEvent((event) => {
    if (event.projectId !== props.projectId || event.conversationId !== current.value?.conversationId) return;
    if (event.type === 'message.delta' && event.delta !== null) {
      const existing = messages.value.find((item) => item.messageId === event.messageId);
      if (existing) existing.content += event.delta;
      else void loadMessages();
    } else void loadMessages();
  });
  if (isConnected.value) { void load(); void loadModel(); }
});
onUnmounted(() => { unsubscribeEvents?.(); stopDraftPolling(); });
watch(() => props.projectId, () => { newConversation(); if (isConnected.value) void load(); });
watch(isConnected, (connected) => {
  if (!connected) { stopDraftPolling(); return; }
  void loadModel();
  if (current.value) void loadMessages();
  else void load();
});
</script>

<template>
  <section ref="panel" class="conversation-panel" aria-label="项目会话">
    <div v-if="editorOpen && selectedDraft" class="conversation-editor-stage">
      <header class="conversation-editor-header">
        <button ref="editorBack" class="conversation-editor-back" type="button" @click="closeDraftEditor">
          <span aria-hidden="true">←</span> 返回讨论
        </button>
        <div class="conversation-editor-title"><strong>任务草稿</strong><span>v{{ selectedDraft.revision }}</span></div>
        <small>{{ selectedDraft.modelId ? `Codex · ${selectedDraft.modelId}` : '手工草稿' }}</small>
      </header>
      <p v-if="!isConnected" class="conversation-notice" role="status">Host 已断开。当前编辑会保留；连接恢复后再保存。</p>
      <div v-if="error" class="conversation-read-error" role="alert">{{ error }}
        <ForgeButton v-if="isConnected" variant="ghost" size="sm" @click="loadDrafts">重试读取</ForgeButton>
      </div>
      <details class="conversation-editor-source"><summary>查看原始需求</summary>
        <p>{{ messages.find((item) => item.messageId === selectedDraft?.sourceMessageId)?.content ?? selectedDraft.editableText }}</p>
      </details>
      <p v-if="selectedDraft.assistantReply" class="conversation-editor-reply">{{ selectedDraft.assistantReply }}</p>
      <DraftSheet v-model:open="editorOpen" :item="selectedDraft"
        :client="client" :project-id="projectId" :messages="messages"
        @saved="onDraftSaved" @approval-changed="onApprovalChanged" />
    </div>
    <template v-else>
    <div v-if="current || conversations.length" class="conversation-bar"><strong>任务讨论</strong><ForgeButton variant="ghost" size="sm" :disabled="busy" @click="newConversation">新讨论</ForgeButton></div>
    <p v-if="!isConnected" class="conversation-notice" role="status">Host 已断开。输入内容会留在此处，连接恢复后再发送。</p>
    <div v-if="error" class="conversation-read-error" role="alert">{{ error }}
      <ForgeButton v-if="isConnected" variant="ghost" size="sm" @click="current ? loadMessages() : load()">重试读取</ForgeButton>
    </div>
    <div v-if="conversations.length" class="conversation-history" aria-label="会话历史">
      <button v-for="item in conversations" :key="item.conversationId" type="button"
        :aria-current="current?.conversationId === item.conversationId ? 'true' : undefined"
        @click="select(item)">{{ item.title }}</button>
    </div>
    <div v-if="!messages.length" class="conversation-intro">
      <h2>你想完成什么？</h2>
      <p>描述要实现或修复的结果，也可以写下限制与验收要求。可用 AI 整理或手工填写；草稿经你批准后才进入 TODO。</p>
    </div>
    <section v-if="messages.length" class="conversation-thread" aria-label="讨论记录">
    <div class="conversation-messages" role="log" aria-live="polite">
      <div v-for="item in messages" :key="item.messageId" class="conversation-message">
        <small>{{ item.role === 'user' ? '你' : 'Forge' }}</small>
        <p>{{ item.content }}</p>
        <div v-if="item.role === 'user' && !taskDrafts.some((entry) => entry.sourceMessageId === item.messageId)"
          class="draft-actions">
          <ForgeButton size="sm" variant="secondary" :disabled="busy || !canGenerate"
            @click="createDraft(item, 'draft.generate')">用 AI 整理这条需求</ForgeButton>
          <ForgeButton size="sm" variant="ghost" :disabled="busy"
            @click="createDraft(item, 'draft.manual')">手工填写草稿</ForgeButton>
        </div>
        <details v-if="item.role === 'user'" class="conversation-more"><summary>更多操作</summary>
          <ForgeButton size="sm" variant="ghost" :disabled="busy" @click="propose(item)">识别控制意图</ForgeButton>
        </details>
        <section v-for="proposal in taskDrafts.filter((entry) => entry.sourceMessageId === item.messageId)"
          :key="proposal.draftId" class="task-draft-card" :class="{ 'assistant-response': proposal.intent !== 'new_task' && !proposal.contract }"
          :aria-label="proposal.intent === 'new_task' ? '任务草稿' : 'Forge 回复'">
          <small>{{ proposal.modelId ? `Codex · ${proposal.modelId}` : proposal.modelProvider ?? '手工' }}</small>
          <p v-if="proposal.status === 'generating'" role="status">正在整理需求…</p>
          <p v-if="proposal.assistantReply" class="assistant-reply">{{ proposal.assistantReply }}</p>
          <template v-if="proposal.contract">
            <h3>{{ proposal.contract.title }}</h3>
            <p class="task-draft-goal">{{ proposal.contract.goal }}</p>
            <p v-if="proposal.contract.openQuestions.length" class="draft-questions-note">需要澄清 {{ proposal.contract.openQuestions.length }} 个问题</p>
          </template>
          <p v-else-if="proposal.errorCode" role="status">{{ draftFailure(proposal) }}</p>
          <p v-else-if="proposal.status === 'manual'" role="status">手工草稿已保存，请填写目标与验收条件。</p>
          <div v-if="proposal.status === 'manual' || proposal.status === 'invalid_output'" class="draft-manual-editor">
            <ForgeTextarea v-model="proposal.editableText" label="草稿文字" :max-height="240" :rows="4" />
            <ForgeButton size="sm" variant="secondary" :disabled="busy || !proposal.editableText.trim()"
              @click="saveDraftText(proposal)">保存文字</ForgeButton>
          </div>
          <ForgeButton v-if="proposal.status !== 'generating' && (proposal.intent === 'new_task' || proposal.status === 'manual')"
            size="sm" variant="secondary" :data-draft-id="proposal.draftId" @click="openDraftEditor(proposal)">{{ approvalStates[proposal.draftId] === 'approved' ?
              '查看已批准任务' : '审阅并编辑任务' }}</ForgeButton>
          <p v-if="approvalStates[proposal.draftId] === 'approved'" class="draft-status">已进入 TODO，等待你明确启动。</p>
        </section>
      </div>
    </div>
    </section>
    <div class="conversation-composer">
      <div class="composer-model"><ForgeSelect v-if="modelOptions.length" v-model="modelId" label="需求整理模型"
        :options="modelOptions" :disabled="busy || generating" />
        <span v-else>需求整理模型 · {{ modelLoading ? '检查中' : '不可用' }}</span>
        <span v-if="canGenerate" class="composer-model-status" role="status">{{ providerLabel }} · {{ modelId }} 已就绪</span>
        <ForgeButton variant="ghost" size="sm" :disabled="modelLoading || busy" @click="loadModel">刷新</ForgeButton></div>
      <p v-if="modelProblem" class="conversation-model-problem" role="status">{{ modelProblem }}</p>
      <ForgeTextarea v-model="draft" label="描述你的想法" visually-hidden-label
        placeholder="描述你要实现或修复的内容…" :max-height="240" :rows="4"
        @keydown.meta.enter.prevent="saveMessage('draft.generate')"
        @keydown.ctrl.enter.prevent="saveMessage('draft.generate')" />
      <div class="compose-action"><ForgeButton variant="ghost" :disabled="!draft.trim() || busy || generating"
          @click="saveMessage('draft.manual')">手工填写</ForgeButton><ForgeButton variant="primary"
          :disabled="!draft.trim() || !canGenerate || busy || generating"
          :loading="busy" @click="saveMessage('draft.generate')">发送并整理</ForgeButton></div>
      <p class="availability-note">⌘/Ctrl + Enter 发送 · 任务先由你确认</p>
    </div>
    <ForgeDialog v-model:open="proposalOpen" title="控制提议">
      <div v-if="selectedProposal" class="control-proposal">
        <p class="eyebrow">FORGE / PROPOSAL / {{ selectedProposal.sourceMessageId.slice(0, 8) }}</p>
        <p>{{ selectedProposal.summary }}</p>
        <p v-if="selectedProposal.kind === 'restricted'" role="alert">必须走独立授权和审批；确认本提议也不会合并、推送、部署或删除。</p>
        <p v-else-if="selectedProposal.kind === 'lower_priority'">目前没有已批准 Task 的安全修订命令；优先级不会因聊天文字而改变。</p>
        <p v-else-if="selectedProposal.kind === 'pause_run'">当前没有运行中的 Forge Run；本提议不会发送进程取消命令。</p>
        <p v-else-if="selectedProposal.kind === 'revise_draft'">选择一个未批准草稿，进入现有的 revision 编辑和人工审批流程。</p>
        <div v-if="selectedProposal.kind === 'revise_draft'" class="control-proposal-actions">
          <ForgeButton v-for="item in taskDrafts.filter((entry) => approvalStates[entry.draftId] !== 'approved' &&
            (entry.intent === 'new_task' || entry.status === 'manual'))" :key="item.draftId"
            variant="secondary" size="sm" @click="editProposedDraft(item)">编辑 {{ item.contract?.title ?? '手工草稿' }} · v{{ item.revision }}</ForgeButton>
          <span v-if="!taskDrafts.some((entry) => approvalStates[entry.draftId] !== 'approved')">当前会话没有可修订的草稿。</span>
        </div>
        <ForgeButton variant="secondary" @click="proposalOpen = false">{{ selectedProposal.kind === 'restricted' ?
          '我已了解，仍需独立授权' : '关闭提议' }}</ForgeButton>
      </div>
    </ForgeDialog>
    </template>
  </section>
</template>
