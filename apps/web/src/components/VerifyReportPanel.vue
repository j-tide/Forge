<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { verifyArtifactSchema, verifyJobSchema, verifyReportSchema,
  type VerifyArtifact, type VerifyReport } from '@forge/contracts';
import { ForgeButton } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean; refreshKey: number }>();
const reports = ref<VerifyReport[]>([]);
const artifact = ref<VerifyArtifact | null>(null);
const error = ref('');
const loading = ref(false);
let serial = 0;

async function refresh(): Promise<void> {
  const token = ++serial;
  artifact.value = null; reports.value = []; error.value = '';
  if (!props.connected) return;
  loading.value = true;
  try {
    const listed = await props.client.run({ type:'run.verifyJobs',
      payload:{projectId:props.projectId,taskId:props.taskId} });
    if (token !== serial) return;
    if (!listed.ok || !Array.isArray(listed.data)) throw new Error('Invalid Verify jobs');
    const jobs = listed.data.map((value) => verifyJobSchema.safeParse(value));
    if (jobs.some((value) => !value.success || value.data?.projectId !== props.projectId ||
      value.data?.taskId !== props.taskId)) throw new Error('Invalid Verify job owner');
    const loaded = await Promise.all(jobs.flatMap((job) => job.data?.reportId ?
      [props.client.run({type:'run.verifyReport',payload:{
        projectId:props.projectId,verificationId:job.data.verificationId,
      }})] : []));
    if (token !== serial) return;
    const checked = loaded.map((result) => result.ok ? verifyReportSchema.safeParse(result.data) :
      null);
    if (checked.some((value) => !value?.success || value.data?.projectId !== props.projectId ||
      value.data?.taskId !== props.taskId)) throw new Error('Invalid Verify report');
    reports.value = checked.flatMap((value) => value?.data ? [value.data] : []);
  } catch { if (token === serial) error.value = '验证报告读取失败。'; }
  finally { if (token === serial) loading.value = false; }
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
watch(() => [props.projectId,props.taskId,props.connected,props.refreshKey], () => {
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
