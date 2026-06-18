<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { conversationMessageSchema, conversationSchema, taskApprovalSchema, type TaskApproval,
  taskDraftSchema, controlProposalSchema, type ControlProposal,
  type TaskDraft, type Conversation, type ConversationMessage } from '@forge/contracts';
import { ForgeButton, ForgeDialog, ForgeTextarea } from '@forge/ui';
import DraftSheet from './DraftSheet.vue';

const props = defineProps<{ client: ForgeClient; projectId: string }>();
const emit = defineEmits<{ approvalChanged: [] }>();
const conversations = ref<Conversation[]>([]);
const current = ref<Conversation | null>(null);
const messages = ref<ConversationMessage[]>([]);
const taskDrafts = ref<TaskDraft[]>([]);
const approvalStates = ref<Record<string, TaskApproval['status']>>({});
const selectedDraft = ref<TaskDraft | null>(null);
const editorOpen = ref(false);
const draft = ref('');
const error = ref('');
const busy = ref(false);
const submitted = ref('');
const proposals = ref<Record<string, ControlProposal>>({});
const selectedProposal = ref<ControlProposal | null>(null);
const proposalOpen = ref(false);
let idempotencyKey: string | null = null;
let unsubscribeEvents: (() => void) | null = null;
let draftPoll: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  error.value = '';
  const result = await props.client.conversation({ type: 'conversation.list',
    payload: { projectId: props.projectId } });
  if (!result.ok) { error.value = result.error.message; return; }
  if (!Array.isArray(result.data)) { error.value = 'Invalid conversation list'; return; }
  conversations.value = result.data.filter((item) => conversationSchema.safeParse(item).success) as Conversation[];
  current.value = conversations.value[0] ?? null;
  await loadMessages();
}

async function loadMessages(): Promise<void> {
  if (!current.value) { messages.value = []; taskDrafts.value = []; return; }
  const result = await props.client.conversation({ type: 'conversation.messages',
    payload: { projectId: props.projectId, conversationId: current.value.conversationId } });
  if (!result.ok) { error.value = result.error.message; return; }
  if (!Array.isArray(result.data)) { error.value = 'Invalid message list'; return; }
  messages.value = result.data.filter((item) => conversationMessageSchema.safeParse(item).success) as ConversationMessage[];
  await loadDrafts();
}

async function loadDrafts(): Promise<void> {
  if (!current.value) return;
  const result = await props.client.draft({ type: 'draft.list', payload: {
    projectId: props.projectId, conversationId: current.value.conversationId,
  } });
  if (!result.ok) { error.value = result.error.message; return; }
  if (Array.isArray(result.data)) taskDrafts.value = result.data.filter((item) =>
    taskDraftSchema.safeParse(item).success) as TaskDraft[];
  const approvals = await Promise.all(taskDrafts.value.map(async (item) => {
    const approval = await props.client.approval({ type: 'approval.forDraft', payload: {
      projectId: props.projectId, draftId: item.draftId,
    } });
    const checked = approval.ok ? taskApprovalSchema.nullable().safeParse(approval.data) : null;
    return [item.draftId, checked?.success ? checked.data?.status : undefined] as const;
  }));
  const states: Record<string, TaskApproval['status']> = {};
  for (const [draftId, status] of approvals) if (status) states[draftId] = status;
  approvalStates.value = states;
  if (taskDrafts.value.some((item) => item.status === 'generating')) startDraftPolling();
  else stopDraftPolling();
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
  if (!current.value || busy.value || taskDrafts.value.some((item) => item.sourceMessageId === message.messageId)) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.draft({ type: mode, payload: {
      projectId: props.projectId, conversationId: current.value.conversationId,
      sourceMessageId: message.messageId, idempotencyKey: crypto.randomUUID(),
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    await loadDrafts();
  } catch { error.value = '草稿请求失败；项目文件未执行或修改。'; }
  finally { busy.value = false; }
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
  current.value = conversation; draft.value = ''; submitted.value = ''; idempotencyKey = null;
  proposals.value = {}; selectedProposal.value = null; proposalOpen.value = false;
  await loadMessages();
}

function newConversation(): void {
  stopDraftPolling(); taskDrafts.value = []; approvalStates.value = {};
  selectedDraft.value = null; editorOpen.value = false;
  current.value = null; messages.value = []; draft.value = ''; submitted.value = '';
  proposals.value = {}; selectedProposal.value = null; proposalOpen.value = false;
  error.value = ''; idempotencyKey = null;
}

function openDraftEditor(item: TaskDraft): void {
  selectedDraft.value = item; editorOpen.value = true;
}
function onDraftSaved(item: TaskDraft): void {
  taskDrafts.value = taskDrafts.value.map((entry) => entry.draftId === item.draftId ? item : entry);
  selectedDraft.value = item;
}
function onApprovalChanged(item: TaskApproval): void {
  approvalStates.value = { ...approvalStates.value, [item.draftId]: item.status };
  emit('approvalChanged');
}

async function saveMessage(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value) return;
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
    await loadMessages();
    if (result.data && typeof result.data === 'object' && 'replyStatus' in result.data
      && ['streaming', 'completed'].includes(result.data.replyStatus)) {
      draft.value = ''; submitted.value = ''; idempotencyKey = null;
    } else {
      error.value = '输入已保存在本地会话。可从消息旁选择整理为草稿或手工草稿。';
    }
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
  void load();
});
onUnmounted(() => { unsubscribeEvents?.(); stopDraftPolling(); });
watch(() => props.projectId, () => { newConversation(); void load(); });
</script>

<template>
  <section class="conversation-panel" aria-label="项目会话">
    <div class="conversation-bar"><span>本地会话</span><ForgeButton variant="ghost" size="sm" @click="newConversation">新会话</ForgeButton></div>
    <div v-if="conversations.length" class="conversation-history" aria-label="会话历史">
      <button v-for="item in conversations" :key="item.conversationId" type="button"
        :aria-current="current?.conversationId === item.conversationId ? 'true' : undefined"
        @click="select(item)">{{ item.title }}</button>
    </div>
    <div class="conversation-messages" role="log" aria-live="polite">
      <p v-if="!messages.length" class="conversation-empty">还没有消息。输入会保存在当前项目中；整理草稿由你主动发起。</p>
      <div v-for="item in messages" :key="item.messageId" class="conversation-message">
        <small>{{ item.role === 'user' ? '你' : 'Forge' }} · {{ item.status }}</small>
        <p>{{ item.content }}</p>
        <div v-if="item.role === 'user' && !taskDrafts.some((entry) => entry.sourceMessageId === item.messageId)"
          class="draft-actions">
          <ForgeButton size="sm" variant="secondary" :disabled="busy"
            @click="createDraft(item, 'draft.generate')">整理为草稿</ForgeButton>
          <ForgeButton size="sm" variant="ghost" :disabled="busy"
            @click="createDraft(item, 'draft.manual')">手工草稿</ForgeButton>
        </div>
        <ForgeButton v-if="item.role === 'user'" size="sm" variant="ghost" :disabled="busy"
          @click="propose(item)">识别控制提议</ForgeButton>
      </div>
      <section v-for="item in taskDrafts" :key="item.draftId" class="task-draft-card" aria-label="任务草稿">
        <small>Task Draft · {{ item.status }} · {{ item.modelProvider ?? '手工' }}</small>
        <small v-if="approvalStates[item.draftId] === 'approved'"> · 已批准进入 TODO，尚未开工</small>
        <h3>{{ item.contract?.title ?? '待完善草稿' }}</h3>
        <p class="task-draft-goal">{{ item.contract?.goal ?? item.editableText }}</p>
        <p v-if="item.errorCode" role="status">{{ item.errorCode }}。原始输入已保留，可手工完善。</p>
        <div v-if="item.status === 'manual' || item.status === 'invalid_output'" class="draft-manual-editor">
          <ForgeTextarea v-model="item.editableText" label="草稿文字" :max-height="240" :rows="4" />
          <ForgeButton size="sm" variant="secondary" :disabled="busy || !item.editableText.trim()"
            @click="saveDraftText(item)">保存草稿文字</ForgeButton>
        </div>
        <details v-if="item.contract?.openQuestions.length" class="task-draft-questions">
          <summary>待澄清 {{ item.contract.openQuestions.length }} 项</summary>
          <ul><li v-for="question in item.contract.openQuestions" :key="question">{{ question }}</li></ul>
        </details>
        <ForgeButton v-if="item.status !== 'generating' && (item.intent === 'new_task' || item.status === 'manual')" size="sm" variant="secondary"
          @click="openDraftEditor(item)">{{ approvalStates[item.draftId] === 'approved' ? '查看草稿' : '编辑草稿' }} · v{{ item.revision }}</ForgeButton>
        <p v-if="item.intent === 'control' && !item.contract" class="availability-note">这是控制意图，不是可批准的 Task Contract；请从来源消息打开受控提议。</p>
        <p class="availability-note">{{ approvalStates[item.draftId] === 'approved' ?
          '已进入 TODO；等待后续明确启动，不会自动开发或合并。' : '提议尚未获批准，也不会启动开发或合并。' }}</p>
      </section>
    </div>
    <DraftSheet v-if="selectedDraft" v-model:open="editorOpen" :item="selectedDraft"
      :client="client" :project-id="projectId" :messages="messages"
      @saved="onDraftSaved" @approval-changed="onApprovalChanged" />
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
    <div class="conversation-composer">
      <ForgeTextarea v-model="draft" label="描述你的想法" visually-hidden-label
        placeholder="例如：给订单列表添加日期筛选…" :max-height="240" :rows="4" />
      <div class="compose-action"><span>草稿生成需要本机 Codex 可用；也可选择手工草稿</span><ForgeButton variant="primary"
        :disabled="!draft.trim() || (submitted === draft.trim() && !!idempotencyKey)"
        :loading="busy" @click="saveMessage">保存输入</ForgeButton></div>
      <p v-if="error" role="status" class="conversation-notice">{{ error }}</p>
      <p class="availability-note">消息保存在 Forge Host；保存输入不会创建正式 Task 或执行项目代码。</p>
    </div>
  </section>
</template>
