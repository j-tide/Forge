<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { taskDetailViewSchema, type TaskDetailView, type TaskSource } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeDrawer } from '@forge/ui';
import RunInspector from './RunInspector.vue';
import AcceptanceMatrixPanel from './AcceptanceMatrixPanel.vue';
import VerifyReportPanel from './VerifyReportPanel.vue';
import ReworkStatusPanel from './ReworkStatusPanel.vue';
import FinalAcceptancePanel from './FinalAcceptancePanel.vue';
import DeliveryPanel from './DeliveryPanel.vue';
import TaskChangePanel from './TaskChangePanel.vue';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean }>();
const emit = defineEmits<{ runChanged: [] }>();
const open = defineModel<boolean>('open', { required: true });
const data = ref<TaskDetailView | null>(null);
const loading = ref(false);
const error = ref('');
const activeSource = ref<TaskSource | null>(null);
const runRefreshKey = ref(0);
let requestNumber = 0;
const sourceIndex = computed(() => new Map(data.value?.sources.map((source) => [source.ref, source]) ?? []));
function showSource(ref: string): void {
  activeSource.value = sourceIndex.value.get(ref) ?? { ref, kind: 'unknown', status: 'withdrawn',
    text: null, createdAt: null };
}
async function load(): Promise<void> {
  const serial = ++requestNumber;
  data.value = null; activeSource.value = null; error.value = '';
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
    data.value = parsed.data;
  } catch { if (serial === requestNumber) error.value = '任务详情读取失败。'; }
  finally { if (serial === requestNumber) loading.value = false; }
}
function onRunChanged(): void { runRefreshKey.value += 1; emit('runChanged'); void load(); }
watch(() => [open.value, props.projectId, props.taskId, props.connected], () => { void load(); },
  { immediate: true });
</script>

<template>
  <ForgeDrawer v-model:open="open" title="任务详情">
    <div class="task-detail">
      <p v-if="loading" role="status">正在读取已批准的任务版本…</p>
      <p v-else-if="!connected" role="alert">Host 不可用；任务详情未加载。</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <template v-else-if="data">
        <p class="eyebrow">FORGE / TASK / {{ data.detail.task.id }}</p>
        <h3>{{ data.detail.contract.title }}</h3>
        <div class="task-detail-meta"><ForgeBadge>{{ data.detail.task.state === 'todo' ? 'TODO' :
          data.detail.task.state === 'done' ? 'Done · 交付' :
          data.detail.task.state === 'blocked' ? '已阻断' : '开发中' }}
          · {{ data.detail.task.blockReason ?? (data.detail.task.state === 'todo' ? '尚未开工' : '真实运行中') }}</ForgeBadge>
          <span>已批准 revision {{ data.detail.contract.revision }}</span></div>
        <section><h4>目标</h4><p>{{ data.detail.contract.goal }}</p></section>
        <section><h4>验收条件</h4>
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
          <h4>{{ activeSource.kind === 'decision' ? '用户决定' : activeSource.kind === 'message' ? '原始消息' : '来源引用' }}</h4>
          <p v-if="activeSource.status === 'available'">{{ activeSource.text }}</p>
          <p v-else>来源已撤回或无法定位。</p>
          <small>{{ activeSource.ref }}<template v-if="activeSource.createdAt"> · {{ activeSource.createdAt }}</template></small>
        </section>
        <section><h4>任务来源</h4>
          <div class="task-detail-source-links"><template v-if="data.detail.contract.sourceRefs.length">
            <ForgeButton v-for="ref in data.detail.contract.sourceRefs" :key="ref" variant="ghost" size="sm"
              @click="showSource(ref)">{{ ref.startsWith('decision:') ? '用户决定' : ref.startsWith('message:') ? '原始消息' : '来源引用' }} · {{ ref.split(':').at(-1)?.slice(0, 8) }}</ForgeButton>
          </template><span v-else>未记录来源</span></div>
        </section>
        <section><h4>约束</h4><p v-if="!data.detail.contract.constraints.length">无额外约束</p>
          <ul v-else><li v-for="item in data.detail.contract.constraints" :key="item">{{ item }}</li></ul></section>
        <section><h4>范围</h4><p v-if="!data.detail.contract.scope.length">未单独列明</p>
          <ul v-else><li v-for="item in data.detail.contract.scope" :key="item">{{ item }}</li></ul>
          <p v-if="data.detail.contract.outOfScope.length">不包含：{{ data.detail.contract.outOfScope.join('；') }}</p></section>
        <section><h4>依赖</h4><p v-if="!data.detail.contract.dependencies.length">没有声明任务依赖</p>
          <ul v-else><li v-for="id in data.detail.contract.dependencies" :key="id">{{ id }}</li></ul></section>
        <TaskChangePanel :client="client" :project-id="projectId" :task-id="taskId"
          :contract="data.detail.contract" :connected="connected" @changed="onRunChanged" />
        <section><RunInspector :client="client" :project-id="projectId" :task-id="taskId"
          :task-revision="data.detail.contract.revision" :task-state="data.detail.task.state"
          :connected="connected" @run-changed="onRunChanged" /></section>
        <AcceptanceMatrixPanel :client="client" :project-id="projectId" :task-id="taskId"
          :connected="connected" @decision-changed="runRefreshKey += 1" />
        <VerifyReportPanel :client="client" :project-id="projectId" :task-id="taskId"
          :connected="connected" :refresh-key="runRefreshKey" />
        <ReworkStatusPanel :key="runRefreshKey" :client="client" :project-id="projectId"
          :task-id="taskId" :connected="connected" />
        <FinalAcceptancePanel :client="client" :project-id="projectId" :task-id="taskId"
          :connected="connected" :refresh-key="runRefreshKey" @accepted="onRunChanged" />
        <DeliveryPanel v-if="data.detail.task.state === 'done'" :client="client"
          :project-id="projectId" :task-id="taskId" :connected="connected"
          :refresh-key="runRefreshKey" />
      </template>
    </div>
  </ForgeDrawer>
</template>
