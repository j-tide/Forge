<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { commandPresetSchema, developmentHandoffSchema, runConfigurationSourceSchema,
  runViewSchema, verifyArtifactSchema, verifyJobSchema, verifyReportSchema,
  type CommandPreset, type DevelopmentHandoff, type VerifyArtifact,
  type VerifyJob, type VerifyReport } from '@forge/contracts';
import { ForgeButton, ForgeSelect } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  taskRevision: number; taskState: string; connected: boolean; refreshKey: number;
  acceptanceBlockReason?: string }>();
const emit = defineEmits<{ verificationChanged: [] }>();
const reports = ref<VerifyReport[]>([]);
const jobs = ref<VerifyJob[]>([]);
const currentHandoff = ref<DevelopmentHandoff | null>(null);
const availablePresets = ref<CommandPreset[]>([]);
const selectedPresetId = ref('');
const launchNotice = ref('');
const launching = ref(false);
const artifact = ref<VerifyArtifact | null>(null);
const error = ref('');
const loading = ref(false);
let serial = 0;
let pendingVerifyId: string | null = null;
const timer = setInterval(() => {
  if (props.connected && jobs.value.some((job) => job.state === 'running')) void refresh();
}, 2000);
onUnmounted(() => { clearInterval(timer); serial++; });

async function loadLaunchOptions(token: number): Promise<void> {
  currentHandoff.value = null; availablePresets.value = []; selectedPresetId.value = '';
  launchNotice.value = '';
  if (props.acceptanceBlockReason) {
    launchNotice.value = `${props.acceptanceBlockReason} 已有验证报告仍可查看。`;
    return;
  }
  const listed = await props.client.run({ type: 'run.list', payload: {
    projectId: props.projectId, taskId: props.taskId,
  } });
  if (token !== serial) return;
  const runs = listed.ok ? runViewSchema.array().safeParse(listed.data) : null;
  if (!runs?.success || runs.data.some((run) => run.projectId !== props.projectId ||
    run.taskId !== props.taskId)) { launchNotice.value = '当前 Run 列表不可用，不能启动验证。'; return; }
  if (props.taskState === 'done') {
    launchNotice.value = '任务已由 Owner 验收；已有验证报告仍可查看，不能再次启动验证。';
    return;
  }
  const newest = runs.data[0];
  if (!newest || newest.state !== 'succeeded') {
    launchNotice.value = '尚无可对当前任务执行验证的已冻结开发快照。'; return;
  }
  const [handoffResult, configResult] = await Promise.all([
    props.client.run({ type: 'run.handoff', payload: {
      projectId: props.projectId, runId: newest.runId,
    } }),
    props.client.run({ type: 'run.config', payload: {
      projectId: props.projectId, runId: newest.runId,
    } }),
  ]);
  if (token !== serial) return;
  const handoff = handoffResult.ok ? developmentHandoffSchema.safeParse(handoffResult.data) : null;
  const config = configResult.ok ? runConfigurationSourceSchema.safeParse(configResult.data) : null;
  if (!handoff?.success || !config?.success ||
    handoff.data.snapshot.runId !== newest.runId ||
    handoff.data.bundle.contractRevision !== props.taskRevision ||
    config.data.runId !== newest.runId || config.data.taskRevision !== props.taskRevision ||
    !config.data.commandPresetIds || !config.data.commandPresetLocks) {
    launchNotice.value = '当前快照或冻结环境不可用；验证不会使用后来修改的预设。'; return;
  }
  const presetResult = await props.client.project({ type: 'commandPreset.list', payload: {
    projectId: props.projectId, environmentId: config.data.environmentId,
  } });
  if (token !== serial) return;
  const presets = presetResult.ok ? commandPresetSchema.array().safeParse(presetResult.data) : null;
  if (!presets?.success || presets.data.some((item) => item.projectId !== props.projectId ||
    item.environmentId !== config.data.environmentId)) {
    launchNotice.value = '冻结环境的预设读取失败；不能启动验证。'; return;
  }
  currentHandoff.value = handoff.data;
  availablePresets.value = presets.data.filter((item) =>
    config.data.commandPresetIds?.includes(item.presetId) && item.approvalHash &&
    config.data.commandPresetLocks?.some((lock) => lock.presetId === item.presetId &&
      lock.revision === item.revision && lock.approvalHash === item.approvalHash) &&
    ['test', 'typecheck', 'build', 'lint'].includes(item.name));
  selectedPresetId.value = availablePresets.value[0]?.presetId ?? '';
  if (!availablePresets.value.length) launchNotice.value =
    '本次 Run 的已批准验证预设不可用或版本已变化。请在项目页审阅配置，并从新 Run 冻结新版本。';
}

async function refresh(): Promise<void> {
  const token = ++serial;
  const wasRunning = jobs.value.some((job) => job.state === 'running');
  artifact.value = null; reports.value = []; error.value = '';
  if (!props.connected) return;
  loading.value = true;
  try {
    const listed = await props.client.run({ type:'run.verifyJobs',
      payload:{projectId:props.projectId,taskId:props.taskId} });
    if (token !== serial) return;
    if (!listed.ok || !Array.isArray(listed.data)) throw new Error('Invalid Verify jobs');
    const parsedJobs = listed.data.map((value) => verifyJobSchema.safeParse(value));
    if (parsedJobs.some((value) => !value.success || value.data?.projectId !== props.projectId ||
      value.data?.taskId !== props.taskId)) throw new Error('Invalid Verify job owner');
    const nextJobs = parsedJobs.flatMap((value) => value.data ? [value.data] : []);
    const loaded = await Promise.all(parsedJobs.flatMap((job) => job.data?.reportId ?
      [props.client.run({type:'run.verifyReport',payload:{
        projectId:props.projectId,verificationId:job.data.verificationId,
      }})] : []));
    if (token !== serial) return;
    const checked = loaded.map((result) => result.ok ? verifyReportSchema.safeParse(result.data) :
      null);
    if (checked.some((value) => !value?.success || value.data?.projectId !== props.projectId ||
      value.data?.taskId !== props.taskId)) throw new Error('Invalid Verify report');
    reports.value = checked.flatMap((value) => value?.data ? [value.data] : []);
    jobs.value = nextJobs;
    if (wasRunning && !nextJobs.some((job) => job.state === 'running')) emit('verificationChanged');
    await loadLaunchOptions(token);
  } catch { if (token === serial) error.value = '验证报告读取失败。'; }
  finally { if (token === serial) loading.value = false; }
}
async function startVerify(): Promise<void> {
  const source = currentHandoff.value;
  const preset = availablePresets.value.find((item) => item.presetId === selectedPresetId.value);
  if (!source || !preset || props.taskState === 'done' || props.acceptanceBlockReason ||
    launching.value || !props.connected ||
    jobs.value.some((job) => job.state === 'running')) return;
  launching.value = true; error.value = '';
  try {
    const result = await props.client.run({ type: 'run.verifyStart', payload: {
      projectId: props.projectId, taskId: props.taskId,
      developmentRunId: source.snapshot.runId,
      expectedSnapshotId: source.snapshot.snapshotId,
      kind: preset.name as 'test' | 'typecheck' | 'build' | 'lint',
      presetId: preset.presetId, idempotencyKey: pendingVerifyId ??= crypto.randomUUID(),
    } });
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT', 'HOST_EXITED'].includes(result.error.code)) pendingVerifyId = null;
      error.value = `验证未启动：${result.error.code}`; return;
    }
    const checked = verifyJobSchema.safeParse(result.data);
    if (!checked.success || checked.data.snapshotId !== source.snapshot.snapshotId ||
      checked.data.taskId !== props.taskId) {
      error.value = 'Host 未确认验证 Job；请刷新真实状态。'; return;
    }
    pendingVerifyId = null;
    jobs.value = [checked.data, ...jobs.value.filter((item) =>
      item.verificationId !== checked.data.verificationId)];
    await refresh();
  } catch { error.value = '验证启动未获确认；请刷新后重试。'; }
  finally { launching.value = false; }
}
async function openArtifact(report: VerifyReport, artifactId: string): Promise<void> {
  const token = serial;
  artifact.value = null; error.value = '';
  try {
    const response = await props.client.run({type:'run.verifyArtifact',payload:{
      projectId:props.projectId,artifactId,
    }});
    if (token !== serial) return;
    if (!response.ok) throw new Error('Artifact unavailable');
    const checked = verifyArtifactSchema.safeParse(response.data);
    if (!checked.success || checked.data.artifactId !== artifactId ||
      checked.data.reportId !== report.reportId) throw new Error('Artifact mismatch');
    artifact.value = checked.data;
  } catch { if (token === serial) error.value = '验证证据读取失败。'; }
}
watch(() => [props.projectId,props.taskId,props.taskState,props.connected,
  props.refreshKey,props.acceptanceBlockReason], () => {
  jobs.value = []; currentHandoff.value = null; availablePresets.value = [];
  pendingVerifyId = null;
  void refresh();
}, {immediate:true});
</script>

<template>
  <section class="verify-report-panel" aria-label="验证报告">
    <div class="acceptance-matrix-head"><h4>验证报告与原始输出</h4>
      <ForgeButton variant="ghost" size="sm" @click="refresh">刷新报告</ForgeButton></div>
    <p v-if="!connected">Host 不可用，无法读取验证报告。</p>
    <p v-else-if="loading" role="status">正在读取真实验证报告…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="connected && taskState !== 'done' && !acceptanceBlockReason &&
      currentHandoff && availablePresets.length">
      <p>仅对当前 CodeSnapshot {{ currentHandoff.snapshot.snapshotId.slice(0, 8) }} 明确运行已批准命令；命令可能执行项目代码，结果不会自动使 Task Done。</p>
      <ForgeSelect v-model="selectedPresetId" label="本次冻结环境的验证命令"
        :options="availablePresets.map((item) => ({value:item.presetId,
          label:`${item.name} · ${item.executable} ${item.argv.join(' ')} · v${item.revision}`}))" />
      <ForgeButton variant="secondary" size="sm" :loading="launching"
        :disabled="launching || jobs.some((job) => job.state === 'running')"
        @click="startVerify">明确启动验证</ForgeButton>
    </template>
    <p v-if="connected && launchNotice" role="status">{{ launchNotice }}</p>
    <p v-if="jobs.some((job) => job.state === 'running')" role="status">验证命令正在运行；完成前不会报告通过。</p>
    <p v-if="connected && !loading && !reports.length && !error">尚无验证报告。</p>
    <ul v-if="reports.length" class="verify-report-list">
      <li v-for="report in reports" :key="report.reportId">
        <strong>{{ report.kind }} · {{ report.status }} · exit {{ report.exitCode ?? '未知' }}</strong>
        <small>快照 {{ report.snapshotId.slice(0, 8) }} · 报告 {{ report.reportId.slice(0, 8) }}
          <template v-if="report.outputTruncated"> · 输出已截断</template></small>
        <div class="task-detail-source-links">
          <ForgeButton v-if="report.stdoutArtifactId" variant="secondary" size="sm"
            @click="openArtifact(report, report.stdoutArtifactId)">查看 stdout 纯文本</ForgeButton>
          <ForgeButton v-if="report.stderrArtifactId" variant="secondary" size="sm"
            @click="openArtifact(report, report.stderrArtifactId)">查看 stderr 纯文本</ForgeButton>
        </div>
      </li>
    </ul>
    <template v-if="artifact">
      <p>以下输出仅作纯文本显示；其中的链接和脚本不可执行。</p>
      <pre class="verify-report-content">{{ artifact.content }}</pre>
    </template>
  </section>
</template>
