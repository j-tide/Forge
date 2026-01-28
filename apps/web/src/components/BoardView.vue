<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { boardSnapshotSchema, conversationMessageSchema, conversationSchema,
  taskDraftSchema, type BoardColumn, type BoardSnapshot, type BoardTask,
  type ConversationMessage, type TaskDraft } from '@forge/contracts';
import { boardColumns, boardCounts, filterBoardTasks, type BoardFilters } from '@forge/core/task-projection';
import { ForgeBadge, ForgeButton, ForgeDialog, ForgeEmptyState, ForgeInput,
  ForgeTextarea } from '@forge/ui';
import DraftSheet from './DraftSheet.vue';
import TaskDetailDrawer from './TaskDetailDrawer.vue';

const props = defineProps<{ client: ForgeClient; projectId: string | null;
  connected: boolean; refreshKey: number }>();
const emit = defineEmits<{ chooseProject: [] }>();
const snapshot = ref<BoardSnapshot | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const filters = ref<BoardFilters>({ search: '', priority: 'all', state: 'all', executorId: 'all' });
const manualOpen = ref(false);
const manualTitle = ref('');
const manualGoal = ref('');
const manualAcceptance = ref('');
const selectedDraft = ref<TaskDraft | null>(null);
const sourceMessages = ref<ConversationMessage[]>([]);
const draftOpen = ref(false);
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
function openDetail(taskId: string): void {
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

const labels: Record<BoardColumn, string> = { todo: 'TODO', development: '开发中',
  review: 'Review', verify: '验证', done: 'Done' };
const visible = computed(() => filterBoardTasks(snapshot.value?.tasks ?? [], filters.value));
const totalCounts = computed(() => boardCounts(snapshot.value?.tasks ?? []));
const visibleCounts = computed(() => boardCounts(visible.value));
const agents = computed(() => [...new Set((snapshot.value?.tasks ?? []).map((task) => task.executorId)
  .filter((id): id is string => id !== null))]);
const anyTasks = computed(() => (snapshot.value?.tasks.length ?? 0) > 0);
const filtersActive = computed(() => filters.value.search.trim() !== '' ||
  filters.value.priority !== 'all' || filters.value.state !== 'all' ||
  filters.value.executorId !== 'all');
const itemHeight = 132;
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
  if (!projectId || !props.connected) { snapshot.value = null; error.value = ''; return; }
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
  if (!board || saving.value || !props.connected || filtersActive.value || task.boardColumn !== 'todo') return;
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
function dragStart(task: BoardTask): void { dragged = { taskId: task.id, column: task.boardColumn }; }
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

async function createManual(): Promise<void> {
  const projectId = props.projectId;
  if (!projectId || !props.connected || saving.value || !manualTitle.value.trim() ||
    !manualGoal.value.trim() || !manualAcceptance.value.trim()) return;
  saving.value = true; error.value = '';
  try {
    const title = manualTitle.value.trim();
    const goal = manualGoal.value.trim();
    const acceptance = manualAcceptance.value.trim();
    const created = await props.client.conversation({ type: 'conversation.create', payload: {
      projectId, title: `手工任务 · ${title}`.slice(0, 160), expectedRevision: 0,
    } });
    if (!created.ok) throw new Error(created.error.message);
    const conversation = conversationSchema.parse(created.data);
    const text = `${title}\n\n${goal}\n\n验收：${acceptance}`;
    const sent = await props.client.conversation({ type: 'conversation.send', payload: {
      projectId, conversationId: conversation.conversationId, idempotencyKey: crypto.randomUUID(),
      text, attachmentIds: [],
    } });
    if (!sent.ok) throw new Error(sent.error.message);
    const message = conversationMessageSchema.parse((sent.data as { message: unknown }).message);
    const begun = await props.client.draft({ type: 'draft.manual', payload: {
      projectId, conversationId: conversation.conversationId, sourceMessageId: message.messageId,
      idempotencyKey: crypto.randomUUID(),
    } });
    if (!begun.ok) throw new Error(begun.error.message);
    const draft = taskDraftSchema.parse(begun.data);
    const decisionId = crypto.randomUUID();
    const refs = [`message:${message.messageId}`, `decision:${decisionId}`];
    const revised = await props.client.draft({ type: 'draft.revise', payload: {
      projectId, draftId: draft.draftId, expectedRevision: draft.revision,
      decisionId, decisionSummary: '用户从看板手工建立任务草稿',
      resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: false,
      contract: { schemaVersion: '1.0', taskId: draft.draftId, projectId,
        revision: draft.revision + 1, title, type: 'feature', goal,
        acceptance: [{ id: 'ac1', statement: acceptance, method: 'manual', required: true,
          sourceRefs: refs }], constraints: [], scope: [], outOfScope: [], dependencies: [],
        openQuestions: [], assumptions: [], sourceRefs: refs,
        workflowRef: 'standard', priority: 'normal',
      },
    } });
    if (!revised.ok) throw new Error(revised.error.message);
    selectedDraft.value = taskDraftSchema.parse(revised.data);
    sourceMessages.value = [message];
    manualOpen.value = false; draftOpen.value = true;
    manualTitle.value = ''; manualGoal.value = ''; manualAcceptance.value = '';
    notice.value = '手工草稿已保存。请审阅并单独批准，才会进入 TODO。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '手工草稿创建失败。'; }
  finally { saving.value = false; }
}
function onApproved(): void { void load(); }
</script>

<template>
  <section class="board-view" aria-labelledby="board-title">
    <header class="board-heading"><div><p class="eyebrow">WORKSPACE / BOARD</p>
      <h2 id="board-title">研发看板</h2>
      <p>只有真实批准的任务会进入 TODO；批准不会自动开工。</p></div>
      <ForgeBadge>{{ snapshot?.tasks.length ?? 0 }} 项任务</ForgeBadge></header>
    <div v-if="!projectId" class="empty-board"><ForgeEmptyState title="先选择项目"
      description="连接真实项目后，才会显示该项目的任务。" />
      <ForgeButton variant="primary" @click="emit('chooseProject')">选择项目</ForgeButton></div>
    <div v-else-if="!connected" class="empty-board"><ForgeEmptyState title="Host 不可用"
      description="当前无法读取任务；不会把旧快照显示为在线状态。" /></div>
    <template v-else>
      <div class="board-toolbar">
        <ForgeInput v-model="filters.search" label="搜索任务" placeholder="标题或 Task ID" />
        <label>状态 <select v-model="filters.state" aria-label="按状态筛选"><option value="all">全部</option>
          <option v-for="column in boardColumns" :key="column" :value="column">{{ labels[column] }}</option></select></label>
        <label>优先级 <select v-model="filters.priority" aria-label="按优先级筛选"><option value="all">全部</option>
          <option value="urgent">Urgent</option><option value="high">High</option>
          <option value="normal">Normal</option><option value="low">Low</option></select></label>
        <label>Executor <select v-model="filters.executorId" aria-label="按 Executor 筛选"><option value="all">全部</option>
          <option value="">未分配</option><option v-for="agent in agents" :key="agent" :value="agent">{{ agent }}</option></select></label>
        <ForgeButton variant="primary" :disabled="!connected" @click="manualOpen = true">手工创建任务</ForgeButton>
      </div>
      <p v-if="loading" role="status" class="board-feedback">正在读取 Host 看板…</p>
      <p v-if="error" role="alert" class="board-feedback board-error">{{ error }}</p>
      <p v-if="notice" role="status" class="board-feedback">{{ notice }}</p>
      <div v-if="!loading && !error && !anyTasks" class="board-empty-inline">
        <ForgeEmptyState title="还没有任务" description="从一条想法或手工草稿开始；经你批准后才会进入 TODO。" />
        <ForgeButton variant="secondary" @click="manualOpen = true">新建手工草稿</ForgeButton>
      </div>
      <p v-else-if="!loading && !visible.length && anyTasks" class="board-feedback">没有符合筛选条件的任务；原任务状态未改变。</p>
      <div class="board-columns" aria-label="五列任务看板">
        <section v-for="column in boardColumns" :key="column" class="board-column" :aria-label="`${labels[column]} 列`">
          <header><strong>{{ labels[column] }}</strong><span>{{ visibleCounts[column] }} / {{ totalCounts[column] }}</span></header>
          <div class="board-column-scroll" @scroll="onScroll(column, $event)" @dragover.prevent
            @drop.prevent="dropColumn(column)">
            <div :style="{ height: `${windowStart(column) * itemHeight}px` }" aria-hidden="true" />
            <article v-for="(task, offset) in columnTasks(column).slice(windowStart(column), windowEnd(column))"
              :key="task.id" :data-task-id="task.id" class="board-task" tabindex="0"
              :draggable="column === 'todo' && !filtersActive" @dragstart="dragStart(task)" @dragend="dragged = null"
              @drop.stop.prevent="drop(task)" @click="openDetail(task.id)"
              @keydown.enter.self.prevent="openDetail(task.id)" @keydown.space.self.prevent="openDetail(task.id)">
              <small>{{ task.id.slice(0, 8) }} · {{ task.priority }}</small>
              <h3>{{ task.title }}</h3>
              <p>{{ task.blockReason ?? (task.boardColumn === 'todo' ? '已批准 · 尚未开工' : '真实开发运行中') }}</p>
              <div v-if="column === 'todo'" class="board-card-actions">
                <button type="button" :disabled="saving || filtersActive || offset + windowStart(column) === 0"
                  :aria-label="`上移 ${task.title}`" @click.stop="reorder(task, offset + windowStart(column) - 1)">↑</button>
                <button type="button" :disabled="saving || filtersActive || offset + windowStart(column) === columnTasks(column).length - 1"
                  :aria-label="`下移 ${task.title}`" @click.stop="reorder(task, offset + windowStart(column) + 1)">↓</button>
              </div>
            </article>
            <div :style="{ height: `${Math.max(0, columnTasks(column).length - windowEnd(column)) * itemHeight}px` }" aria-hidden="true" />
            <p v-if="!columnTasks(column).length" class="board-column-empty">{{ column === 'todo' ? '暂无待办' : '当前无真实任务' }}</p>
          </div>
        </section>
      </div>
      <p class="board-footnote">跨列状态由 Review、Verify 和人工验收门禁决定；这里不能直接拖成 Done。</p>
    </template>
    <ForgeDialog v-model:open="manualOpen" title="手工创建任务草稿">
      <div class="board-manual-form"><p>先保存手工草稿，再单独审阅并批准；不会运行项目代码。</p>
        <ForgeInput v-model="manualTitle" label="任务标题" />
        <ForgeTextarea v-model="manualGoal" label="目标" :rows="3" />
        <ForgeTextarea v-model="manualAcceptance" label="验收条件" :rows="2" />
        <p v-if="error" role="alert">{{ error }}</p>
        <ForgeButton variant="primary" :disabled="saving || !manualTitle.trim() || !manualGoal.trim() || !manualAcceptance.trim()"
          @click="createManual">保存手工草稿</ForgeButton></div>
    </ForgeDialog>
    <DraftSheet v-if="selectedDraft && projectId" v-model:open="draftOpen" :item="selectedDraft" :client="client"
      :project-id="projectId" :messages="sourceMessages" @saved="selectedDraft = $event"
      @approval-changed="onApproved" />
    <TaskDetailDrawer v-if="selectedTaskId && projectId" :open="detailOpen" :client="client"
      :project-id="projectId" :task-id="selectedTaskId" :connected="connected"
      @run-changed="load"
      @update:open="detailOpenChanged" />
  </section>
</template>
