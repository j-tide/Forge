<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { developmentHandoffSchema, planGateSchema, runInspectionSchema, runRecoveryPreviewSchema,
  runRecoveryStatusSchema,
  runLaunchCapabilitiesSchema,
  stageContextPreviewSchema,
  contextSourceStatusSchema,
  runConfigurationSourceSchema,
  runViewSchema, reviewReportSchema, reviewIssueOccurrenceSchema,
  reviewJobSchema, type ReviewJob, type ReviewReport, type ReviewIssueOccurrence,
  type DevelopmentHandoff, type RunInspection,
  type RunLaunchCapabilities, type RunRecoveryPreview, type RunRecoveryStatus,
  type RunView, type PlanGate, type StageContextPreview,
  type ContextSourceStatus } from '@forge/contracts';
import type { RunConfigurationSource } from '@forge/contracts';
import type { AgentProfileCatalog } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeInput, ForgeSelect, ForgeTabs } from '@forge/ui';
import { filePatch } from '../run-code-browser';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  taskRevision: number; taskState: 'todo' | 'active' | 'blocked' | 'awaiting_acceptance' | 'done';
  connected: boolean; readOnly?: boolean; acceptanceBlockReason?: string }>();
const emit = defineEmits<{ runChanged: [] }>();
const runs = ref<RunView[]>([]);
const selected = ref<string | null>(null);
const inspection = ref<RunInspection | null>(null);
const planGate = ref<PlanGate | null>(null);
const planError = ref('');
const planBusy = ref(false);
const planRejectReason = ref('');
const recoveryPreview = ref<RunRecoveryPreview | null>(null);
const recoveryPreviewBusy = ref(false);
const recoveryPreviewError = ref('');
const recoveryStatus = ref<RunRecoveryStatus | null>(null);
const recoveryStatusError = ref('');
const recoveryResolving = ref(false);
const recoveryResolveError = ref('');
const canResolveRecovery = computed(() => !props.readOnly && props.connected &&
  recoveryStatus.value?.state === 'eligible' && recoveryPreview.value !== null &&
  recoveryPreview.value.workspaceId === recoveryStatus.value.workspaceId &&
  inspection.value?.run.revision === recoveryStatus.value.runRevision &&
  !recoveryResolving.value);
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
const capabilityError = ref('');
const executorUnavailableReason = computed(() => {
  const warnings = capabilities.value?.warnings ?? [];
  if (warnings.includes('RUN_RECOVERY_REQUIRED'))
    return '此项目有中断的 Run，工作区已隔离。请先查看下方历史并完成进程与工作区核对；Forge 不会自动重跑或释放租约。';
  if (warnings.includes('CODEX_CLI_UNAVAILABLE'))
    return '未找到或无法启动 Codex CLI。请在「设置 → 本机依赖」检查安装与应用启动环境。';
  if (warnings.includes('CODEX_VERSION_MISMATCH'))
    return 'Codex CLI 版本与 Forge 锁定版本不符。请在「设置 → 本机依赖」查看检测结果。';
  if (warnings.includes('CODEX_NOT_AUTHENTICATED'))
    return 'Codex CLI 尚未登录。请在本机完成 codex login，再重新打开 Forge。';
  if (warnings.includes('CODEX_MODELS_UNAVAILABLE') || warnings.includes('CODEX_PROBE_FAILED'))
    return 'Codex 模型或登录状态探测失败。请检查「设置 → 本机依赖」后重试。';
  if (warnings.includes('CODEX_CAPABILITY_EVIDENCE_MISSING'))
    return '当前 Codex 版本或平台缺少匹配的真实能力验证，Forge 不会启动开发 Run。';
  return 'Codex 开发当前不可用；请检查本机安装、认证和能力探测。';
});
const modelId = ref('');
const reviewerModelChoice = ref('');
const maxTokens = ref('50000');
const selectedMaxTokens = computed<50_000 | 100_000 | 200_000>(() =>
  maxTokens.value === '200000' ? 200_000 : maxTokens.value === '100000' ? 100_000 : 50_000);
const agentCatalog = ref<AgentProfileCatalog | null>(null);
const profileId = ref('');
const reviewProfileId = ref('');
const selectedProfile = computed(() => agentCatalog.value?.profiles.find((item) => item.id === profileId.value));
const workflowBinding = computed(() => capabilities.value?.workflowBinding ?? null);
const plannedWorkflow = computed(() => workflowBinding.value?.entryNode === 'plan');
const boundProfileReady = computed(() => !workflowBinding.value || Boolean(
  selectedProfile.value?.id === workflowBinding.value.profileId &&
  selectedProfile.value.revision === workflowBinding.value.profileRevision &&
  selectedProfile.value.modelId === workflowBinding.value.modelId &&
  agentCatalog.value?.availability.find((item) => item.profileId === workflowBinding.value?.profileId)?.runnable,
));
const allowsProjectContext = computed(() => !selectedProfile.value ||
  selectedProfile.value.contextProviders.includes('project-context'));
const selectedReviewProfile = computed(() => agentCatalog.value?.profiles.find((item) => item.id === reviewProfileId.value));
const profileOptions = computed(() => workflowBinding.value ? [{
  value: workflowBinding.value.profileId,
  label: `已发布工作流绑定 · ${workflowBinding.value.profileId} · v${workflowBinding.value.profileRevision}`,
  disabled: !boundProfileReady.value,
}] : [{ value: '', label: '内置 Developer 配置' },
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
const boundReviewerLock = computed(() => {
  const config = runConfig.value;
  if (!config) return null;
  const reviewer = config.stageProfiles.find((lock) => config.stageProfileDetails?.some((item) =>
    item.id === lock.id && item.version === lock.version && item.role === 'reviewer'));
  return reviewer ?? (config.actualNodeId === 'plan' ? null : config.stageProfiles[0] ?? null);
});
const boundReviewerDetail = computed(() => {
  const lock = boundReviewerLock.value;
  return lock ? runConfig.value?.stageProfileDetails?.find((item) =>
    item.id === lock.id && item.version === lock.version && item.role === 'reviewer') : null;
});
const boundReviewerExecutor = computed(() => agentCatalog.value?.executors.find((item) =>
  item.executorId === boundReviewerLock.value?.executorPluginId));
const boundReviewerAvailable = computed(() => !boundReviewerLock.value ||
  Boolean(boundReviewerDetail.value?.modelId && boundReviewerExecutor.value?.available &&
    boundReviewerExecutor.value.readOnlyEnforced &&
    boundReviewerExecutor.value.structuredOutput &&
    boundReviewerExecutor.value.modelIds.includes(boundReviewerDetail.value.modelId) &&
    (boundReviewerDetail.value.policyProfile === 'read-only' ||
      boundReviewerDetail.value.policyProfile === 'read-only-no-network' &&
      boundReviewerExecutor.value.networkPolicyEnforced)));
const reviewModelId = computed(() => boundReviewerLock.value ?
  boundReviewerDetail.value?.modelId ?? '' :
  selectedReviewProfile.value?.modelId ?? reviewerModelChoice.value);
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
    if (checked.data.run.attempt.nodeId === 'plan' && checked.data.run.state === 'succeeded') {
      await refreshPlanGate(checked.data.run.runId, token);
    }
    runs.value = runs.value.map((run) => run.runId === checked.data.run.runId ? checked.data.run : run);
    error.value = '';
    if (checked.data.run.state === 'interrupted') void refreshRecoveryStatus(token);
    const completedNow = previous && previous.run.state !== checked.data.run.state &&
      ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(checked.data.run.state);
    if (checked.data.run.attempt.nodeId === 'develop' &&
      checked.data.run.state === 'succeeded' && !handoff.value && !deliveryError.value) {
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
    if (completedNow && token === serial) emit('runChanged');
  } catch { if (token === serial) { error.value = 'Run 详情读取失败。'; inspection.value = null; } }
}
async function refreshPlanGate(runId: string, token: number = serial): Promise<void> {
  try {
    const result = await props.client.run({ type: 'run.planGet', payload: {
      projectId: props.projectId, taskId: props.taskId, runId,
    } });
    if (token !== serial || selected.value !== runId) return;
    if (!result.ok) { planError.value = `计划产物读取失败：${result.error.code}`; return; }
    const checked = planGateSchema.nullable().safeParse(result.data);
    if (!checked.success || checked.data?.artifact.runId !== runId ||
      checked.data?.artifact.taskId !== props.taskId) {
      planError.value = 'Host 返回了无效的计划产物。'; return;
    }
    planGate.value = checked.data; planError.value = '';
  } catch { if (token === serial) planError.value = '计划产物读取失败。'; }
}
async function actOnPlan(action: 'approve' | 'reject' | 'continue'): Promise<void> {
  const gate = planGate.value;
  if (!gate || planBusy.value || props.readOnly || !props.connected ||
    gate.artifact.taskRevision !== props.taskRevision) return;
  if (action === 'reject' && planRejectReason.value.trim().length < 12) {
    planError.value = '拒绝计划时请填写至少 12 个字符的理由。'; return;
  }
  planBusy.value = true; planError.value = '';
  try {
    const result = await props.client.run({ type: 'run.planAct', payload: {
      projectId: props.projectId, taskId: props.taskId, runId: gate.artifact.runId,
      expectedArtifactHash: gate.artifact.contentHash,
      expectedTaskRevision: gate.artifact.taskRevision, action,
      ...(action === 'reject' ? { reason: planRejectReason.value.trim() } : {}),
      confirmed: true,
    } });
    if (!result.ok) { planError.value = `计划决定未完成：${result.error.code}`; return; }
    const checked = planGateSchema.safeParse(result.data);
    if (!checked.success || checked.data.artifact.contentHash !== gate.artifact.contentHash) {
      planError.value = 'Host 未确认计划决定，请重新读取。'; return;
    }
    planGate.value = checked.data;
    await load();
    emit('runChanged');
  } catch { planError.value = '计划决定未确认；请检查 Host 连接与运行记录。'; }
  finally { planBusy.value = false; }
}
async function refreshRecoveryStatus(token: number = serial): Promise<void> {
  const runId = selected.value;
  if (!props.connected || !runId) return;
  recoveryStatusError.value = '';
  try {
    const result = await props.client.run({ type: 'run.recoveryStatus', payload: {
      projectId: props.projectId, runId,
    } });
    if (token !== serial || selected.value !== runId) return;
    if (!result.ok) { recoveryStatusError.value = `恢复证据不可用：${result.error.code}`; return; }
    const checked = runRecoveryStatusSchema.safeParse(result.data);
    if (!checked.success || checked.data.runId !== runId) {
      recoveryStatusError.value = 'Host 返回的恢复证据无效。'; return;
    }
    recoveryStatus.value = checked.data;
  } catch { if (token === serial) recoveryStatusError.value = '恢复证据读取失败。'; }
}
async function resolveInterruptedRun(): Promise<void> {
  if (!canResolveRecovery.value || !selected.value || !recoveryStatus.value) return;
  const runId = selected.value;
  recoveryResolving.value = true;
  recoveryResolveError.value = '';
  try {
    const result = await props.client.run({ type: 'run.recoveryResolve', payload: {
      projectId: props.projectId, runId,
      expectedRunRevision: recoveryStatus.value.runRevision,
      expectedWorkspaceId: recoveryStatus.value.workspaceId, confirmed: true,
    } });
    if (!result.ok) {
      recoveryResolveError.value = result.error.code === 'RUN_RECOVERY_PROOF_REQUIRED'
        ? '尚未证实系统已重启；租约仍保持隔离。'
        : result.error.code === 'RUN_RECOVERY_EVIDENCE_INVALID'
          ? '工作区归属或进程记录无法核对；租约仍保持隔离。'
          : `无法解除隔离：${result.error.code}`;
      return;
    }
    const checked = runRecoveryStatusSchema.safeParse(result.data);
    if (!checked.success || checked.data.state !== 'resolved' || checked.data.runId !== runId) {
      recoveryResolveError.value = 'Host 未确认恢复结果；请刷新后核对。'; return;
    }
    recoveryStatus.value = checked.data;
    await load();
    emit('runChanged');
  } catch { recoveryResolveError.value = '解除隔离失败；请检查 Host 连接。'; }
  finally { recoveryResolving.value = false; }
}
async function inspectQuarantinedWorkspace(): Promise<void> {
  const runId = selected.value;
  if (!props.connected || !runId || inspection.value?.run.state !== 'interrupted' ||
      recoveryPreviewBusy.value) return;
  const token = serial;
  recoveryPreviewBusy.value = true;
  recoveryPreview.value = null;
  recoveryPreviewError.value = '';
  try {
    const result = await props.client.run({ type: 'run.recoveryPreview', payload: {
      projectId: props.projectId, runId,
    } });
    if (token !== serial || selected.value !== runId) return;
    if (!result.ok) {
      recoveryPreviewError.value = result.error.code === 'RUN_RECOVERY_EVIDENCE_INVALID'
        ? '无法核对隔离工作区归属或读取变更；隔离状态保持不变。'
        : '当前无法读取隔离工作区；请查看 Host 诊断。';
      return;
    }
    const checked = runRecoveryPreviewSchema.safeParse(result.data);
    if (!checked.success || checked.data.runId !== runId) {
      recoveryPreviewError.value = 'Host 返回的隔离工作区预览无效。';
      return;
    }
    recoveryPreview.value = checked.data;
  } catch { if (token === serial) recoveryPreviewError.value = '隔离工作区预览失败。'; }
  finally { if (token === serial) recoveryPreviewBusy.value = false; }
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
  if (parsed.data.state !== 'running') {
    await refreshReview(token);
    if (token === serial) emit('runChanged');
  }
}
async function load(): Promise<void> {
  const token = ++serial;
  stopPolling(); runs.value = []; selected.value = null; inspection.value = null; error.value = '';
  planGate.value = null; planError.value = ''; planRejectReason.value = '';
  recoveryPreview.value = null; recoveryPreviewError.value = ''; recoveryPreviewBusy.value = false;
  recoveryStatus.value = null; recoveryStatusError.value = ''; recoveryResolveError.value = '';
  contextPreview.value = null; contextPreviewError.value = ''; contextQuery.value = '';
  historicalSources.value = []; historicalSourcesError.value = '';
  runConfig.value = null; runConfigError.value = '';
  handoff.value = null; deliveryError.value = ''; capabilities.value = null;
  modelId.value = ''; reviewerModelChoice.value = '';
  capabilityError.value = '';
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
      if (parsed.success) {
        capabilities.value = parsed.data;
        modelId.value = parsed.data.modelIds[0] ?? '';
        reviewerModelChoice.value = parsed.data.modelIds[0] ?? '';
      }
    } else capabilityError.value = support.error.code;
    try { agentCatalog.value = await props.client.agentProfileCatalog(); }
    catch { agentCatalog.value = null; }
    if (capabilities.value?.workflowBinding) {
      profileId.value = capabilities.value.workflowBinding.profileId;
      modelId.value = capabilities.value.workflowBinding.modelId;
    }
    const result = await props.client.run({ type:'run.list',payload:{projectId:props.projectId,taskId:props.taskId} });
    if (token !== serial) return;
    if (!result.ok) { error.value = result.error.message; return; }
    if (!Array.isArray(result.data)) { error.value = 'Host 返回了无效的 Run 列表。'; return; }
    runs.value = result.data.map((item) => runViewSchema.parse(item));
    await refreshReview(token);
    selected.value = runs.value[0]?.runId ?? null;
    if (selected.value) { await refreshRunConfig(); await refresh(); }
    if (token === serial) timer = setInterval(() => {
      if (active.value || inspection.value?.run.attempt.nodeId === 'develop' &&
        inspection.value.run.state === 'succeeded' &&
        !handoff.value && !deliveryError.value) void refresh();
      if (!loading.value && planGate.value?.developmentRunId &&
        !runs.value.some((run) => run.runId === planGate.value?.developmentRunId)) void load();
      if (reviewJobs.value.some((item) => item.state === 'running')) void refreshActiveReview(token);
    }, 2000);
  } catch { if (token === serial) error.value = 'Run 列表读取失败。'; }
  finally { if (token === serial) loading.value = false; }
}
async function selectRun(runId: string): Promise<void> {
  serial++; selected.value = runId; inspection.value = null; handoff.value = null;
  planGate.value = null; planError.value = ''; planRejectReason.value = '';
  recoveryPreview.value = null; recoveryPreviewError.value = ''; recoveryPreviewBusy.value = false;
  recoveryStatus.value = null; recoveryStatusError.value = ''; recoveryResolveError.value = '';
  selectedDiffFile.value = null;
  contextPreview.value = null; contextPreviewError.value = '';
  historicalSources.value = []; historicalSourcesError.value = '';
  runConfig.value = null; runConfigError.value = '';
  deliveryError.value = ''; await refreshRunConfig(); await refresh();
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
  if (!props.connected || props.taskState !== 'todo' || props.acceptanceBlockReason ||
    !capabilities.value?.available || !boundProfileReady.value ||
    !modelId.value || starting.value) return;
  starting.value = true; error.value = '';
  try {
    const result = await props.client.run({ type: 'run.start', payload: {
      projectId: props.projectId, taskId: props.taskId,
      expectedTaskRevision: props.taskRevision, modelId: modelId.value,
      idempotencyKey: pendingStartId ??= crypto.randomUUID(),
      maxTokens: selectedMaxTokens.value,
      ...(selectedProfile.value ? { profileId: selectedProfile.value.id,
        profileRevision: selectedProfile.value.revision } : {}),
      ...(launchContextQuery.value.trim() ? { contextQuery: launchContextQuery.value.trim() } : {}),
    } });
    if (!result.ok) {
      if (result.error.code !== 'TRANSPORT_TIMEOUT' && result.error.code !== 'HOST_EXITED') {
        pendingStartId = null;
      }
      error.value = result.error.code === 'RUN_RECOVERY_REQUIRED'
        ? '启动被阻止：此项目有中断的 Run，工作区已隔离。请先核对旧进程与工作区。'
        : result.error.code === 'PROFILE_CONTEXT_UNSUPPORTED' && plannedWorkflow.value
          ? '计划流程使用资料检索时，Planner 与 Developer Profile 都必须允许项目知识与记忆。请在 Agents 中保存新版本并重新发布工作流。'
        : result.error.code === 'PLAN_CONTEXT_STALE'
          ? '计划引用的知识或记忆已撤销、过期或更新，不能按旧计划交接给 Developer。'
        : result.error.code === 'WORKFLOW_PROFILE_MISMATCH' ||
          result.error.code === 'WORKFLOW_PROFILE_UNAVAILABLE'
          ? '已发布工作流的 Developer 绑定发生变化。请刷新任务详情，核对角色与模型后再启动。'
        : `启动失败：${result.error.code}`; return;
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
  if (!allowsProjectContext.value) launchContextQuery.value = '';
});
async function cancelRun(): Promise<void> {
  if (props.readOnly) return;
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
  if (!source || props.taskState === 'done' || props.acceptanceBlockReason ||
    historicalHandoff.value ||
    !props.connected || !runConfig.value ||
    !boundReviewerAvailable.value || !reviewModelId.value || startingReview.value ||
    reviewJobs.value.some((item) => item.state === 'running')) return;
  startingReview.value = true; reviewError.value = '';
  try {
    const result = await props.client.run({ type: 'run.reviewStart', payload: {
      projectId: props.projectId, taskId: props.taskId,
      developmentRunId: source.snapshot.runId,
      expectedSnapshotId: source.snapshot.snapshotId,
      modelId: reviewModelId.value, idempotencyKey: pendingReviewId ??= crypto.randomUUID(),
      ...(boundReviewerLock.value ? { profileId: boundReviewerLock.value.id,
        profileRevision: Number(boundReviewerLock.value.version) } :
        selectedReviewProfile.value ? { profileId: selectedReviewProfile.value.id,
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
  pendingStartId = null; maxTokens.value = '50000'; void load();
}, { immediate:true });
onUnmounted(() => { serial++; stopPolling(); });
</script>

<template>
  <div class="run-inspector">
    <h4>运行详情</h4>
    <div v-if="connected" class="run-start-controls">
      <p>已批准任务不会自动开工。{{ plannedWorkflow ? '启动后先执行只读 Planner，计划通过后才按流程进入开发。' : '启动后 Codex 可在 Forge 创建的隔离 Git 工作区修改文件并运行项目命令；工作区不是恶意代码沙箱。' }}</p>
      <p v-if="acceptanceBlockReason" role="status">{{ acceptanceBlockReason }}</p>
      <p v-else-if="taskState !== 'todo'" role="status">当前任务状态为 {{ taskState }}；这里只能从 TODO 明确启动新的开发 Run。已有运行和交付记录可在下方查看。</p>
      <template v-else>
      <ForgeSelect v-if="capabilities?.available" v-model="modelId" label="Codex 模型"
        :options="capabilities.modelIds.map((id) => ({ value:id,label:id }))" :disabled="starting || !!workflowBinding" />
      <ForgeSelect v-if="capabilities?.available" v-model="maxTokens" label="本次总 Token 观测上限"
        :options="[{value:'50000',label:'50,000 · 默认'}, {value:'100000',label:'100,000'},
          {value:'200000',label:'200,000'}]" :disabled="starting" />
      <p v-if="capabilities?.available">更高上限需你在本次启动前明确选择。Host 会冻结选择，并在收到用量事件超过上限时停止；上游事件可能延迟，无法保证精确费用封顶。</p>
      <ForgeSelect v-if="capabilities?.available" v-model="profileId" label="Developer Profile"
        :options="profileOptions" :disabled="starting || !!workflowBinding" />
      <p v-if="workflowBinding" role="status">此任务使用已发布工作流 {{ workflowBinding.workflowId }} v{{ workflowBinding.workflowRevision }}；
        {{ plannedWorkflow ? '首节点为只读 Planner；' : '' }}Developer Profile 与模型由 Host 的发布版本绑定，新 Run 将冻结当前版本。</p>
      <p v-if="workflowBinding && !boundProfileReady" role="alert">绑定的 Developer Profile 版本或执行能力已变化；当前不能启动，请刷新或到工作流与 Agents 核对。</p>
      <p v-if="selectedProfile">{{ selectedProfile.policyProfile }} · 保存的角色版本会在启动前重新校验。</p>
      <p v-else-if="capabilities?.available">内置 Developer 配置；启动前 Host 会再次检查模型与执行权限。</p>
      <p v-else-if="capabilityError === 'RUN_PLUGIN_UNAVAILABLE' || capabilities?.warnings.includes('RUN_PLUGIN_UNAVAILABLE')" role="status">Codex 插件已停用；请在「插件」中启用并重启 Forge 后再启动新 Run。已有任务与运行记录仍可查看。</p>
      <p v-else-if="capabilityError === 'RUN_PLUGIN_CONFIG_RESTART_REQUIRED'" role="status">插件配置已保存但尚未应用。请重启 Forge 后再启动新 Run；已有运行和记录不受影响。</p>
      <p v-else role="status">{{ executorUnavailableReason }}</p>
      <ForgeInput v-model="launchContextQuery" label="运行时资料检索词（可选）"
        placeholder="例如 start_date（可留空）" :disabled="starting || !allowsProjectContext" />
      <p v-if="plannedWorkflow" role="status">计划流程检索需要已发布版本中的 Planner 与 Developer 都允许项目资料。Host 会将来源冻结到 Plan 和后续 Developer；来源失效会阻止交接。</p>
      <p v-if="!allowsProjectContext" role="status">所选 Developer Profile 未允许项目知识与记忆检索；可在 Agents 中保存新版本后用于新 Run。</p>
      <p>填写时，Host 只接受当前项目/环境的有效来源；冲突或无结果会拒绝启动。资料标为低信任，不会替代批准合同。留空沿用原始开发路径。</p>
      <ForgeButton variant="primary" size="sm" :disabled="taskState !== 'todo' || !!acceptanceBlockReason || !capabilities?.available || !boundProfileReady || !modelId || starting"
        :loading="starting" @click="startRun">{{ plannedWorkflow ? '明确启动只读计划' : '明确启动开发' }}</ForgeButton>
      </template>
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
        <ForgeButton v-if="active && !readOnly && inspection.run.state !== 'canceling'" variant="danger" size="sm"
          :loading="cancelling" :disabled="cancelling" @click="cancelRun">停止此 Run</ForgeButton>
        <p v-if="active" class="run-caveat">这是 Host 持久记录；当前执行进程尚未核验。页面会轮询最新状态。</p>
        <p v-if="inspection.run.state === 'interrupted'" role="alert" class="run-caveat">本次 Run 在进程结果无法确认时中断；{{ recoveryStatus?.state === 'resolved' ? '旧工作区已保留，原 Run 仍是中断记录。' : '工作区已隔离，旧进程与文件变更需要人工核对。' }}此记录不是开发成功，Forge 不会自动继续或清理工作区。</p>
        <section v-if="inspection.run.state === 'interrupted'" class="run-recovery-preview" aria-label="隔离工作区只读核对">
          <p v-if="recoveryStatusError" role="alert">{{ recoveryStatusError }}</p>
          <p v-if="recoveryStatus?.state === 'awaiting_reboot'" role="status">旧写入进程尚不能排除。请先保存其他工作并完整重启 Mac；只关闭 Forge 或让 Mac 睡眠不足以解除隔离。重开后还需重新查看下方变更并明确确认。</p>
          <p v-else-if="recoveryStatus?.state === 'eligible'" role="status">系统启动会话已变化。请先查看保留工作区的当前变更，再明确确认解除此项目写入门禁；旧 Run 不会被改为成功，也不会自动启动新 Run。</p>
          <p v-else-if="recoveryStatus?.state === 'unavailable'" role="alert">缺少可靠的系统启动或历史归属证据；继续隔离。可导出诊断，但 Forge 不会猜测旧进程已退出。</p>
          <p v-else-if="recoveryStatus?.state === 'resolved'" role="status">旧 Run 保持中断，旧工作区保留且未合并。若任务仍在 TODO，可重新明确启动新的隔离 Run。</p>
          <ForgeButton variant="secondary" size="sm" :loading="recoveryPreviewBusy"
            :disabled="recoveryPreviewBusy" @click="inspectQuarantinedWorkspace">查看隔离工作区当前变更</ForgeButton>
          <p>仅从 Host 读取当前 Git 变更；旧进程可能仍在写入，结果不是冻结快照、Review 依据或解除隔离的证明。</p>
          <p v-if="recoveryPreviewError" role="alert">{{ recoveryPreviewError }}</p>
          <template v-if="recoveryPreview">
            <p role="status">读取于 {{ recoveryPreview.diff.capturedAt }} · 工作区 {{ recoveryPreview.workspaceId.slice(0, 8) }} · {{ recoveryStatus?.state === 'resolved' ? '旧工作区仍保留' : '租约继续隔离' }}</p>
            <p v-if="recoveryPreview.diff.truncated">内容已截断或敏感文件已排除。</p>
            <p v-if="!recoveryPreview.diff.files.length">当前没有可展示的变更；这不能证明旧进程已经退出。</p>
            <ul v-else class="run-code-files"><li v-for="file in recoveryPreview.diff.files" :key="file.path">{{ file.status }} · {{ file.path }}</li></ul>
            <pre v-if="recoveryPreview.diff.text" class="run-diff">{{ recoveryPreview.diff.text }}</pre>
          </template>
          <ForgeButton v-if="recoveryStatus?.state === 'eligible' && !readOnly" variant="danger" size="sm"
            :disabled="!canResolveRecovery" :loading="recoveryResolving"
            @click="resolveInterruptedRun">保留旧工作区并允许新 Run</ForgeButton>
          <p v-if="recoveryStatus?.state === 'eligible'">此操作只解除旧 Run 的项目写入门禁；不删除文件、不接管旧进程、不把中断结果计为完成。点击后 Desktop 会再次要求确认，Host 会重查启动会话和工作区身份。</p>
          <p v-if="recoveryResolveError" role="alert">{{ recoveryResolveError }}</p>
        </section>
        <p v-if="deliveryError" role="alert">{{ deliveryError }}</p>
        <section v-if="inspection.run.attempt.nodeId === 'plan'" aria-label="实施计划">
          <p>这是只读 Planner Run；计划不是代码快照，也不是 Review、Verify 或最终验收。</p>
          <p v-if="inspection.planFailure" role="alert">计划未通过：{{ inspection.planFailure }}。
            {{ inspection.planFailure === 'PLAN_WORKSPACE_CHANGED'
              ? '只读工作区检测到文件变更；不会启动 Developer，请检查执行器权限。'
              : '结构化计划无效；不会启动 Developer，请检查 Planner 输出。' }}</p>
          <p v-if="planError" role="alert">{{ planError }}</p>
          <template v-if="planGate">
            <p>计划产物 {{ planGate.artifact.artifactId.slice(0, 8) }} · Task v{{ planGate.artifact.taskRevision }} · 基线 {{ planGate.artifact.baseRevision.slice(0, 12) }}</p>
            <p>{{ planGate.artifact.result.summary }}</p>
            <ol><li v-for="step in planGate.artifact.result.plan" :key="step.id">
              <strong>{{ step.id }}</strong> · {{ step.description }}
              <span v-if="step.paths.length"> · {{ step.paths.join('、') }}</span>
            </li></ol>
            <p v-if="planGate.decision === 'rejected'">计划已拒绝：{{ planGate.reason }}。不会启动 Developer。</p>
            <p v-else-if="planGate.developmentRunId">Developer Run {{ planGate.developmentRunId.slice(0, 8) }}；是否成功以其独立运行记录为准。</p>
            <p v-else-if="planGate.requiresApproval">Strict 流程需要人工确认此计划，确认前不启动 Developer。</p>
            <p v-else>Standard 流程的计划已保存，等待自动交接结果。</p>
            <template v-if="!readOnly && planGate.requiresApproval && planGate.decision === 'pending' &&
              planGate.artifact.taskRevision === taskRevision">
              <ForgeInput v-model="planRejectReason" label="拒绝计划的理由" />
              <ForgeButton variant="primary" size="sm" :loading="planBusy" @click="actOnPlan('approve')">确认计划并启动开发</ForgeButton>
              <ForgeButton variant="danger" size="sm" :disabled="planBusy" @click="actOnPlan('reject')">拒绝此计划</ForgeButton>
            </template>
            <ForgeButton v-if="!readOnly && !planGate.requiresApproval &&
              planGate.decision === 'pending' && planGate.artifact.taskRevision === taskRevision"
              variant="secondary" size="sm" :loading="planBusy"
              @click="actOnPlan('continue')">继续尚未完成的计划交接</ForgeButton>
            <ForgeButton v-if="!readOnly && planGate.developmentRunId &&
              !runs.some((item) => item.runId === planGate?.developmentRunId) &&
              planGate.artifact.taskRevision === taskRevision" variant="secondary" size="sm"
              :loading="planBusy" @click="actOnPlan('continue')">重试计划交接</ForgeButton>
          </template>
        </section>
        <p v-if="inspection.budgetFailure" role="alert">本次 Run 达到观测预算并已停止：{{ inspection.budgetFailure }}。实际用量可能因上游事件延迟超过配置值；开发失败不等于任务完成。</p>
        <p v-if="historicalHandoff" role="status">此 Run 属于旧任务版本；其 Review、Verify 与验收结果仅作历史记录，不能用于当前版本。</p>
        <p v-if="handoff" role="status">已冻结 CodeSnapshot {{ handoff.snapshot.snapshotId.slice(0, 8) }} ·
          {{ handoff.snapshot.files.length }} 个文件 ·
          {{ snapshotReview?.status === 'approved' ? 'Review 已批准；Verify 与人工验收请以各自报告和决定为准。' :
            snapshotReview?.status === 'changes_requested' ? 'Review 请求修改；需新的开发 Attempt。' :
            '验收尚未由 Review/Verify 确认。' }}</p>
        <p v-if="handoff && !runConfig" role="status">{{ runConfigError || '正在读取本次 Run 冻结的 Reviewer 配置…' }}
          <ForgeButton v-if="runConfigError" variant="ghost" size="sm" @click="refreshRunConfig">重试</ForgeButton></p>
        <p v-if="handoff && boundReviewerLock" role="status">本次 Workflow 冻结 Reviewer：
          {{ boundReviewerDetail?.name ?? boundReviewerLock.id }} · v{{ boundReviewerLock.version }} ·
          {{ boundReviewerAvailable ? '能力可用' : '当前不可用或旧版本校验失败，不能启动 Review' }}。
          新发布的 Profile 不会改变此 Run。</p>
        <ForgeSelect v-if="handoff && capabilities?.available && runConfig && !boundReviewerLock && !acceptanceBlockReason" v-model="reviewProfileId"
          label="Reviewer Profile" :options="reviewProfileOptions" :disabled="startingReview" />
        <ForgeSelect v-if="handoff && capabilities?.available && runConfig && !boundReviewerLock && !selectedReviewProfile && !acceptanceBlockReason"
          v-model="reviewerModelChoice" label="Reviewer 模型"
          :options="capabilities.modelIds.map((id) => ({ value:id,label:id }))" :disabled="startingReview" />
        <p v-if="handoff && selectedReviewProfile && !boundReviewerLock" role="status">
          所选 Reviewer Profile 固定模型 {{ selectedReviewProfile.modelId }}；不会更改 Developer 模型。
        </p>
        <p v-if="handoff && taskState === 'done'" role="status">
          此快照已由 Owner 最终接受；已有 Review 保留为历史记录，不能再次启动。
        </p>
        <p v-else-if="handoff && acceptanceBlockReason" role="status">{{ acceptanceBlockReason }} 已有 Review 保留为历史记录。</p>
        <ForgeButton v-if="handoff && capabilities?.available" variant="secondary" size="sm"
          :disabled="taskState === 'done' || !!acceptanceBlockReason || historicalHandoff || !runConfig || !boundReviewerAvailable || !reviewModelId ||
            startingReview || reviewJobs.some((item) => item.state === 'running')"
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
              <p>{{ runConfig.actualNodeId === 'plan' ? 'Planner' : 'Developer' }}：{{ runConfig.developerProfile.id }} @{{ runConfig.developerProfile.version }}</p>
              <p v-if="runConfig.maxDurationMs">本次冻结最长运行时间：{{ Math.floor(runConfig.maxDurationMs / 1000) }} 秒。</p>
              <p v-if="runConfig.maxTokens">本次冻结总 Token 观测上限：{{ runConfig.maxTokens }}；工具调用观测上限：{{ runConfig.maxToolCalls }}。</p>
              <p v-if="runConfig.maxOutputTokens">{{ runConfig.actualNodeId === 'plan' ? 'Planner' : 'Developer' }} Profile 输出 Token 观测上限：{{ runConfig.maxOutputTokens }}。</p>
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
            <p>预算根据 Host 收到的事件执行；上游可能延迟报告，费用与精确硬封顶仍不可保证。</p>
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
        <p v-if="reviewReports[0]?.status === 'inconclusive' && !reviewReports[0]?.result"
          role="alert">
          {{ reviewReports[0]?.diagnosticCode === 'REVIEW_RESULT_MISSING' ?
            '审查器未返回结构化结果。' : reviewReports[0]?.diagnosticCode === 'REVIEW_RESULT_INVALID' ?
              '审查器返回的结构化结果未通过校验。' :
              '审查结果不足以判定。' }}任务保持未完成；可明确重试只读 Review，重试会再次调用模型。
        </p>
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
