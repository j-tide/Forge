<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { finalAcceptanceViewSchema, type FinalAcceptanceView } from '@forge/contracts';
import { ForgeButton, ForgeSelect, ForgeTextarea } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean; refreshKey: number }>();
const emit = defineEmits<{ accepted: [] }>();
const view = ref<FinalAcceptanceView | null>(null);
const loading = ref(false);
const pending = ref(false);
const error = ref('');
const confirmed = ref(false);
const returnConfirmed = ref(false);
const reason = ref('');
const waiverReason = ref('');
const waiverConfirmed = ref(false);
const selectedIssueId = ref('');
let serial = 0;
let key: string | null = null;
let waiverKey: string | null = null;

async function refresh(): Promise<void> {
  const token = ++serial;
  if (!props.connected) { view.value = null; return; }
  loading.value = true;
  try {
    const result = await props.client.run({ type:'run.finalAcceptance', payload:{
      projectId:props.projectId, taskId:props.taskId,
    }});
    if (token !== serial) return;
    if (!result.ok) { view.value = null; error.value = `最终验收读取失败：${result.error.code}`; return; }
    const parsed = finalAcceptanceViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.projectId !== props.projectId ||
      parsed.data.taskId !== props.taskId) {
      view.value = null; error.value = 'Host 返回了无效的最终验收状态。'; return;
    }
    view.value = parsed.data; error.value = ''; confirmed.value = false;
    returnConfirmed.value = false;
    waiverConfirmed.value = false;
    if (!parsed.data.advisoryIssues.some((item) => item.issueId === selectedIssueId.value &&
      item.severity === 'advisory' && item.status === 'open')) {
      selectedIssueId.value = parsed.data.advisoryIssues.find((item) =>
        item.severity === 'advisory' && item.status === 'open')?.issueId ?? '';
    }
  } catch { if (token === serial) { view.value = null; error.value = '最终验收读取失败。'; } }
  finally { if (token === serial) loading.value = false; }
}

async function decide(decision: 'accept' | 'return'): Promise<void> {
  const current = view.value;
  if (!current) return;
  const canReturn = current.snapshotId && !current.blockers.some((code) => [
    'CODE_SNAPSHOT_MISSING', 'DEVELOPMENT_NOT_CURRENT', 'REPORT_STILL_RUNNING',
    'REWORK_UNRESOLVED',
  ].includes(code));
  if (pending.value || (decision === 'accept' ? !confirmed.value ||
    current.status !== 'ready' : !returnConfirmed.value || !canReturn) ||
    !current.snapshotId || reason.value.trim().length < 12) return;
  pending.value = true; error.value = '';
  try {
    const result = await props.client.run({ type:'run.finalDecide', payload:{
      projectId:props.projectId, taskId:props.taskId,
      expectedSnapshotId:current.snapshotId,
      expectedContractRevision:current.contractRevision,
      expectedBasisHash:current.basisHash, decision,
      reason:reason.value.trim(), idempotencyKey:key ??= crypto.randomUUID(),
    }});
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT','HOST_EXITED'].includes(result.error.code)) key = null;
      error.value = result.error.code === 'ACCEPTANCE_SOURCE_STALE' ?
        '交付证据已变化。请重新读取当前快照和报告后再决定。' :
        `最终验收未完成：${result.error.code}`;
      return;
    }
    const parsed = finalAcceptanceViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.status !== (decision === 'accept' ? 'accepted' : 'returned') ||
      parsed.data.snapshotId !== current.snapshotId) {
      error.value = 'Host 未确认最终验收；请刷新。'; return;
    }
    view.value = parsed.data; key = null; confirmed.value = false;
    returnConfirmed.value = false; emit('accepted');
  } catch { error.value = '最终验收结果未获确认；请刷新后重试。'; }
  finally { pending.value = false; }
}

async function waiveAdvisory(): Promise<void> {
  const current = view.value;
  const issue = current?.advisoryIssues.find((item) => item.issueId === selectedIssueId.value);
  if (pending.value || !current?.snapshotId || !current.reviewReportId || !issue ||
    issue.severity !== 'advisory' || issue.status !== 'open' || !waiverConfirmed.value ||
    waiverReason.value.trim().length < 12) return;
  pending.value = true; error.value = '';
  try {
    const result = await props.client.run({ type:'run.issueWaive', payload:{
      projectId:props.projectId, taskId:props.taskId, issueId:issue.issueId,
      expectedSnapshotId:current.snapshotId, expectedReviewId:current.reviewReportId,
      expectedIssueRevision:issue.revision, nonSecurityConfirmed:true,
      reason:waiverReason.value.trim(), idempotencyKey:waiverKey ??= crypto.randomUUID(),
    }});
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT','HOST_EXITED'].includes(result.error.code)) waiverKey = null;
      error.value = `不能接受这条建议的风险：${result.error.code}`; return;
    }
    const parsed = finalAcceptanceViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.snapshotId !== current.snapshotId) {
      error.value = 'Host 未确认这条风险决定；请刷新。'; return;
    }
    view.value = parsed.data; waiverKey = null; waiverReason.value = '';
    waiverConfirmed.value = false; selectedIssueId.value = '';
  } catch { error.value = '风险决定未获确认；请刷新后重试。'; }
  finally { pending.value = false; }
}

watch(() => [props.projectId,props.taskId,props.connected,props.refreshKey], () => {
  view.value = null; key = null; waiverKey = null; void refresh();
}, {immediate:true});
</script>

<template>
  <section class="acceptance-matrix" aria-label="人类最终验收">
    <div class="acceptance-matrix-head"><h4>人类最终验收</h4>
      <ForgeButton variant="ghost" size="sm" @click="refresh">重新读取交付</ForgeButton></div>
    <p v-if="!connected">Host 不可用；不能决定最终验收。</p>
    <p v-else-if="loading" role="status">正在读取当前 Contract、快照与报告…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="view">
      <p v-if="view.snapshotId">快照 {{ view.snapshotId.slice(0, 8) }} · Contract v{{ view.contractRevision }}
        · Review {{ view.reviewReportId?.slice(0, 8) ?? '未完成' }}
        · 验证报告 {{ view.verifyReportIds.length }} 份
        · 已判断验收项 {{ view.criterionDecisionIds.length }} 条</p>
      <p v-else>尚无当前版本的 CodeSnapshot；不能最终验收。</p>
      <p v-if="view.blockers.length" role="status">硬门禁：{{ view.blockers.join('、') }}。</p>
      <template v-if="view.advisoryIssues.length">
        <h5>当前 Review 意见</h5>
        <ul><li v-for="issue in view.advisoryIssues" :key="issue.issueId">
          {{ issue.severity === 'blocking' ? '阻塞' : '建议' }} · {{ issue.reason }} ·
          {{ issue.status === 'waived' ? '已接受风险（waived，非 pass）' : issue.status }}
          · v{{ issue.revision }}</li></ul>
      </template>
      <template v-if="view.advisoryIssues.some((item) => item.severity === 'advisory' && item.status === 'open')">
        <p>仅可对当前 Review 的非安全建议作明确人工风险决定；阻塞 Review 不能在这里豁免。</p>
        <ForgeSelect v-model="selectedIssueId" label="待决定的建议"
          :options="view.advisoryIssues.filter((item) => item.severity === 'advisory' && item.status === 'open')
            .map((item) => ({value:item.issueId,label:item.reason.slice(0,120)}))" />
        <ForgeTextarea v-model="waiverReason" label="接受风险的理由" :rows="3" />
        <label><input v-model="waiverConfirmed" type="checkbox" /> 我确认此建议不涉及安全、隐私、凭据或数据丢失风险。</label>
        <ForgeButton variant="secondary" size="sm" :loading="pending"
          :disabled="pending || !waiverConfirmed || waiverReason.trim().length < 12"
          @click="waiveAdvisory">记录 waived（非通过）</ForgeButton>
      </template>
      <p v-if="view.status === 'accepted'">当前交付已由本地 Owner 验收。Done 不表示已合并或部署。</p>
      <template v-else-if="view.status !== 'returned'">
        <p>请先查看上方 Diff、Review、验证报告与逐条 AC。此决定只针对当前读取的版本；证据变化会被 Host 拒绝。</p>
        <ForgeTextarea v-model="reason" label="最终验收依据" :rows="3" />
        <template v-if="view.status === 'ready'">
          <label><input v-model="confirmed" type="checkbox" /> 我已检查当前快照与报告，并明确接受这一交付。</label>
          <ForgeButton variant="primary" size="sm" :loading="pending"
            :disabled="pending || !confirmed || reason.trim().length < 12"
            @click="decide('accept')">接受当前版本</ForgeButton>
        </template>
        <template v-if="view.snapshotId && !view.blockers.some((code) => [
          'CODE_SNAPSHOT_MISSING','DEVELOPMENT_NOT_CURRENT','REPORT_STILL_RUNNING',
          'REWORK_UNRESOLVED'].includes(code))">
          <label><input v-model="returnConfirmed" type="checkbox" /> 我确认退回本快照，并启动一个独立的新开发 Attempt。</label>
          <ForgeButton variant="danger" size="sm" :loading="pending"
            :disabled="pending || !returnConfirmed || reason.trim().length < 12"
            @click="decide('return')">退回并创建新 Attempt</ForgeButton>
        </template>
      </template>
      <p v-if="view.status === 'returned'">当前快照已退回；新开发 Attempt {{ view.decision?.nextRunId?.slice(0,8) ?? '未生成' }}。
        {{ view.blockers.includes('RETURN_ATTEMPT_NOT_STARTED') ? '执行器尚未启动；决定已保存，需人工诊断后处理。' :
          view.blockers.includes('RETURN_ATTEMPT_NOT_DELIVERED') ? '新 Attempt 未形成交付；请查看 Run 详情并人工处理。' :
          '新快照产生后需要重新 Review、Verify 和人工验收。' }}</p>
    </template>
  </section>
</template>
