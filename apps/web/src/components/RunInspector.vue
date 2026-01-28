<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { developmentHandoffSchema, runInspectionSchema, runLaunchCapabilitiesSchema,
  runViewSchema, reviewReportSchema, reviewIssueOccurrenceSchema,
  reviewJobSchema, type ReviewJob, type ReviewReport, type ReviewIssueOccurrence,
  type DevelopmentHandoff, type RunInspection,
  type RunLaunchCapabilities, type RunView } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeSelect, ForgeTabs } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  taskRevision: number; taskState: 'todo' | 'active' | 'blocked' | 'awaiting_acceptance' | 'done';
  connected: boolean }>();
const emit = defineEmits<{ runChanged: [] }>();
const runs = ref<RunView[]>([]);
const selected = ref<string | null>(null);
const inspection = ref<RunInspection | null>(null);
const tab = ref<'activity' | 'files' | 'diff' | 'context' | 'usage'>('activity');
const error = ref('');
const loading = ref(false);
const starting = ref(false);
const cancelling = ref(false);
const capabilities = ref<RunLaunchCapabilities | null>(null);
const modelId = ref('');
const handoff = ref<DevelopmentHandoff | null>(null);
const deliveryError = ref('');
const reviewReports = ref<ReviewReport[]>([]);
const issueHistory = ref<ReviewIssueOccurrence[]>([]);
const reviewJobs = ref<ReviewJob[]>([]);
const startingReview = ref(false);
let pendingReviewId: string | null = null;
const reviewError = ref('');
const currentIssues = computed(() => {
  const latest = new Map<string, ReviewIssueOccurrence>();
  for (const item of issueHistory.value) if (!latest.has(item.issueId)) latest.set(item.issueId, item);
  return [...latest.values()];
});
const issueStatuses = computed(() => new Map(reviewReports.value.flatMap((report) =>
  report.issues.map((issue) => [issue.issueId, issue.status] as const))));
const snapshotReview = computed(() => reviewReports.value.find((report) =>
  report.snapshotId === handoff.value?.snapshot.snapshotId));
const historicalHandoff = computed(() => handoff.value !== null &&
  handoff.value.bundle.contractRevision !== props.taskRevision);
let serial = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let pendingStartId: string | null = null;
const active = computed(() => inspection.value && !['succeeded','failed','cancelled','interrupted']
  .includes(inspection.value.run.state));
function stopPolling(): void { if (timer) clearInterval(timer); timer = null; }
async function refresh(): Promise<void> {
  if (!props.connected || !selected.value) return;
  const token = serial;
  const previous = inspection.value?.run.runId === selected.value ? inspection.value : null;
  try {
    const result = await props.client.run({ type:'run.inspect',payload:{
      projectId:props.projectId,runId:selected.value,afterCursor:previous?.nextCursor ?? 0,limit:100 } });
    if (token !== serial) return;
    if (!result.ok) { error.value = result.error.message; inspection.value = null; return; }
    const checked = runInspectionSchema.safeParse(result.data);
    if (!checked.success || checked.data.run.projectId !== props.projectId ||
      checked.data.run.taskId !== props.taskId || checked.data.run.runId !== selected.value) {
      error.value = 'Host 返回了无效的 Run 详情。'; inspection.value = null; return;
    }
    inspection.value = previous ? { ...checked.data,
      observations:[...previous.observations,...checked.data.observations] } : checked.data;
    runs.value = runs.value.map((run) => run.runId === checked.data.run.runId ? checked.data.run : run);
    error.value = '';
    if (checked.data.run.state === 'succeeded' && !handoff.value && !deliveryError.value) {
      const delivered = await props.client.run({ type: 'run.handoff', payload: {
        projectId: props.projectId, runId: checked.data.run.runId,
      } });
      if (token !== serial) return;
      if (!delivered.ok) deliveryError.value = delivered.error.code === 'RUN_DELIVERY_FAILED' ?
        '执行已结束，但快照交接失败；不能作为已交付结果。' : '快照交接读取失败。';
      else if (delivered.data !== null) {
        const value = developmentHandoffSchema.safeParse(delivered.data);
        if (value.success) handoff.value = value.data;
        else deliveryError.value = 'Host 返回了无效的交接记录。';
      }
    }
  } catch { if (token === serial) { error.value = 'Run 详情读取失败。'; inspection.value = null; } }
}
async function refreshReview(token: number): Promise<void> {
  const [reportsResult, historyResult, jobsResult] = await Promise.all([
    props.client.run({ type: 'run.reviewReports', payload: {
      projectId: props.projectId, taskId: props.taskId,
    } }),
    props.client.run({ type: 'run.issueHistory', payload: {
      projectId: props.projectId, taskId: props.taskId,
    } }),
    props.client.run({ type: 'run.reviewJobs', payload: {
      projectId: props.projectId, taskId: props.taskId,
    } }),
  ]);
  if (token !== serial) return;
  if (!reportsResult.ok || !historyResult.ok || !jobsResult.ok ||
    !Array.isArray(reportsResult.data) || !Array.isArray(historyResult.data) ||
    !Array.isArray(jobsResult.data)) { reviewError.value = 'Review 历史读取失败。'; return; }
  const reports = reportsResult.data.map((item) => reviewReportSchema.safeParse(item));
  const history = historyResult.data.map((item) => reviewIssueOccurrenceSchema.safeParse(item));
  const jobs = jobsResult.data.map((item) => reviewJobSchema.safeParse(item));
  if (reports.some((item) => !item.success) || history.some((item) => !item.success) ||
    jobs.some((item) => !item.success) ||
    reports.some((item) => item.data?.taskId !== props.taskId ||
      item.data.projectId !== props.projectId)) {
    reviewError.value = 'Host 返回了无效的 Review 历史。'; return;
  }
  reviewReports.value = reports.flatMap((item) => item.data ? [item.data] : []);
  issueHistory.value = history.flatMap((item) => item.data ? [item.data] : []);
  reviewJobs.value = jobs.flatMap((item) => item.data ? [item.data] : []);
  reviewError.value = '';
}
async function refreshActiveReview(token: number): Promise<void> {
  const current = reviewJobs.value.find((item) => item.state === 'running');
  if (!current || !props.connected) return;
  const result = await props.client.run({ type: 'run.reviewJob', payload: {
    projectId: props.projectId, reviewRunId: current.reviewRunId,
  } });
  if (token !== serial || !result.ok) return;
  const parsed = reviewJobSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.taskId !== props.taskId) return;
  reviewJobs.value = reviewJobs.value.map((item) => item.reviewRunId === current.reviewRunId ?
    parsed.data : item);
  if (parsed.data.state !== 'running') await refreshReview(token);
}
async function load(): Promise<void> {
  const token = ++serial;
  stopPolling(); runs.value = []; selected.value = null; inspection.value = null; error.value = '';
  handoff.value = null; deliveryError.value = ''; capabilities.value = null; modelId.value = '';
  reviewReports.value = []; issueHistory.value = []; reviewJobs.value = []; reviewError.value = '';
  if (!props.connected) return;
  loading.value = true;
  try {
    const support = await props.client.run({ type: 'run.capabilities', payload: {
      projectId: props.projectId, taskId: props.taskId,
    } });
    if (token !== serial) return;
    if (support.ok) {
      const parsed = runLaunchCapabilitiesSchema.safeParse(support.data);
      if (parsed.success) { capabilities.value = parsed.data; modelId.value = parsed.data.modelIds[0] ?? ''; }
    }
    const result = await props.client.run({ type:'run.list',payload:{projectId:props.projectId,taskId:props.taskId} });
    if (token !== serial) return;
    if (!result.ok) { error.value = result.error.message; return; }
    if (!Array.isArray(result.data)) { error.value = 'Host 返回了无效的 Run 列表。'; return; }
    runs.value = result.data.map((item) => runViewSchema.parse(item));
    await refreshReview(token);
    selected.value = runs.value[0]?.runId ?? null;
    if (selected.value) await refresh();
    if (token === serial) timer = setInterval(() => {
      if (active.value || inspection.value?.run.state === 'succeeded' &&
        !handoff.value && !deliveryError.value) void refresh();
      if (reviewJobs.value.some((item) => item.state === 'running')) void refreshActiveReview(token);
    }, 2000);
  } catch { if (token === serial) error.value = 'Run 列表读取失败。'; }
  finally { if (token === serial) loading.value = false; }
}
async function selectRun(runId: string): Promise<void> {
  serial++; selected.value = runId; inspection.value = null; handoff.value = null;
  deliveryError.value = ''; await refresh();
}
async function startRun(): Promise<void> {
  if (!props.connected || props.taskState !== 'todo' || !capabilities.value?.available ||
    !modelId.value || starting.value) return;
  starting.value = true; error.value = '';
  try {
    const result = await props.client.run({ type: 'run.start', payload: {
      projectId: props.projectId, taskId: props.taskId,
      expectedTaskRevision: props.taskRevision, modelId: modelId.value,
      idempotencyKey: pendingStartId ??= crypto.randomUUID(),
    } });
    if (!result.ok) {
      if (result.error.code !== 'TRANSPORT_TIMEOUT' && result.error.code !== 'HOST_EXITED') {
        pendingStartId = null;
      }
      error.value = `启动失败：${result.error.code}`; return;
    }
    const run = runViewSchema.safeParse(result.data);
    if (!run.success) { error.value = 'Host 返回了无效的 Run。'; return; }
    pendingStartId = null;
    await load();
    selected.value = run.data.runId;
    await refresh();
    emit('runChanged');
  } catch { error.value = '启动失败；请检查 Host 连接与项目状态。'; }
  finally { starting.value = false; }
}
async function cancelRun(): Promise<void> {
  const runId = inspection.value?.run.runId;
  if (!runId || !props.connected || cancelling.value) return;
  cancelling.value = true; error.value = '';
  try {
    const result = await props.client.run({ type: 'run.cancel', payload: {
      projectId: props.projectId, runId,
    } });
    if (!result.ok) { error.value = `停止失败：${result.error.code}`; return; }
    await refresh();
    emit('runChanged');
  } catch { error.value = '停止请求未确认；请检查 Host 状态。'; }
  finally { cancelling.value = false; }
}
async function startReview(): Promise<void> {
  const source = handoff.value;
  if (!source || historicalHandoff.value || !props.connected || !modelId.value || startingReview.value ||
    reviewJobs.value.some((item) => item.state === 'running')) return;
  startingReview.value = true; reviewError.value = '';
  try {
    const result = await props.client.run({ type: 'run.reviewStart', payload: {
      projectId: props.projectId, taskId: props.taskId,
      developmentRunId: source.snapshot.runId,
      expectedSnapshotId: source.snapshot.snapshotId,
      modelId: modelId.value, idempotencyKey: pendingReviewId ??= crypto.randomUUID(),
    } });
    if (!result.ok) {
      if (result.error.code !== 'TRANSPORT_TIMEOUT' && result.error.code !== 'HOST_EXITED') {
        pendingReviewId = null;
      }
      reviewError.value = `审查启动失败：${result.error.code}`; return;
    }
    const parsed = reviewJobSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.snapshotId !== source.snapshot.snapshotId) {
      reviewError.value = 'Host 返回了无效的 Review Job。'; return;
    }
    pendingReviewId = null;
    reviewJobs.value = [parsed.data, ...reviewJobs.value.filter((item) =>
      item.reviewRunId !== parsed.data.reviewRunId)];
  } catch { reviewError.value = '审查启动未确认；请检查 Host 连接。'; }
  finally { startingReview.value = false; }
}
async function more(): Promise<void> {
  const current = inspection.value;
  if (!current || !current.hasMore || !props.connected) return;
  const token = serial;
  const result = await props.client.run({ type:'run.inspect',payload:{projectId:props.projectId,
    runId:current.run.runId,afterCursor:current.nextCursor,limit:100} });
  if (token !== serial || !result.ok) return;
  const next = runInspectionSchema.safeParse(result.data);
  if (next.success && next.data.run.runId === current.run.runId &&
    next.data.nextCursor >= current.nextCursor) inspection.value = { ...next.data,
      observations:[...current.observations,...next.data.observations] };
}
watch(() => [props.projectId, props.taskId, props.connected], () => {
  pendingStartId = null; void load();
}, { immediate:true });
onUnmounted(() => { serial++; stopPolling(); });
</script>

<template>
  <div class="run-inspector">
    <h4>运行详情</h4>
    <div v-if="connected" class="run-start-controls">
      <p>已批准任务不会自动开工。启动后 Codex 可在 Forge 创建的隔离 Git 工作区修改文件并运行项目命令；工作区不是恶意代码沙箱。</p>
      <ForgeSelect v-if="capabilities?.available" v-model="modelId" label="Codex 模型"
        :options="capabilities.modelIds.map((id) => ({ value:id,label:id }))" :disabled="starting" />
      <p v-else>Codex 开发当前不可用；请检查本机安装、认证和能力探测。</p>
      <ForgeButton variant="primary" size="sm" :disabled="taskState !== 'todo' || !capabilities?.available || !modelId || starting"
        :loading="starting" @click="startRun">明确启动开发</ForgeButton>
    </div>
    <p v-if="!connected" role="alert">Host 不可用；无法读取当前 Run 状态。</p>
    <p v-else-if="loading" role="status">正在读取真实 Run…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!runs.length">尚无 Run；批准任务不会自动开工。</p>
    <template v-if="connected && runs.length">
      <nav class="run-list" aria-label="Run 列表">
        <ForgeButton v-for="run in runs" :key="run.runId" variant="ghost" size="sm"
          :aria-current="selected === run.runId ? 'true' : undefined" @click="selectRun(run.runId)">
          {{ run.runId.slice(0, 8) }} · {{ run.state }}
        </ForgeButton>
      </nav>
      <template v-if="inspection">
        <div class="run-head"><ForgeBadge>{{ active ? `${inspection.run.state} · 进程未验证` : inspection.run.state }}</ForgeBadge>
          <span>Attempt {{ inspection.run.attempt.attemptNo }}</span>
          <span>{{ inspection.run.createdAt }}</span></div>
        <ForgeButton v-if="active && inspection.run.state !== 'canceling'" variant="danger" size="sm"
          :loading="cancelling" :disabled="cancelling" @click="cancelRun">停止此 Run</ForgeButton>
        <p v-if="active" class="run-caveat">这是 Host 持久记录；当前执行进程尚未核验。页面会轮询最新状态。</p>
        <p v-if="deliveryError" role="alert">{{ deliveryError }}</p>
        <p v-if="historicalHandoff" role="status">此 Run 属于旧任务版本；其 Review、Verify 与验收结果仅作历史记录，不能用于当前版本。</p>
        <p v-if="handoff" role="status">已冻结 CodeSnapshot {{ handoff.snapshot.snapshotId.slice(0, 8) }} ·
          {{ handoff.snapshot.files.length }} 个文件 ·
          {{ snapshotReview?.status === 'approved' ? 'Review 已批准；Verify 与人工验收尚未完成。' :
            snapshotReview?.status === 'changes_requested' ? 'Review 请求修改；需新的开发 Attempt。' :
            '验收尚未由 Review/Verify 确认。' }}</p>
        <ForgeButton v-if="handoff && capabilities?.available" variant="secondary" size="sm"
          :disabled="historicalHandoff || startingReview || reviewJobs.some((item) => item.state === 'running')"
          :loading="startingReview" @click="startReview">明确启动只读 Review</ForgeButton>
        <ForgeTabs v-model="tab" label="Run 详情视图" :tabs="[
          { id:'activity',label:'activity' }, { id:'files',label:'files' },
          { id:'diff',label:'diff' }, { id:'context',label:'context' },
          { id:'usage',label:'usage' } ]">
          <div class="run-panel">
          <template v-if="tab === 'activity'">
            <p v-if="!inspection.observations.length">暂无已保存的执行事件。</p>
            <ol v-else class="run-events"><li v-for="item in inspection.observations" :key="item.cursor">
              <time>{{ item.timestamp }}</time><strong>{{ item.type }}</strong><pre>{{ item.text }}</pre>
            </li></ol>
            <ForgeButton v-if="inspection.hasMore" variant="secondary" size="sm" @click="more">加载更多</ForgeButton>
          </template>
          <template v-else-if="tab === 'files'">
            <p v-if="!inspection.diff">Diff 预览尚未捕获；运行中没有冻结的文件快照。</p>
            <p v-else-if="!inspection.diff.files.length">没有可展示的文件变更。</p>
            <ul v-else><li v-for="file in inspection.diff.files" :key="file.path">
              {{ file.status }} · {{ file.path }}</li></ul>
          </template>
          <template v-else-if="tab === 'diff'">
            <p>只读 Diff 预览；只有上方显示 CodeSnapshot 时才形成冻结交接。</p>
            <p v-if="inspection.diff?.truncated">预览已截断或部分内容不可读取。</p>
            <pre v-if="inspection.diff" class="run-diff">{{ inspection.diff.text }}</pre>
            <p v-else>Diff 预览尚未捕获。</p>
          </template>
          <template v-else-if="tab === 'context'">
            <p>仅显示输入来源标识，不展示原始 provider payload。</p>
            <ul><li v-for="source in inspection.contextSources" :key="source.sourceRef">
              {{ source.sourceKind }} · {{ source.sourceRef }}</li></ul>
          </template>
          <template v-else>
            <p v-if="!inspection.usage">Token 用量：未知 · 费用：未知</p>
            <p v-else>输入 {{ inspection.usage.inputTokens }} · 输出 {{ inspection.usage.outputTokens }} token ·
              费用 {{ inspection.usage.cost === null ? '未知' : `${inspection.usage.cost} ${inspection.usage.currency ?? ''}` }}</p>
          </template>
          </div>
        </ForgeTabs>
      </template>
    </template>
    <section v-if="connected" class="review-history" aria-label="Review 问题历史">
      <h4>Review 与问题历史</h4>
      <p v-if="reviewJobs[0]">最近审查运行：{{ reviewJobs[0].state }}<template v-if="reviewJobs[0].errorCode"> · {{ reviewJobs[0].errorCode }}</template></p>
      <p v-if="reviewError" role="alert">{{ reviewError }}</p>
      <p v-else-if="!reviewReports.length">尚无正式 Review 报告；开发完成不代表审查通过。</p>
      <template v-else>
        <p>最近报告：{{ reviewReports[0]?.status }} ·
          快照 {{ reviewReports[0]?.snapshotId.slice(0, 8) }}。问题与每轮审查均保留来源。</p>
        <p v-if="!currentIssues.length">没有历史问题；这不代表 Verify 或人工验收通过。</p>
        <ol v-else class="review-issues"><li v-for="item in currentIssues" :key="item.issueId">
          <strong>{{ item.finding.anchor.path }}:{{ item.finding.anchor.lineStart }} ·
            {{ item.finding.reason }}</strong>
          <small>Issue {{ item.issueId.slice(0, 8) }} ·
            {{ issueStatuses.get(item.issueId) ?? '历史记录' }} ·
            {{ issueHistory.filter((entry) => entry.issueId === item.issueId).length }} 次审查记录 ·
            {{ item.finding.basis.kind }}: {{ item.finding.basis.sourceRef }}</small>
          <p>{{ item.finding.impact }}</p>
        </li></ol>
      </template>
    </section>
  </div>
</template>
