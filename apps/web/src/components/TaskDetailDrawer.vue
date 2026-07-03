<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { finalAcceptanceViewSchema, taskDetailViewSchema,
  type TaskDetailView, type TaskSource } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeDialog, ForgeTabs } from '@forge/ui';
import RunInspector from './RunInspector.vue';
import AcceptanceMatrixPanel from './AcceptanceMatrixPanel.vue';
import VerifyReportPanel from './VerifyReportPanel.vue';
import ReworkStatusPanel from './ReworkStatusPanel.vue';
import FinalAcceptancePanel from './FinalAcceptancePanel.vue';
import DeliveryPanel from './DeliveryPanel.vue';
import TaskChangePanel from './TaskChangePanel.vue';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean; readOnly?: boolean }>();
const emit = defineEmits<{ runChanged: [] }>();
const open = defineModel<boolean>('open', { required: true });
const data = ref<TaskDetailView | null>(null);
const loading = ref(false);
const error = ref('');
const acceptanceBlockReason = ref('');
const activeSource = ref<TaskSource | null>(null);
const detailRoot = ref<HTMLElement | null>(null);
const runRefreshKey = ref(0);
type DetailTab = 'overview' | 'activity' | 'changes' | 'review';
const tab = ref<DetailTab>('overview');
const tabs = [
  { id: 'overview', label: '概览' },
  { id: 'activity', label: '运行' },
  { id: 'changes', label: '变更' },
  { id: 'review', label: '审查与验收' },
];
const taskState = computed(() => data.value?.detail.task.state);
const statePresentation = computed(() => {
  switch (taskState.value) {
    case 'todo': return { label: '待开始', tone: 'neutral' as const,
      description: data.value?.detail.task.blockReason ?? '任务已批准，等待你明确启动。',
      action: '配置并启动', target: 'activity' as const };
    case 'active': return { label: '进行中', tone: 'info' as const,
      description: data.value?.detail.task.blockReason ?? '查看本次运行的真实活动和文件变更。',
      action: '查看运行', target: 'activity' as const };
    case 'blocked': return { label: '已阻断', tone: 'warning' as const,
      description: data.value?.detail.task.blockReason ?? '查看运行记录了解阻断原因。',
      action: '查看阻断', target: 'review' as const };
    case 'awaiting_acceptance': return { label: '待验收', tone: 'warning' as const,
      description: 'Review、Verify 和人工验收都需要真实证据。',
      action: '查看验收', target: 'review' as const };
    case 'done': return { label: '已交付', tone: 'success' as const,
      description: data.value?.detail.task.blockReason ?? '已人工接受；合并、推送和部署均为独立操作。',
      action: '查看交付', target: 'review' as const };
    default: return null;
  }
});
const nextAction = computed(() => {
  if (props.readOnly) return { label: '查看历史运行', target: 'activity' as const };
  if (acceptanceBlockReason.value) return { label: '查看验收状态', target: 'review' as const };
  return statePresentation.value ? {
    label: statePresentation.value.action, target: statePresentation.value.target,
  } : null;
});
let requestNumber = 0;
const sourceIndex = computed(() => new Map(data.value?.sources.map((source) => [source.ref, source]) ?? []));
function showSource(ref: string): void {
  activeSource.value = sourceIndex.value.get(ref) ?? { ref, kind: 'unknown', status: 'withdrawn',
    text: null, createdAt: null };
}
async function load(): Promise<void> {
  const serial = ++requestNumber;
  data.value = null; activeSource.value = null; error.value = '';
  acceptanceBlockReason.value = '';
  if (!open.value || !props.connected) return;
  loading.value = true;
  try {
    const result = await props.client.board({ type: 'task.detail', payload: {
      projectId: props.projectId, taskId: props.taskId,
    } });
    if (serial !== requestNumber) return;
    if (!result.ok) { error.value = result.error.code === 'TASK_NOT_FOUND' ?
      '这个项目中找不到该 Task；链接可能已失效。' : '任务详情读取失败。'; return; }
    const parsed = taskDetailViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.detail.task.id !== props.taskId ||
      parsed.data.detail.task.projectId !== props.projectId) {
      error.value = 'Host 返回了无效的任务详情。'; return;
    }
    try {
      const final = await props.client.run({ type:'run.finalAcceptance', payload:{
        projectId:props.projectId, taskId:props.taskId,
      } });
      if (serial !== requestNumber) return;
      const checked = final.ok ? finalAcceptanceViewSchema.safeParse(final.data) : null;
      if (!checked?.success || checked.data.projectId !== props.projectId ||
        checked.data.taskId !== props.taskId) {
        acceptanceBlockReason.value = '最终验收状态无法核对；新运行和证据写入已暂停，请刷新或检查 Host。';
      } else if (checked.data.blockers.includes('ACCEPTANCE_BASIS_CHANGED')) {
        acceptanceBlockReason.value = '已接受交付的证据发生变化；新运行和证据写入已暂停。历史记录仍可查看。';
      } else if (checked.data.status === 'accepted' &&
        parsed.data.detail.task.state !== 'done') {
        acceptanceBlockReason.value = '当前快照已由 Owner 接受；需要受控修订后才能启动新运行。';
      }
    } catch {
      if (serial !== requestNumber) return;
      acceptanceBlockReason.value = '最终验收状态无法核对；新运行和证据写入已暂停，请刷新或检查 Host。';
    }
    if (props.readOnly) acceptanceBlockReason.value =
      '这是历史只读数据集；新运行和证据写入已关闭。';
    data.value = parsed.data;
  } catch { if (serial === requestNumber) error.value = '任务详情读取失败。'; }
  finally { if (serial === requestNumber) loading.value = false; }
}
async function goToNextAction(): Promise<void> {
  if (nextAction.value) tab.value = nextAction.value.target;
  await nextTick();
  detailRoot.value?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
}
function onRunChanged(): void { runRefreshKey.value += 1; emit('runChanged'); void load(); }
watch(() => [open.value, props.projectId, props.taskId, props.connected], () => {
  tab.value = 'overview'; void load();
},
  { immediate: true });
</script>

<template>
  <ForgeDialog v-model:open="open" :title="data?.detail.contract.title ?? '任务详情'"
    :close-on-overlay="false">
    <div ref="detailRoot" class="task-detail">
      <p v-if="loading" role="status">正在读取任务详情…</p>
      <p v-else-if="!connected" role="alert">Host 不可用；任务详情未加载。</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <template v-else-if="data">
        <header class="task-detail-summary">
          <div class="task-detail-meta">
            <ForgeBadge v-if="statePresentation" :tone="statePresentation.tone">{{ statePresentation.label }}</ForgeBadge>
            <span>已批准 v{{ data.detail.contract.revision }}</span>
            <span class="task-detail-id" :title="data.detail.task.id">{{ data.detail.task.id.slice(0, 8) }}</span>
          </div>
          <p v-if="statePresentation">{{ statePresentation.description }}</p>
          <p v-if="acceptanceBlockReason" class="task-detail-warning" role="alert">{{ acceptanceBlockReason }}</p>
        </header>
        <ForgeTabs v-model="tab" label="任务详情" :tabs="tabs">
          <div v-show="tab === 'overview'" class="task-detail-pane task-detail-overview">
            <section class="task-detail-lead"><h3>目标</h3><p>{{ data.detail.contract.goal }}</p></section>
            <section><h3>验收条件</h3>
              <ol class="task-detail-acceptance"><li v-for="item in data.detail.contract.acceptance" :key="item.id">
                <strong>{{ item.id }} · {{ item.statement }}</strong>
                <small>{{ item.method === 'automated' ? '自动化' : item.method === 'manual' ? '人工' : '检查' }} · {{ item.required ? '必须满足' : '可选' }}</small>
                <div class="task-detail-source-links"><span>来源</span>
                  <template v-if="item.sourceRefs.length"><ForgeButton v-for="ref in item.sourceRefs" :key="ref"
                    variant="ghost" size="sm" @click="showSource(ref)">{{ ref.startsWith('decision:') ? '用户决定' : ref.startsWith('message:') ? '原始消息' : '来源引用' }} · {{ ref.split(':').at(-1)?.slice(0, 8) }}</ForgeButton></template>
                  <span v-else>未记录来源</span>
                </div>
              </li></ol>
            </section>
            <section v-if="activeSource" class="task-detail-evidence" aria-live="polite">
              <h3>{{ activeSource.kind === 'decision' ? '用户决定' : activeSource.kind === 'message' ? '原始消息' : '来源引用' }}</h3>
              <p v-if="activeSource.status === 'available'">{{ activeSource.text }}</p>
              <p v-else>来源已撤回或无法定位。</p>
              <small>{{ activeSource.ref }}<template v-if="activeSource.createdAt"> · {{ activeSource.createdAt }}</template></small>
            </section>
            <section><h3>任务来源</h3>
              <div class="task-detail-source-links"><template v-if="data.detail.contract.sourceRefs.length">
                <ForgeButton v-for="ref in data.detail.contract.sourceRefs" :key="ref" variant="ghost" size="sm"
                  @click="showSource(ref)">{{ ref.startsWith('decision:') ? '用户决定' : ref.startsWith('message:') ? '原始消息' : '来源引用' }} · {{ ref.split(':').at(-1)?.slice(0, 8) }}</ForgeButton>
              </template><span v-else>未记录来源</span></div>
            </section>
            <details class="task-detail-more"><summary>范围、约束与依赖</summary>
              <section><h3>约束</h3><p v-if="!data.detail.contract.constraints.length">无额外约束</p>
                <ul v-else><li v-for="item in data.detail.contract.constraints" :key="item">{{ item }}</li></ul></section>
              <section><h3>范围</h3><p v-if="!data.detail.contract.scope.length">未单独列明</p>
                <ul v-else><li v-for="item in data.detail.contract.scope" :key="item">{{ item }}</li></ul>
                <p v-if="data.detail.contract.outOfScope.length">不包含：{{ data.detail.contract.outOfScope.join('；') }}</p></section>
              <section><h3>依赖</h3><p v-if="!data.detail.contract.dependencies.length">没有声明任务依赖</p>
                <ul v-else><li v-for="id in data.detail.contract.dependencies" :key="id">{{ id }}</li></ul></section>
            </details>
          </div>
          <div v-show="tab === 'activity'" class="task-detail-pane task-detail-activity">
            <RunInspector :client="client" :project-id="projectId" :task-id="taskId"
              :task-revision="data.detail.contract.revision" :task-state="data.detail.task.state"
              :acceptance-block-reason="acceptanceBlockReason"
              :connected="connected" :read-only="readOnly" @run-changed="onRunChanged" />
          </div>
          <div v-show="tab === 'changes'" class="task-detail-pane task-detail-changes">
            <p class="task-detail-pane-intro">已批准需求的变更需要单独确认；已有 Run 始终使用冻结版本。</p>
            <TaskChangePanel :client="client" :project-id="projectId" :task-id="taskId"
              :contract="data.detail.contract" :connected="connected" :read-only="readOnly" @changed="onRunChanged" />
            <div class="task-detail-code-link"><span>代码文件与 Diff 在运行记录中。</span>
              <ForgeButton variant="ghost" size="sm" @click="tab = 'activity'">查看运行文件</ForgeButton></div>
          </div>
          <div v-show="tab === 'review'" class="task-detail-pane task-detail-review">
            <AcceptanceMatrixPanel :client="client" :project-id="projectId" :task-id="taskId"
              :task-state="data.detail.task.state" :connected="connected"
              :acceptance-block-reason="acceptanceBlockReason"
              @decision-changed="runRefreshKey += 1" />
            <VerifyReportPanel :client="client" :project-id="projectId" :task-id="taskId"
              :task-revision="data.detail.contract.revision" :task-state="data.detail.task.state"
              :acceptance-block-reason="acceptanceBlockReason"
              :connected="connected" :refresh-key="runRefreshKey" @verification-changed="onRunChanged" />
            <ReworkStatusPanel :key="runRefreshKey" :client="client" :project-id="projectId"
              :task-id="taskId" :connected="connected" @changed="onRunChanged" />
            <FinalAcceptancePanel :client="client" :project-id="projectId" :task-id="taskId"
              :connected="connected" :read-only="readOnly" :refresh-key="runRefreshKey" @accepted="onRunChanged" />
            <DeliveryPanel v-if="data.detail.task.state === 'done'" :client="client"
              :project-id="projectId" :task-id="taskId" :connected="connected" :read-only="readOnly"
              :refresh-key="runRefreshKey" />
          </div>
        </ForgeTabs>
        <footer class="task-detail-actions">
          <ForgeButton v-if="nextAction" variant="primary" size="sm" @click="goToNextAction">
            {{ nextAction.label }}
          </ForgeButton>
        </footer>
      </template>
    </div>
  </ForgeDialog>
</template>
