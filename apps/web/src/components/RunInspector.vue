<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { developmentHandoffSchema, runInspectionSchema, runLaunchCapabilitiesSchema,
  stageContextPreviewSchema,
  contextSourceStatusSchema,
  runConfigurationSourceSchema,
  runViewSchema, reviewReportSchema, reviewIssueOccurrenceSchema,
  reviewJobSchema, type ReviewJob, type ReviewReport, type ReviewIssueOccurrence,
  type DevelopmentHandoff, type RunInspection,
  type RunLaunchCapabilities, type RunView, type StageContextPreview,
  type ContextSourceStatus } from '@forge/contracts';
import type { RunConfigurationSource } from '@forge/contracts';
import type { AgentProfileCatalog } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeInput, ForgeSelect, ForgeTabs } from '@forge/ui';
import { filePatch } from '../run-code-browser';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  taskRevision: number; taskState: 'todo' | 'active' | 'blocked' | 'awaiting_acceptance' | 'done';
  connected: boolean }>();
const emit = defineEmits<{ runChanged: [] }>();
const runs = ref<RunView[]>([]);
const selected = ref<string | null>(null);
const inspection = ref<RunInspection | null>(null);
const tab = ref<'activity' | 'files' | 'diff' | 'context' | 'usage'>('activity');
const selectedDiffFile = ref<string | null>(null);
const selectedPatch = computed(() => selectedDiffFile.value && inspection.value?.diff ?
  filePatch(inspection.value.diff.text, selectedDiffFile.value) : null);
const previewUrl = ref('');
const previewError = ref('');
const previewNotice = ref('');
const previewBusy = ref(false);
async function openLocalPreview(): Promise<void> {
  previewError.value = ''; previewNotice.value = '';
  if (!props.client.canOpenAppPreview) { previewError.value = '应用预览仅在 Forge Desktop 可用。'; return; }
  previewBusy.value = true;
  try {
    const result = await props.client.openAppPreview(previewUrl.value.trim());
    previewNotice.value = `已在隔离窗口打开 ${result.origin}。Forge 不会启动项目脚本。`;
  } catch (error) {
    previewError.value = error instanceof Error && error.message === 'PREVIEW_LOAD_FAILED' ?
      '本地预览地址无法加载；请先自行启动受信项目的服务。' :
      '仅允许明确输入的 http://127.0.0.1:端口 地址。';
  } finally { previewBusy.value = false; }
}
const error = ref('');
const loading = ref(false);
const starting = ref(false);
const cancelling = ref(false);
const capabilities = ref<RunLaunchCapabilities | null>(null);
const modelId = ref('');
const agentCatalog = ref<AgentProfileCatalog | null>(null);
const profileId = ref('');
const reviewProfileId = ref('');
const selectedProfile = computed(() => agentCatalog.value?.profiles.find((item) => item.id === profileId.value));
const selectedReviewProfile = computed(() => agentCatalog.value?.profiles.find((item) => item.id === reviewProfileId.value));
const profileOptions = computed(() => [{ value: '', label: '内置 Developer 配置' },
  ...(agentCatalog.value?.profiles.filter((item) => item.role === 'developer').map((item) => ({
    value: item.id, label: `${item.name} · v${item.revision}`,
    disabled: !agentCatalog.value?.availability.find((entry) => entry.profileId === item.id)?.runnable,
  })) ?? []),
]);
const reviewProfileOptions = computed(() => [{ value: '', label: '内置只读 Reviewer 配置' },
  ...(agentCatalog.value?.profiles.filter((item) => item.role === 'reviewer').map((item) => ({
    value: item.id, label: `${item.name} · v${item.revision}`,
    disabled: !agentCatalog.value?.availability.find((entry) => entry.profileId === item.id)?.runnable,
  })) ?? []),
]);
const handoff = ref<DevelopmentHandoff | null>(null);
const deliveryError = ref('');
const reviewReports = ref<ReviewReport[]>([]);
const issueHistory = ref<ReviewIssueOccurrence[]>([]);
const reviewJobs = ref<ReviewJob[]>([]);
const startingReview = ref(false);
let pendingReviewId: string | null = null;
const reviewError = ref('');
const contextQuery = ref('');
const launchContextQuery = ref('');
const contextPreview = ref<StageContextPreview | null>(null);
const contextPreviewError = ref('');
const contextPreviewBusy = ref(false);
const historicalSources = ref<ContextSourceStatus[]>([]);
const historicalSourcesError = ref('');
const historicalSourcesBusy = ref(false);
const runConfig = ref<RunConfigurationSource | null>(null);
const runConfigError = ref('');
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
  contextPreview.value = null; contextPreviewError.value = ''; contextQuery.value = '';
  historicalSources.value = []; historicalSourcesError.value = '';
  runConfig.value = null; runConfigError.value = '';
  handoff.value = null; deliveryError.value = ''; capabilities.value = null; modelId.value = '';
  agentCatalog.value = null; profileId.value = ''; reviewProfileId.value = '';
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
    try { agentCatalog.value = await props.client.agentProfileCatalog(); }
    catch { agentCatalog.value = null; }
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
  selectedDiffFile.value = null;
  contextPreview.value = null; contextPreviewError.value = '';
  historicalSources.value = []; historicalSourcesError.value = '';
  runConfig.value = null; runConfigError.value = '';
  deliveryError.value = ''; await refresh();
}
async function refreshRunConfig(): Promise<void> {
  if (!selected.value || !props.connected) return;
  const runId = selected.value;
  try {
    const result = await props.client.run({ type: 'run.config', payload: {
      projectId: props.projectId, runId,
    } });
    if (selected.value !== runId) return;
    if (!result.ok) { runConfigError.value = result.error.code; return; }
    const parsed = runConfigurationSourceSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.projectId !== props.projectId ||
      parsed.data.taskId !== props.taskId || parsed.data.runId !== runId) {
      runConfigError.value = 'Host 返回了无效的冻结配置。'; return;
    }
    runConfig.value = parsed.data; runConfigError.value = '';
  } catch { if (selected.value === runId) runConfigError.value = '冻结配置读取失败。'; }
}
async function refreshHistoricalSources(): Promise<void> {
  if (!selected.value || !props.connected || historicalSourcesBusy.value) return;
  const runId = selected.value;
  historicalSourcesBusy.value = true;
  historicalSourcesError.value = '';
  try {
    const result = await props.client.run({ type: 'context.sources', payload: {
      projectId: props.projectId, runId,
    } });
    if (selected.value !== runId) return;
    if (!result.ok || !Array.isArray(result.data)) {
      historicalSourcesError.value = result.ok ? '来源状态格式无效。' : result.error.code;
      return;
    }
    const parsed = contextSourceStatusSchema.array().max(40).safeParse(result.data);
    if (!parsed.success) { historicalSourcesError.value = '来源状态格式无效。'; return; }
    historicalSources.value = parsed.data;
  } catch { if (selected.value === runId) historicalSourcesError.value = '来源状态读取失败。'; }
  finally { historicalSourcesBusy.value = false; }
}
watch([tab, selected], () => {
  if (tab.value === 'context') {
    void refreshRunConfig(); void refreshHistoricalSources();
  }
});
async function previewStageContext(): Promise<void> {
  if (!selected.value || !contextQuery.value.trim() || contextPreviewBusy.value) return;
  contextPreviewBusy.value = true;
  contextPreview.value = null; contextPreviewError.value = '';
  try {
    const result = await props.client.run({ type: 'context.preview', payload: {
      projectId: props.projectId, runId: selected.value, query: contextQuery.value.trim(),
    } });
    if (!result.ok) { contextPreviewError.value = result.error.code; return; }
    const checked = stageContextPreviewSchema.safeParse(result.data);
    if (!checked.success || checked.data.projectId !== props.projectId ||
      checked.data.runId !== selected.value) {
      contextPreviewError.value = 'Host 返回无效的上下文预览。'; return;
    }
    contextPreview.value = checked.data;
  } catch { contextPreviewError.value = '上下文预览不可用。'; }
  finally { contextPreviewBusy.value = false; }
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
      ...(selectedProfile.value ? { profileId: selectedProfile.value.id,
        profileRevision: selectedProfile.value.revision } : {}),
      ...(launchContextQuery.value.trim() ? { contextQuery: launchContextQuery.value.trim() } : {}),
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
watch(profileId, () => {
  if (selectedProfile.value?.modelId) modelId.value = selectedProfile.value.modelId;
});
watch(reviewProfileId, () => {
  if (selectedReviewProfile.value?.modelId) modelId.value = selectedReviewProfile.value.modelId;
});
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
      ...(selectedReviewProfile.value ? { profileId: selectedReviewProfile.value.id,
        profileRevision: selectedReviewProfile.value.revision } : {}),
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
      <ForgeSelect v-if="capabilities?.available" v-model="profileId" label="Developer Profile"
        :options="profileOptions" :disabled="starting" />
      <p v-if="selectedProfile">{{ selectedProfile.policyProfile }} · 保存的角色版本会在启动前重新校验。</p>
      <p v-else>Codex 开发当前不可用；请检查本机安装、认证和能力探测。</p>
      <ForgeInput v-model="launchContextQuery" label="运行时资料检索词（可选）"
        placeholder="例如 start_date（可留空）" :disabled="starting" />
      <p>填写时，Host 只接受当前项目/环境的有效来源；冲突或无结果会拒绝启动。资料标为低信任，不会替代批准合同。留空沿用原始开发路径。</p>
      <ForgeButton variant="primary" size="sm" :disabled="taskState !== 'todo' || !capabilities?.available || !modelId || starting"
        :loading="starting" @click="startRun">明确启动开发</ForgeButton>
    </div>
    <details class="run-preview-entry">
      <summary>应用预览（独立隔离窗口）</summary>
      <p>只接受你明确输入的 127.0.0.1 本地开发地址。Forge 不启动项目脚本，也不分享 Host bridge。</p>
      <p v-if="!client.canOpenAppPreview">普通 Web 无本地预览能力；请使用 Forge Desktop。</p>
      <template v-else>
        <ForgeInput v-model="previewUrl" label="本地预览 URL" description="例如 http://127.0.0.1:3000/；只允许同一 origin 的资源。" />
        <ForgeButton variant="secondary" :disabled="!previewUrl.trim() || previewBusy" :loading="previewBusy"
          @click="openLocalPreview">打开隔离预览</ForgeButton>
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <p v-if="previewNotice" role="status">{{ previewNotice }}</p>
      </template>
    </details>
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
        <ForgeSelect v-if="handoff && capabilities?.available" v-model="reviewProfileId"
          label="Reviewer Profile" :options="reviewProfileOptions" :disabled="startingReview" />
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
            <template v-else>
              <p>只读浏览 Host 捕获的变更文件；这里不会读取或执行项目文件。</p>
              <ul class="run-code-files"><li v-for="file in inspection.diff.files" :key="file.path">
                <button type="button" :aria-pressed="selectedDiffFile === file.path"
                  @click="selectedDiffFile = file.path">{{ file.status }} · {{ file.path }}</button></li></ul>
              <template v-if="selectedDiffFile">
                <p>{{ selectedDiffFile }} · {{ selectedPatch ? '已保存的只读补丁' : '独立补丁不可用，请查看完整 Diff' }}</p>
                <pre v-if="selectedPatch" class="run-diff">{{ selectedPatch }}</pre>
              </template>
            </template>
          </template>
          <template v-else-if="tab === 'diff'">
            <p>只读 Diff 预览；只有上方显示 CodeSnapshot 时才形成冻结交接。</p>
            <p v-if="inspection.diff?.truncated">预览已截断或部分内容不可读取。</p>
            <pre v-if="inspection.diff" class="run-diff">{{ inspection.diff.text }}</pre>
            <p v-else>Diff 预览尚未捕获。</p>
          </template>
          <template v-else-if="tab === 'context'">
            <p>仅显示输入来源标识，不展示原始 provider payload。</p>
            <p v-if="runConfigError" role="alert">{{ runConfigError }}</p>
            <div v-if="runConfig" aria-label="冻结运行配置">
              <p>实际执行节点：{{ runConfig.actualNodeId }} · Task v{{ runConfig.taskRevision }}</p>
              <p>Workflow：{{ runConfig.workflow.id }} @{{ runConfig.workflow.version }} ·
                Hash {{ runConfig.workflow.contentHash.slice(0, 12) }}</p>
              <p>Developer：{{ runConfig.developerProfile.id }} @{{ runConfig.developerProfile.version }}</p>
              <p v-for="profile in runConfig.stageProfiles" :key="profile.id">
                后续阶段 Profile 锁：{{ profile.id }} @{{ profile.version }}</p>
              <p>这里仅说明冻结配置与已执行的节点；其他节点须以真实 Review、Verify 和人工验收记录为准。</p>
            </div>
            <ul><li v-for="source in inspection.contextSources" :key="source.sourceRef">
              {{ source.sourceKind }} · {{ source.sourceRef }}</li></ul>
            <ForgeButton variant="ghost" size="sm" :disabled="historicalSourcesBusy"
              @click="refreshHistoricalSources">刷新冻结来源状态</ForgeButton>
            <p v-if="historicalSourcesError" role="alert">{{ historicalSourcesError }}</p>
            <p v-if="historicalSourcesBusy" role="status">正在核对当前来源状态…</p>
            <ul v-if="historicalSources.length"><li v-for="source in historicalSources" :key="source.sourceRef"
              :role="source.status === 'current' ? undefined : 'alert'">
              {{ source.kind }} · {{ source.sourceRef }} · {{ source.status }}
            </li></ul>
            <p v-if="historicalSources.some((source) => source.status !== 'current')" role="alert">
              历史 Run 输入已冻结；来源现已失效或变化。新 Run 必须重新检索，旧结果不可冒充当前证据。
            </p>
            <p>以下为只读 Stage Context 预览，不会自动送入当前 Run 或替代已冻结输入。</p>
            <ForgeInput v-model="contextQuery" label="资料检索词" placeholder="日期筛选 start_date" />
            <ForgeButton variant="secondary" :disabled="contextPreviewBusy || !contextQuery.trim()"
              @click="previewStageContext">预览上下文</ForgeButton>
            <p v-if="contextPreviewError" role="alert">{{ contextPreviewError }}</p>
            <div v-if="contextPreview" aria-label="Stage Context 预览">
              <p>状态：{{ contextPreview.status }} · {{ contextPreview.usedChars }}/{{ contextPreview.maxChars }} 字符预算
                · 省略 {{ contextPreview.omittedItems }} 项{{ contextPreview.truncated ? '（已截断）' : '' }}</p>
              <p v-if="contextPreview.status === 'insufficient_sources'">当前项目/环境没有匹配资料；不会编造来源。</p>
              <p v-if="contextPreview.status === 'budget_exceeded'">批准合同超过预算，不能生成部分上下文。</p>
              <p v-for="conflict in contextPreview.conflicts" :key="`${conflict.currentSourceRef}:${conflict.otherSourceRef}`"
                role="alert">{{ conflict.question }} · {{ conflict.currentSourceRef }} / {{ conflict.otherSourceRef }}</p>
              <ol><li v-for="(item, index) in contextPreview.items" :key="`${item.sourceRef}:${index}`">
                P{{ item.priority }} · {{ item.kind }} / {{ item.trust }} · {{ item.sourceRef }} · {{ item.text }}</li></ol>
            </div>
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
