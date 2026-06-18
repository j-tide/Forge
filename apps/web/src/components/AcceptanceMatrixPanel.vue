<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { acceptanceMatrixSchema, type AcceptanceMatrix } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeSelect, ForgeTextarea } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean }>();
const emit = defineEmits<{ decisionChanged: [] }>();
const matrix = ref<AcceptanceMatrix | null>(null);
const error = ref('');
const pending = ref(false);
const selectedCriterion = ref('');
const selectedStatus = ref('verified');
const selectedReport = ref('');
const reason = ref('');
let serial = 0;
let decisionKey: string | null = null;
const statusLabel = { verified:'已验证', failed:'未通过', manual:'待人工',
  unverified:'未验证', risk_accepted:'人工接受风险', not_applicable:'不适用' } as const;
const evaluationLabel = { inconclusive:'尚未覆盖', failed:'存在失败',
  covered:'逐条已有决定' } as const;

async function refresh(): Promise<void> {
  const token = ++serial;
  if (!props.connected) { matrix.value = null; return; }
  try {
    const result = await props.client.run({type:'run.acceptanceMatrix',payload:{
      projectId: props.projectId, taskId: props.taskId,
    }});
    if (token !== serial) return;
    if (!result.ok) {
      matrix.value = null; error.value = `验收矩阵读取失败：${result.error.code}`; return;
    }
    const parsed = acceptanceMatrixSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.projectId !== props.projectId ||
      parsed.data.taskId !== props.taskId) {
      matrix.value = null; error.value = 'Host 返回了无效的验收矩阵。'; return;
    }
    matrix.value = parsed.data;
    if (!parsed.data.criteria.some((item) => item.criterion.id === selectedCriterion.value)) {
      selectedCriterion.value = parsed.data.criteria[0]?.criterion.id ?? '';
    }
    error.value = '';
  } catch {
    if (token === serial) { matrix.value = null; error.value = '验收矩阵读取失败。'; }
  }
}
async function record(): Promise<void> {
  const current = matrix.value;
  if (!current?.snapshotId || !selectedCriterion.value || reason.value.trim().length < 12 ||
    pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const result = await props.client.run({type:'run.acceptanceDecide',payload:{
      projectId:props.projectId,taskId:props.taskId,
      expectedSnapshotId:current.snapshotId,expectedContractRevision:current.contractRevision,
      criterionId:selectedCriterion.value,
      status:selectedStatus.value as 'verified'|'failed'|'risk_accepted'|'not_applicable',
      reportId:selectedReport.value || null,reason:reason.value.trim(),
      idempotencyKey:decisionKey ??= crypto.randomUUID(),
    }});
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT','HOST_EXITED'].includes(result.error.code)) decisionKey = null;
      error.value = `无法记录决定：${result.error.code}`; return;
    }
    const parsed = acceptanceMatrixSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.snapshotId !== current.snapshotId) {
      error.value = 'Host 返回了无效的决定结果。'; return;
    }
    matrix.value = parsed.data; decisionKey = null; reason.value = ''; selectedReport.value = '';
    emit('decisionChanged');
  } catch { error.value = '决定未获确认；请刷新后重试。'; }
  finally { pending.value = false; }
}
watch(() => [props.projectId,props.taskId,props.connected], () => {
  matrix.value = null; decisionKey = null; void refresh();
}, {immediate:true});
</script>

<template>
  <section class="acceptance-matrix" aria-label="逐条验收矩阵">
    <div class="acceptance-matrix-head"><h4>验收矩阵</h4>
      <ForgeButton variant="ghost" size="sm" @click="refresh">刷新真实证据</ForgeButton></div>
    <p v-if="!connected">Host 不可用；无法读取验收状态。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="matrix">
      <p v-if="!matrix.snapshotId" role="status">尚无与当前 Contract 版本匹配的 CodeSnapshot。所有必需项保持未验证。</p>
      <p v-else>当前快照 {{ matrix.snapshotId.slice(0, 8) }} · 验收覆盖 {{ evaluationLabel[matrix.evaluation] }} · Review {{ matrix.reviewStatus ?? '未完成' }} ·
        {{ matrix.requiredCovered ? '必需项均有逐条决定；仍需最终人工验收' :
          `未覆盖必需项：${matrix.missingRequiredIds.join('、')}` }}</p>
      <ol class="acceptance-matrix-list"><li v-for="item in matrix.criteria" :key="item.criterion.id">
        <strong>{{ item.criterion.id }} · {{ item.criterion.statement }}</strong>
        <ForgeBadge>{{ statusLabel[item.status] }}</ForgeBadge>
        <small>{{ item.criterion.method }} · {{ item.criterion.required ? '必需' : '可选' }} ·
          {{ item.reportId ? `报告 ${item.reportId.slice(0, 8)}` : '无逐条报告' }}</small>
        <p>{{ item.reason }}</p>
      </li></ol>
      <p v-if="!matrix.checkReports.length">当前快照尚无命令验证报告。命令运行成功不会自动覆盖任意 AC。</p>
      <ul v-else><li v-for="report in matrix.checkReports" :key="report.reportId">
        {{ report.kind }} · {{ report.status }} · exit {{ report.exitCode ?? '未知' }} ·
        {{ report.reportId.slice(0, 8) }}</li></ul>
      <template v-if="matrix.snapshotId">
        <h5>记录逐条判断</h5>
        <p>验证通过需明确关联当前快照的报告；人工判断与风险接受必须写明依据。记录不会将 Task 标为 Done。</p>
        <ForgeSelect v-model="selectedCriterion" label="验收条件" :options="matrix.criteria.map((item) =>
          ({value:item.criterion.id,label:`${item.criterion.id} · ${item.criterion.statement}`}))" />
        <ForgeSelect v-model="selectedStatus" label="判断" :options="[
          {value:'verified',label:'已验证'}, {value:'failed',label:'未通过'},
          {value:'risk_accepted',label:'人工接受风险'},
          {value:'not_applicable',label:'不适用（需说明）'},
        ]" />
        <ForgeSelect v-model="selectedReport" label="当前快照报告（自动项验证必选）"
          :options="[{value:'',label:'不关联报告'},...matrix.checkReports.map((report) =>
            ({value:report.reportId,label:`${report.kind} · ${report.status} · ${report.reportId.slice(0,8)}`}))]" />
        <ForgeTextarea v-model="reason" label="判断依据 / 未验证说明 / 风险接受原因" :rows="3" />
        <ForgeButton variant="secondary" size="sm" :disabled="pending || reason.trim().length < 12"
          :loading="pending" @click="record">记录本快照的判断</ForgeButton>
      </template>
    </template>
  </section>
</template>
