<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { draftRevisionSchema, taskContractSchema, taskDraftSchema,
  taskApprovalSchema, type DraftRevision, type TaskApproval, type TaskContract,
  type TaskDraft } from '@forge/contracts';
import type { ConversationMessage } from '@forge/contracts';
import { ForgeButton, ForgeDrawer, ForgeInput, ForgeTextarea } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; item: TaskDraft;
  messages: ConversationMessage[] }>();
const emit = defineEmits<{ saved: [draft: TaskDraft]; approvalChanged: [approval: TaskApproval] }>();
const open = defineModel<boolean>('open', { required: true });
const form = ref<TaskContract | null>(null);
const decisionSummary = ref('');
const answers = ref<Record<string, string>>({});
const newQuestion = ref('');
const confirmRemoved = ref(false);
const confirmScope = ref(false);
const busy = ref(false);
const error = ref('');
const history = ref<DraftRevision[]>([]);
const approval = ref<TaskApproval | null>(null);
const approvalConfirmed = ref(false);
const rejectionReason = ref('');
const inspectedSource = ref<string | null>(null);
const fields = ['title', 'type', 'goal', 'acceptance', 'constraints', 'scope', 'outOfScope',
  'dependencies', 'openQuestions', 'assumptions', 'sourceRefs', 'workflowRef', 'priority'] as const;

function initialContract(): TaskContract {
  if (props.item.contract) return structuredClone(toRaw(props.item.contract));
  return { schemaVersion: '1.0', taskId: props.item.draftId, projectId: props.projectId,
    revision: props.item.revision, title: '', type: 'feature', goal: props.item.editableText,
    acceptance: [{ id: 'ac1', statement: '', method: 'manual', required: true, sourceRefs: [] }],
    constraints: [], scope: [], outOfScope: [], dependencies: [], openQuestions: [],
    assumptions: [], sourceRefs: [`message:${props.item.sourceMessageId}`],
    workflowRef: 'standard', priority: 'normal' };
}

async function refreshHistory(): Promise<void> {
  const result = await props.client.draft({ type: 'draft.history', payload: {
    projectId: props.projectId, draftId: props.item.draftId,
  } });
  if (!result.ok) { error.value = result.error.message; return; }
  if (Array.isArray(result.data)) history.value = result.data.filter((entry) =>
    draftRevisionSchema.safeParse(entry).success) as DraftRevision[];
}
async function refreshApproval(): Promise<void> {
  const result = await props.client.approval({ type: 'approval.forDraft', payload: {
    projectId: props.projectId, draftId: props.item.draftId,
  } });
  if (!result.ok) { error.value = result.error.message; return; }
  const parsed = taskApprovalSchema.nullable().safeParse(result.data);
  if (parsed.success) approval.value = parsed.data;
}
watch([open, () => props.item], ([isOpen]) => {
  if (!isOpen) return;
  form.value = initialContract(); answers.value = {}; decisionSummary.value = '';
  newQuestion.value = ''; inspectedSource.value = null;
  confirmRemoved.value = false; confirmScope.value = false; error.value = '';
  approvalConfirmed.value = false; rejectionReason.value = '';
  void refreshHistory(); void refreshApproval();
}, { immediate: true });

const removedAcceptanceIds = computed(() => props.item.contract?.acceptance
  .filter((entry) => !form.value?.acceptance.some((candidate) => candidate.id === entry.id))
  .map((entry) => entry.id) ?? []);
const scopeChanged = computed(() => JSON.stringify(form.value?.scope) !==
  JSON.stringify(props.item.contract?.scope ?? []) || JSON.stringify(form.value?.outOfScope) !==
  JSON.stringify(props.item.contract?.outOfScope ?? []));
const changedFields = computed(() => form.value ? fields.filter((field) =>
  JSON.stringify(form.value?.[field]) !== JSON.stringify(props.item.contract?.[field])) : []);
const unresolved = computed(() => form.value?.openQuestions.filter((q) => !answers.value[q]?.trim()) ?? []);
const unsaved = computed(() => changedFields.value.length > 0 ||
  Object.values(answers.value).some((answer) => answer.trim()) || !!newQuestion.value.trim());

function list(value: string): string[] { return value.split('\n').map((part) => part.trim()).filter(Boolean); }
function lines(value: string[]): string { return value.join('\n'); }
function setList(field: 'scope' | 'outOfScope' | 'constraints' | 'assumptions', value: string): void {
  if (form.value) form.value[field] = list(value);
}
function addAcceptance(): void {
  if (!form.value) return;
  let number = 1;
  while (form.value.acceptance.some((entry) => entry.id === `ac${number}`) ||
    props.item.contract?.acceptance.some((entry) => entry.id === `ac${number}`)) number += 1;
  form.value.acceptance.push({ id: `ac${number}`, statement: '', method: 'manual',
    required: true, sourceRefs: [] });
}
function addQuestion(): void {
  const question = newQuestion.value.trim();
  if (form.value && question && !form.value.openQuestions.includes(question)) {
    form.value.openQuestions.push(question); newQuestion.value = '';
  }
}
function preview(value: unknown): string {
  if (value === undefined || value === null) return '（无）';
  if (Array.isArray(value)) return value.length ? value.map((entry) =>
    typeof entry === 'object' && entry !== null && 'id' in entry ?
      `${String(entry.id)}: ${String('statement' in entry ? entry.statement : '')}` : String(entry)).join('；') : '（空）';
  return String(value);
}
function sourceDetail(refId: string): string {
  if (refId.startsWith('message:')) {
    const message = props.messages.find((entry) => entry.messageId === refId.slice('message:'.length));
    return message ? `原始消息：${message.content}` : '来源消息已撤回或当前不可用';
  }
  if (refId.startsWith('decision:')) {
    const revision = history.value.find((entry) => entry.decisionId === refId.slice('decision:'.length));
    return revision?.decisionSummary ? `用户决定：${revision.decisionSummary}` : '用户决定记录当前不可用';
  }
  return '来源记录当前不可用';
}
function previousRevision(entry: DraftRevision): DraftRevision | undefined {
  return history.value.find((candidate) => candidate.revision === entry.revision - 1);
}
function revisionValue(entry: DraftRevision | undefined, field: string): unknown {
  if (field === 'editableText') return entry?.editableText;
  if (field === 'contract') return entry?.contract?.title;
  if (!entry?.contract || !(field in entry.contract)) return undefined;
  return entry.contract[field as keyof TaskContract];
}

async function save(): Promise<void> {
  if (!form.value || busy.value || approval.value?.status === 'approved') return;
  error.value = '';
  const decisionId = crypto.randomUUID(); const decisionRef = `decision:${decisionId}`;
  const next = structuredClone(toRaw(form.value));
  next.revision = props.item.revision + 1;
  next.openQuestions = next.openQuestions.filter((question) => !answers.value[question]?.trim());
  next.sourceRefs = [...new Set([...next.sourceRefs, decisionRef])];
  next.acceptance = next.acceptance.map((entry) => {
    const old = props.item.contract?.acceptance.find((candidate) => candidate.id === entry.id);
    const changed = !old || old.statement !== entry.statement || old.method !== entry.method ||
      old.required !== entry.required;
    return { ...entry, sourceRefs: [...new Set([...(old?.sourceRefs ?? entry.sourceRefs),
      ...(changed ? [decisionRef] : [])])] };
  });
  const valid = taskContractSchema.safeParse(next);
  if (!valid.success) { error.value = '请填写标题、目标和至少一条有效验收条件。'; return; }
  if (!decisionSummary.value.trim()) { error.value = '请说明这次确认修改的依据。'; return; }
  if (removedAcceptanceIds.value.length && !confirmRemoved.value) {
    error.value = '删除验收项需要明确确认。'; return;
  }
  if (scopeChanged.value && !confirmScope.value) {
    error.value = '范围变化需要明确确认。'; return;
  }
  busy.value = true;
  try {
    const result = await props.client.draft({ type: 'draft.revise', payload: {
      projectId: props.projectId, draftId: props.item.draftId,
      expectedRevision: props.item.revision, contract: valid.data, decisionId,
      decisionSummary: decisionSummary.value.trim(),
      resolvedQuestions: form.value.openQuestions.filter((question) => answers.value[question]?.trim())
        .map((question) => ({ question, answer: answers.value[question]!.trim() })),
      removedAcceptanceIds: removedAcceptanceIds.value,
      confirmScopeChange: scopeChanged.value && confirmScope.value,
    } });
    if (!result.ok) { error.value = result.error.code === 'REVISION_CONFLICT' ?
      '草稿已被其他窗口修改。请关闭后重新打开，查看最新版本。' : result.error.message; return; }
    const parsed = taskDraftSchema.safeParse(result.data);
    if (!parsed.success) { error.value = 'Host 返回了无效草稿。'; return; }
    emit('saved', parsed.data); open.value = false;
  } catch { error.value = '保存失败。当前编辑仍保留在抽屉中。'; }
  finally { busy.value = false; }
}

async function requestApproval(): Promise<void> {
  if (busy.value || unsaved.value || !props.item.contract || props.item.contract.openQuestions.length) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.approval({ type: 'approval.request', payload: {
      projectId: props.projectId, draftId: props.item.draftId,
      expectedRevision: props.item.revision,
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    const parsed = taskApprovalSchema.safeParse(result.data);
    if (!parsed.success) { error.value = 'Host 返回了无效审批请求。'; return; }
    approval.value = parsed.data; emit('approvalChanged', parsed.data);
  } catch { error.value = '无法创建审批请求。'; }
  finally { busy.value = false; }
}
async function decide(value: 'approve' | 'reject'): Promise<void> {
  if (busy.value || !approval.value || approval.value.status !== 'pending') return;
  if (value === 'approve' && (!approvalConfirmed.value || unsaved.value)) return;
  if (value === 'reject' && !rejectionReason.value.trim()) {
    error.value = '请填写拒绝原因。'; return;
  }
  busy.value = true; error.value = '';
  try {
    const result = await props.client.approval({ type: 'approval.decide', payload: {
      projectId: props.projectId, decision: { schemaVersion: '1.0',
        approvalId: approval.value.request.approvalId, decision: value,
        expectedRevision: approval.value.request.expectedRevision,
        scopeHash: approval.value.request.scopeHash,
        reason: value === 'reject' ? rejectionReason.value.trim() : '',
      },
    } });
    if (!result.ok) { error.value = result.error.code === 'APPROVAL_STALE' ?
      '草稿版本或范围已变化。请重新审阅最新 revision。' : result.error.message;
      await refreshApproval(); return; }
    const parsed = taskApprovalSchema.safeParse(result.data);
    if (!parsed.success) { error.value = 'Host 返回了无效审批结果。'; return; }
    approval.value = parsed.data; emit('approvalChanged', parsed.data);
  } catch { error.value = '审批请求失败；没有启动任何任务。'; }
  finally { busy.value = false; }
}
</script>

<template>
  <ForgeDrawer v-model:open="open" title="Task Draft · 编辑与澄清">
    <div v-if="form" class="draft-sheet">
      <p class="availability-note">当前 revision {{ item.revision }}。编辑先保存为草稿；只有你明确批准后才进入 TODO，不会自动开工。</p>
      <ForgeInput v-model="form.title" label="标题" />
      <label class="draft-sheet-label">类型
        <select v-model="form.type"><option value="feature">Feature</option><option value="bug">Bug</option>
          <option value="refactor">Refactor</option><option value="chore">Chore</option></select>
      </label>
      <ForgeTextarea v-model="form.goal" label="目标" :rows="3" />
      <div class="draft-sheet-section"><div class="draft-sheet-row"><h3>验收条件</h3>
        <ForgeButton size="sm" variant="secondary" @click="addAcceptance">添加</ForgeButton></div>
        <div v-for="(criterion, index) in form.acceptance" :key="criterion.id" class="draft-criterion">
          <small>{{ criterion.id }} · {{ criterion.sourceRefs.length }} 条来源</small>
          <div class="draft-source-list"><button v-for="refId in criterion.sourceRefs" :key="refId"
            type="button" @click="inspectedSource = refId">查看{{ refId.startsWith('message:') ? '原始消息' : '用户决定' }}</button></div>
          <p v-if="inspectedSource && criterion.sourceRefs.includes(inspectedSource)" class="draft-source-detail">
            {{ sourceDetail(inspectedSource) }}</p>
          <ForgeTextarea v-model="criterion.statement" :label="`验收条件 ${criterion.id}`" :rows="2" />
          <div class="draft-sheet-row"><label>验证方式 <select v-model="criterion.method"><option value="automated">自动</option>
            <option value="manual">人工</option><option value="inspection">检查</option></select></label>
            <label><input v-model="criterion.required" type="checkbox" /> 必需</label>
            <ForgeButton size="sm" variant="ghost" :disabled="form.acceptance.length === 1"
              @click="form.acceptance.splice(index, 1)">移除</ForgeButton></div>
        </div>
      </div>
      <ForgeTextarea :model-value="lines(form.scope)" label="提议范围（每行一项，变更需确认）" :rows="2"
        @update:model-value="setList('scope', $event)" />
      <ForgeTextarea :model-value="lines(form.outOfScope)" label="范围之外（每行一项）" :rows="2"
        @update:model-value="setList('outOfScope', $event)" />
      <ForgeTextarea :model-value="lines(form.constraints)" label="约束（每行一项）" :rows="2"
        @update:model-value="setList('constraints', $event)" />
      <div class="draft-sheet-section"><h3>待澄清问题</h3>
        <div v-for="question in form.openQuestions" :key="question" class="draft-question">
          <p>{{ question }}</p><ForgeInput :model-value="answers[question] ?? ''"
            label="你的回答（留空则仍阻塞批准）" @update:model-value="answers[question] = $event" />
        </div><ForgeInput v-model="newQuestion" label="新增问题" />
        <ForgeButton size="sm" variant="secondary" :disabled="!newQuestion.trim()" @click="addQuestion">添加问题</ForgeButton>
        <p>{{ unresolved.length }} 项仍未回答；未解问题阻塞后续批准。</p>
      </div>
      <div class="draft-sheet-section"><h3>变更预览</h3>
        <p v-if="!changedFields.length">尚无字段变化</p>
        <ul v-else><li v-for="field in changedFields" :key="field"><strong>{{ field }}</strong>：
          {{ preview(item.contract?.[field]) }} → {{ preview(form[field]) }}</li></ul>
        <p v-if="removedAcceptanceIds.length">将移除验收项：{{ removedAcceptanceIds.join(', ') }}</p>
        <label v-if="removedAcceptanceIds.length"><input v-model="confirmRemoved" type="checkbox" /> 我确认移除这些验收项</label>
        <label v-if="scopeChanged"><input v-model="confirmScope" type="checkbox" /> 我确认范围变化</label>
      </div>
      <ForgeTextarea v-model="decisionSummary" label="本次用户决定 / 修改原因" :rows="2" />
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="draft-sheet-row"><ForgeButton variant="secondary" @click="open = false">关闭</ForgeButton>
        <ForgeButton variant="primary" :disabled="busy || approval?.status === 'approved'"
          @click="save">保存新 revision</ForgeButton></div>
      <div class="draft-sheet-section"><h3>修订历史</h3>
        <details v-for="entry in history" :key="entry.revision" class="draft-history-entry">
          <summary>v{{ entry.revision }} · {{ entry.decisionSummary ?? '初始草稿' }}</summary>
          <p v-for="field in entry.changedFields" :key="field"><strong>{{ field }}</strong>：
            {{ preview(revisionValue(previousRevision(entry), field)) }} → {{ preview(revisionValue(entry, field)) }}</p>
          <p v-for="answer in entry.resolvedQuestions" :key="answer.question">
            澄清：{{ answer.question }} → {{ answer.answer }}</p>
          <p v-if="!entry.changedFields.length && !entry.resolvedQuestions.length">原始草稿快照</p>
        </details>
      </div>
      <div class="draft-sheet-section" aria-label="任务审批">
        <h3>任务审批</h3>
        <p v-if="unsaved">当前有未保存的编辑，请先保存新 revision 再审阅审批。</p>
        <p v-if="!form.openQuestions.length && item.contract && !approval">此草稿可提交人工审批。批准后仅进入 TODO，不会自动开工。</p>
        <p v-if="form.openQuestions.length">仍有 {{ form.openQuestions.length }} 项未解问题，不能提交审批。</p>
        <p v-if="!item.contract">先保存结构化 Task Contract，才能提交审批。</p>
        <ForgeButton v-if="approval?.status !== 'approved' && approval?.status !== 'pending'"
          variant="secondary" :disabled="busy || unsaved || !!item.contract?.openQuestions.length || !item.contract"
          @click="requestApproval">{{ approval ? '重新提交审批' : '提交审批请求' }}</ForgeButton>
        <template v-if="approval?.status === 'pending'">
          <p>待确认：v{{ approval.request.expectedRevision }} · {{ approval.request.summary }}</p>
          <p>范围摘要 {{ approval.request.scopeHash.slice(0, 12) }}… · 到期 {{ approval.request.expiresAt }}</p>
          <label><input v-model="approvalConfirmed" type="checkbox" /> 我已审阅当前目标、验收和范围</label>
          <ForgeButton variant="primary" :disabled="busy || unsaved || !approvalConfirmed"
            @click="decide('approve')">批准并加入 TODO</ForgeButton>
          <ForgeInput v-model="rejectionReason" label="拒绝原因" />
          <ForgeButton variant="ghost" :disabled="busy" @click="decide('reject')">拒绝审批</ForgeButton>
        </template>
        <p v-if="approval?.status === 'approved'">已批准 · TODO · 尚未开工。此草稿 revision 已冻结。</p>
        <p v-if="approval?.status === 'rejected'">已拒绝；没有创建 Task。</p>
        <p v-if="approval?.status === 'expired' || approval?.status === 'superseded'">审批已过期或版本已变化，请重新审阅。</p>
      </div>
    </div>
  </ForgeDrawer>
</template>
