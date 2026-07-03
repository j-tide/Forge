<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { boardSnapshotSchema, type BoardColumn, type BoardSnapshot, type BoardTask } from '@forge/contracts';
import { boardColumns, boardCounts, filterBoardTasks, type BoardFilters } from '@forge/core/task-projection';
import { ForgeBadge, ForgeButton, ForgeEmptyState, ForgeInput } from '@forge/ui';
import TaskDetailDrawer from './TaskDetailDrawer.vue';

const props = defineProps<{ client: ForgeClient; projectId: string | null;
  connected: boolean; readOnly?: boolean; refreshKey: number }>();
const emit = defineEmits<{ 'choose-project': []; 'new-task': [] }>();
const snapshot = ref<BoardSnapshot | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const filters = ref<BoardFilters>({ search: '', priority: 'all', state: 'all', executorId: 'all' });
const selectedTaskId = ref<string | null>(null);
const detailOpen = ref(false);
function readTaskHash(): string | null {
  const match = /^#\/tasks\/([0-9a-f-]{36})$/i.exec(location.hash);
  return match && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[1]!) ? match[1]! : null;
}
function syncTaskHash(): void {
  const id = readTaskHash();
  selectedTaskId.value = id;
  detailOpen.value = id !== null;
}
function openDetail(taskId: string, trigger?: Event): void {
  if (trigger?.currentTarget instanceof HTMLElement) trigger.currentTarget.focus();
  location.hash = `#/tasks/${taskId}`;
  syncTaskHash();
}
function detailOpenChanged(value: boolean): void {
  detailOpen.value = value;
  if (!value && readTaskHash() === selectedTaskId.value) location.hash = '#/board';
  if (!value) selectedTaskId.value = null;
}
const scrollTop = ref<Record<BoardColumn, number>>({ todo: 0, development: 0,
  review: 0, verify: 0, done: 0 });
let dragged: { taskId: string; column: BoardColumn } | null = null;
let requestNumber = 0;

const labels: Record<BoardColumn, string> = { todo: '待办', development: '开发',
  review: '审查', verify: '验证与验收', done: '完成' };
const emptyLabels: Record<BoardColumn, string> = { todo: '暂无待办任务',
  development: '没有开发中的任务', review: '没有待审查任务', verify: '没有待验证任务', done: '暂无已完成任务' };
const priorityLabels: Record<BoardTask['priority'], string> = {
  low: '低优先级', normal: '普通', high: '高优先级', urgent: '紧急',
};
const visible = computed(() => filterBoardTasks(snapshot.value?.tasks ?? [], filters.value));
const totalCounts = computed(() => boardCounts(snapshot.value?.tasks ?? []));
const visibleCounts = computed(() => boardCounts(visible.value));
const agents = computed(() => [...new Set((snapshot.value?.tasks ?? []).map((task) => task.executorId)
  .filter((id): id is string => id !== null))]);
const anyTasks = computed(() => (snapshot.value?.tasks.length ?? 0) > 0);
const filtersActive = computed(() => filters.value.search.trim() !== '' ||
  filters.value.priority !== 'all' || filters.value.state !== 'all' ||
  filters.value.executorId !== 'all');
function clearFilters(): void {
  filters.value = { search: '', priority: 'all', state: 'all', executorId: 'all' };
}
function taskCaption(task: BoardTask): string {
  if (task.blockReason) return task.blockReason;
  if (task.state === 'blocked') return '等待处理';
  if (task.state === 'awaiting_acceptance') return '等待你验收';
  if (task.state === 'done') return '已完成验收';
  const stageLabels: Record<BoardColumn, string> = {
    todo: '已批准 · 待开始', development: '开发阶段', review: '审查阶段',
    verify: '验证阶段', done: '已完成验收',
  };
  return stageLabels[task.boardColumn];
}
function taskStatus(task: BoardTask): string {
  if (task.state === 'blocked') return '需处理';
  if (task.state === 'awaiting_acceptance') return '待验收';
  if (task.state === 'done') return '已完成';
  if (task.state === 'todo') return '待开始';
  return labels[task.boardColumn];
}
function nextAction(task: BoardTask): string {
  if (task.state === 'blocked') return '处理阻塞';
  if (task.state === 'awaiting_acceptance') return '查看验收';
  if (task.state === 'done') return '查看交付';
  if (task.state === 'todo') return '查看并启动';
  return task.boardColumn === 'review' ? '查看审查' :
    task.boardColumn === 'verify' ? '查看验证' : '查看运行';
}
const itemHeight = 164;
const viewportItems = 5;
const overscan = 2;
function columnTasks(column: BoardColumn): BoardTask[] {
  return visible.value.filter((task) => task.boardColumn === column);
}
function windowStart(column: BoardColumn): number {
  return Math.max(0, Math.floor(scrollTop.value[column] / itemHeight) - overscan);
}
function windowEnd(column: BoardColumn): number {
  return Math.min(columnTasks(column).length, windowStart(column) + viewportItems + overscan * 2);
}
function onScroll(column: BoardColumn, event: Event): void {
  scrollTop.value[column] = (event.target as HTMLElement).scrollTop;
}

async function load(): Promise<void> {
  const projectId = props.projectId;
  const serial = ++requestNumber;
  if (!projectId || !props.connected) {
    snapshot.value = null; error.value = ''; loading.value = false; return;
  }
  snapshot.value = null; loading.value = true; error.value = '';
  try {
    const result = await props.client.board({ type: 'board.snapshot', payload: { projectId } });
    if (serial !== requestNumber || props.projectId !== projectId) return;
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = boardSnapshotSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Host 返回了无效看板快照。'; return; }
    snapshot.value = checked.data;
  } catch { if (serial === requestNumber) error.value = '看板读取失败；请检查 Host 连接。'; }
  finally { if (serial === requestNumber) loading.value = false; }
}
onMounted(() => { void load(); syncTaskHash(); window.addEventListener('hashchange', syncTaskHash); });
onUnmounted(() => { requestNumber += 1; window.removeEventListener('hashchange', syncTaskHash); });
watch(() => [props.projectId, props.connected, props.refreshKey], () => { void load(); });

async function reorder(task: BoardTask, index: number): Promise<void> {
  const board = snapshot.value;
  if (!board || saving.value || !props.connected || props.readOnly || filtersActive.value || task.boardColumn !== 'todo') return;
  const source = board.tasks.filter((item) => item.boardColumn === task.boardColumn)
    .sort((left, right) => left.position - right.position);
  const previous = source.findIndex((item) => item.id === task.id);
  if (previous < 0 || index < 0 || index >= source.length || previous === index) return;
  source.splice(previous, 1);
  source.splice(index, 0, task);
  saving.value = true; error.value = ''; notice.value = '';
  try {
    const result = await props.client.board({ type: 'tasks.reorder', payload: {
      projectId: board.projectId, taskId: task.id,
      expectedBoardRevision: board.boardRevision, idempotencyKey: crypto.randomUUID(),
      beforeTaskId: source[index - 1]?.id ?? null,
      afterTaskId: source[index + 1]?.id ?? null,
    } });
    if (!result.ok) { error.value = result.error.code === 'REVISION_CONFLICT' ?
      '看板已在其他窗口更新，已重新读取最新排序。' : result.error.message;
      await load(); return; }
    const checked = boardSnapshotSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Host 返回了无效排序结果。'; await load(); return; }
    snapshot.value = checked.data;
    notice.value = `已调整 ${task.title} 的 TODO 顺序。`;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)?.focus());
  } catch { error.value = '排序失败；看板状态未被本地伪造。'; await load(); }
  finally { saving.value = false; }
}
function dragStart(task: BoardTask): void {
  if (!props.readOnly) dragged = { taskId: task.id, column: task.boardColumn };
}
function drop(target: BoardTask): void {
  const source = dragged; dragged = null;
  if (!source) return;
  if (filtersActive.value) { error.value = '请先清除筛选，再调整同列顺序。'; return; }
  if (source.column !== target.boardColumn) {
    error.value = '缺少 Review、Verify 与人工验收；不能直接跨列移动到 Done。'; return;
  }
  const tasks = snapshot.value?.tasks.filter((item) => item.boardColumn === source.column)
    .sort((left, right) => left.position - right.position) ?? [];
  const moving = tasks.find((item) => item.id === source.taskId);
  const index = tasks.findIndex((item) => item.id === target.id);
  if (moving) void reorder(moving, index);
}
function dropColumn(column: BoardColumn): void {
  const source = dragged; dragged = null;
  if (source && source.column !== column) {
    error.value = '缺少 Review、Verify 与人工验收；不能直接跨列移动到 Done。';
  }
}

</script>

<template>
  <section class="board-view" aria-labelledby="board-title">
    <header class="board-heading">
      <div class="board-title-group"><h2 id="board-title">研发看板</h2>
        <ForgeBadge v-if="connected && snapshot">{{ snapshot.tasks.length }} 项任务</ForgeBadge>
      </div>
    </header>
    <section v-if="!projectId" class="board-empty-workspace board-empty-workspace--project"
      aria-labelledby="board-empty-project-title">
      <div class="board-empty-workspace-body">
        <p class="board-empty-workspace-kicker">FORGE / WORKSPACE</p>
        <h3 id="board-empty-project-title" class="board-empty-workspace-title">{{ connected ? '选择项目，开始工作' : 'Host 不可用' }}</h3>
        <p class="board-empty-workspace-description">{{ connected
          ? '选择本地项目后，这里会显示它的真实任务与待处理事项。'
          : '连接恢复后即可选择项目并查看任务。' }}</p>
        <div class="board-empty-workspace-actions">
          <ForgeButton variant="primary" :disabled="!connected" @click="emit('choose-project')">选择项目</ForgeButton>
        </div>
      </div>
      <svg class="board-empty-workspace-mark" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
        <g transform="translate(24 20) skewX(-18)">
          <rect x="8" y="0" width="43" height="12" rx="2" />
          <rect x="4" y="20" width="35" height="12" rx="2" />
          <rect x="0" y="40" width="14" height="12" rx="2" />
        </g>
      </svg>
    </section>
    <div v-if="projectId && !connected" class="empty-board"><ForgeEmptyState title="Host 不可用"
      description="连接恢复后即可查看任务。" /></div>
    <template v-if="projectId && connected">
      <div v-if="anyTasks" class="board-toolbar">
        <ForgeInput v-model="filters.search" label="搜索任务" placeholder="搜索标题或任务编号" />
        <label>状态 <select v-model="filters.state" aria-label="按状态筛选"><option value="all">全部状态</option>
          <option v-for="column in boardColumns" :key="column" :value="column">{{ labels[column] }}</option></select></label>
        <label>优先级 <select v-model="filters.priority" aria-label="按优先级筛选"><option value="all">全部优先级</option>
          <option v-for="(label, priority) in priorityLabels" :key="priority" :value="priority">{{ label }}</option></select></label>
        <label v-if="agents.length">执行器 <select v-model="filters.executorId" aria-label="按 Executor 筛选"><option value="all">全部执行器</option>
          <option value="">未分配</option><option v-for="agent in agents" :key="agent" :value="agent">{{ agent }}</option></select></label>
        <ForgeButton v-if="filtersActive" variant="ghost" size="sm" @click="clearFilters">清除筛选</ForgeButton>
      </div>
      <p v-if="loading" role="status" class="board-feedback">正在加载任务…</p>
      <p v-if="error" role="alert" class="board-feedback board-error">{{ error }}</p>
      <ForgeButton v-if="error && !snapshot && !loading" class="board-retry" variant="secondary" @click="load">重试</ForgeButton>
      <p v-if="notice" role="status" class="board-feedback">{{ notice }}</p>
      <p v-if="!loading && !visible.length && anyTasks" role="status" class="board-feedback">没有符合筛选条件的任务。</p>
    </template>
    <section v-if="projectId && connected && snapshot && !anyTasks"
      class="board-empty-workspace board-empty-workspace--tasks" aria-labelledby="board-empty-tasks-title">
      <div class="board-empty-workspace-body">
        <p class="board-empty-workspace-kicker">FORGE / PROJECT</p>
        <h3 id="board-empty-tasks-title" class="board-empty-workspace-title">这个项目还没有任务</h3>
        <p class="board-empty-workspace-description">{{ readOnly
          ? '当前数据集为只读，暂无任务记录。'
          : '描述你想完成的工作。Forge 会先生成可编辑草稿；只有经你批准的任务才会进入待办。' }}</p>
        <div v-if="!readOnly" class="board-empty-workspace-actions">
          <ForgeButton variant="primary" @click="emit('new-task')">新建任务</ForgeButton>
        </div>
      </div>
      <svg class="board-empty-workspace-mark" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
        <g transform="translate(24 20) skewX(-18)">
          <rect x="8" y="0" width="43" height="12" rx="2" />
          <rect x="4" y="20" width="35" height="12" rx="2" />
          <rect x="0" y="40" width="14" height="12" rx="2" />
        </g>
      </svg>
    </section>
      <div v-if="projectId && connected && anyTasks" class="board-columns" aria-label="五列任务看板">
        <section v-for="column in boardColumns" :key="column" class="board-column" :data-column="column" :aria-label="`${labels[column]} 列`">
          <header class="board-column-heading"><strong>{{ labels[column] }}</strong>
            <span v-if="projectId && snapshot" class="board-column-count" :aria-label="`${visibleCounts[column]} 项${labels[column]}任务`">{{ filtersActive ? `${visibleCounts[column]} / ${totalCounts[column]}` : totalCounts[column] }}</span>
          </header>
          <div class="board-column-scroll" @scroll="onScroll(column, $event)" @dragover.prevent @drop.prevent="dropColumn(column)">
            <div :style="{ height: `${windowStart(column) * itemHeight}px` }" aria-hidden="true" />
            <article v-for="(task, offset) in columnTasks(column).slice(windowStart(column), windowEnd(column))"
              :key="task.id" :data-task-id="task.id" :data-state="task.state" :title="task.title" class="board-task" tabindex="0"
              :aria-label="`${task.title} · ${taskStatus(task)}`"
              :draggable="!readOnly && column === 'todo' && !filtersActive" @dragstart="dragStart(task)" @dragend="dragged = null"
              @drop.stop.prevent="drop(task)" @click="openDetail(task.id, $event)"
              @keydown.enter.self.prevent="openDetail(task.id)" @keydown.space.self.prevent="openDetail(task.id)">
              <div class="board-task-heading"><h3>{{ task.title }}</h3>
                <span class="board-task-status">{{ taskStatus(task) }}</span></div>
              <p class="board-task-caption">{{ taskCaption(task) }}</p>
              <div class="board-task-footer">
                <span class="board-task-priority" :data-priority="task.priority">{{ priorityLabels[task.priority] }}</span>
                <button class="board-task-next" type="button" :aria-label="`${readOnly ? '查看记录' : nextAction(task)}：${task.title}`"
                  @click.stop="openDetail(task.id, $event)">{{ readOnly ? '查看记录' : nextAction(task) }} <span aria-hidden="true">→</span></button>
              </div>
              <div v-if="column === 'todo' && !readOnly" class="board-card-actions">
                <button type="button" :disabled="saving || filtersActive || offset + windowStart(column) === 0"
                  :aria-label="`上移 ${task.title}`" @click.stop="reorder(task, offset + windowStart(column) - 1)">↑</button>
                <button type="button" :disabled="saving || filtersActive || offset + windowStart(column) === columnTasks(column).length - 1"
                  :aria-label="`下移 ${task.title}`" @click.stop="reorder(task, offset + windowStart(column) + 1)">↓</button>
              </div>
            </article>
            <div :style="{ height: `${Math.max(0, columnTasks(column).length - windowEnd(column)) * itemHeight}px` }" aria-hidden="true" />
            <div v-if="!columnTasks(column).length" class="board-column-empty">
              <span class="board-column-empty-icon" aria-hidden="true">{{ column === 'done' ? '✓' : '—' }}</span>
              <p>{{ filtersActive ? '没有匹配任务' : emptyLabels[column] }}</p>
            </div>
          </div>
        </section>
      </div>
    <TaskDetailDrawer v-if="selectedTaskId && projectId" :open="detailOpen" :client="client"
      :project-id="projectId" :task-id="selectedTaskId" :connected="connected"
      :read-only="readOnly" @run-changed="load" @update:open="detailOpenChanged" />
  </section>
</template>
