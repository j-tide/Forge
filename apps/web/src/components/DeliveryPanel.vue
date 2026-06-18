<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { deliverySummarySchema, mergePreviewSchema, mergeReceiptSchema,
  type DeliverySummary, type MergePreview, type MergeReceipt } from '@forge/contracts';
import { ForgeButton } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean; refreshKey: number }>();
const summary = ref<DeliverySummary | null>(null);
const preview = ref<MergePreview | null>(null);
const receipt = ref<MergeReceipt | null>(null);
const error = ref('');
const busy = ref(false);
const confirmed = ref(false);
let request = 0;
let operationKey: string | null = null;

async function refresh(): Promise<void> {
  const serial = ++request;
  summary.value = null; preview.value = null; receipt.value = null;
  confirmed.value = false; error.value = '';
  if (!props.connected) return;
  busy.value = true;
  try {
    const payload = {projectId:props.projectId, taskId:props.taskId};
    const detail = await props.client.run({type:'deliveries.get',payload});
    if (serial !== request) return;
    if (!detail.ok) { error.value = `交付记录不可用：${detail.error.code}`; return; }
    const parsed = deliverySummarySchema.safeParse(detail.data);
    if (!parsed.success || parsed.data.projectId !== props.projectId ||
      parsed.data.taskId !== props.taskId) { error.value = '交付记录格式无效。'; return; }
    summary.value = parsed.data;
    const target = await props.client.run({type:'deliveries.preview',payload});
    if (serial !== request) return;
    if (!target.ok) { error.value = `合并预检不可用：${target.error.code}`; return; }
    const targetParsed = mergePreviewSchema.safeParse(target.data);
    if (!targetParsed.success || targetParsed.data.deliveryId !== parsed.data.deliveryId) {
      error.value = '合并预检格式无效。'; return;
    }
    preview.value = targetParsed.data;
  } catch { if (serial === request) error.value = '交付状态读取失败。'; }
  finally { if (serial === request) busy.value = false; }
}

async function merge(): Promise<void> {
  const record = summary.value;
  const target = preview.value;
  if (busy.value || !confirmed.value || !record || !target?.canMerge || !target.targetHead ||
    target.deliveryId !== record.deliveryId) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.run({type:'deliveries.merge',payload:{
      projectId:props.projectId, taskId:props.taskId, deliveryId:record.deliveryId,
      targetBranch:target.targetBranch, expectedTargetHead:target.targetHead,
      expectedSnapshotId:record.snapshotId, confirmed:true,
      idempotencyKey:operationKey ??= crypto.randomUUID(),
    }});
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT','HOST_EXITED'].includes(result.error.code)) operationKey = null;
      error.value = result.error.code === 'MERGE_REVALIDATION_REQUIRED' ?
        '目标分支已变化。旧快照需要重新验证，不能沿用这次合并确认。' :
        `合并未确认：${result.error.code}`;
      return;
    }
    const parsed = mergeReceiptSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.deliveryId !== record.deliveryId) {
      error.value = '合并结果尚未确认；请查看诊断。'; return;
    }
    receipt.value = parsed.data; confirmed.value = false;
    if (parsed.data.state === 'merged') { operationKey = null; }
    else error.value = `合并操作状态：${parsed.data.state}。不能推断已合并。`;
  } catch { error.value = '合并结果未知。请刷新后核查；不要以新 key 重试。'; }
  finally { busy.value = false; }
}

watch(() => [props.projectId,props.taskId,props.connected,props.refreshKey], () => {
  operationKey = null; void refresh();
}, {immediate:true});
</script>

<template>
  <section class="acceptance-matrix" aria-label="交付记录与显式合并">
    <div class="acceptance-matrix-head"><h4>交付记录</h4>
      <ForgeButton variant="ghost" size="sm" :disabled="busy" @click="refresh">重新读取</ForgeButton></div>
    <p v-if="busy" role="status">正在核对交付与本地 Git…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="summary">
      <p>交付 {{ summary.deliveryId.slice(0,8) }} · Contract v{{ summary.contractRevision }}
        · 开发 Attempt {{ summary.attemptRunIds.length }} 次 · Review {{ summary.reviewReportIds.length }} 份
        · Verify {{ summary.verifyReportIds.length }} 份 · AC 决定 {{ summary.criterionDecisionIds.length }} 条</p>
      <p>快照 {{ summary.snapshotId.slice(0,8) }} · Commit {{ summary.snapshotCommit.slice(0,12) }}
        · 最终验收已记录 · 尚未自动推送或部署。</p>
      <p v-if="summary.planStatus === 'not_configured'">Plan：当前阶段未配置正式 Plan 产物。</p>
      <p v-if="summary.unresolvedRisks.length">明确接受的风险：{{ summary.unresolvedRisks.join('；') }}。</p>
    </template>
    <template v-if="preview">
      <p>本地目标分支 {{ preview.targetBranch || '未设置' }} · HEAD
        {{ preview.targetHead?.slice(0,12) ?? '不可用' }}</p>
      <p v-if="preview.blockers.length" role="status">合并门禁：{{ preview.blockers.join('、') }}。</p>
      <p v-if="preview.operationState === 'intent' || preview.operationState === 'unknown'"
        role="alert">上次合并结果尚未确认。Forge 不会自动重试；请人工核对本地分支与交付快照。</p>
      <p v-if="preview.operationState === 'merged'">已显式本地合并，结果 Commit
        {{ preview.resultCommit?.slice(0,12) }}。未推送、未部署。</p>
      <p v-if="receipt?.state === 'merged'">已显式本地合并，结果 Commit {{ receipt.resultCommit?.slice(0,12) }}。
        未推送、未部署。</p>
      <template v-else-if="preview.canMerge && summary">
        <p>只有目标 HEAD 与已验证 base 一致且工作树干净时才能合并。此操作会修改当前本地分支和工作树。</p>
        <label><input v-model="confirmed" type="checkbox" /> 我确认将当前快照显式合并到上述本地分支；不推送或部署。</label>
        <ForgeButton variant="primary" size="sm" :disabled="busy || !confirmed" :loading="busy"
          @click="merge">合并当前交付</ForgeButton>
      </template>
    </template>
  </section>
</template>
