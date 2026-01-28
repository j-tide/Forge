<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { taskChangeViewSchema, type TaskChangeView, type TaskContract } from '@forge/contracts';
import { ForgeButton, ForgeTextarea } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  contract: TaskContract; connected: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const view = ref<TaskChangeView | null>(null);
const goal = ref('');
const criteria = ref<string[]>([]);
const changedAcceptance = computed(() => props.contract.acceptance.some((item, index) =>
  criteria.value[index]?.trim() !== item.statement));
const reason = ref('');
const approveReason = ref('');
const confirmScope = ref(false);
const busy = ref(false);
const error = ref('');
let serial = 0;
let proposalKey: string | null = null;
let proposalDecisionId: string | null = null;

async function refresh(): Promise<void> {
  const current = ++serial;
  if (!props.connected) { view.value = null; return; }
  busy.value = true; error.value = '';
  try {
    const result = await props.client.run({type:'task.change.get',payload:{
      projectId:props.projectId,taskId:props.taskId,
    }});
    if (serial !== current) return;
    if (!result.ok) { error.value = result.error.code; return; }
    if (result.data === null) { view.value = null; return; }
    const parsed = taskChangeViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.taskId !== props.taskId) {
      error.value = '任务变更记录格式无效。'; return;
    }
    view.value = parsed.data;
  } catch { if (serial === current) error.value = '无法读取任务变更。'; }
  finally { if (serial === current) busy.value = false; }
}

async function propose(): Promise<void> {
  const nextGoal = goal.value.trim();
  const nextCriteria = criteria.value.map((item) => item.trim());
  if (busy.value || !props.connected || reason.value.trim().length < 12 || !nextGoal ||
    nextCriteria.some((item) => !item) || (changedAcceptance.value && !confirmScope.value) ||
    (nextGoal === props.contract.goal && !changedAcceptance.value)) return;
  busy.value = true; error.value = '';
  const decisionId = proposalDecisionId ??= crypto.randomUUID();
  const decisionRef = `decision:${decisionId}`;
  const candidate: TaskContract = {
    ...props.contract, revision:props.contract.revision + 1,goal:nextGoal,
    sourceRefs:[...props.contract.sourceRefs,decisionRef],
    acceptance:props.contract.acceptance.map((item,index) =>
      nextCriteria[index] !== item.statement ? {
        ...item,statement:nextCriteria[index]!,sourceRefs:[...item.sourceRefs,decisionRef],
      } : item),
  };
  try {
    const result = await props.client.run({type:'task.change.propose',payload:{
      projectId:props.projectId,taskId:props.taskId,expectedRevision:props.contract.revision,
      contract:candidate,decisionId,reason:reason.value.trim(),
      confirmScopeChange:changedAcceptance.value,
      idempotencyKey:proposalKey ??= crypto.randomUUID(),
    }});
    if (!result.ok) {
      if (!['TRANSPORT_TIMEOUT','HOST_EXITED'].includes(result.error.code)) {
        proposalKey = null; proposalDecisionId = null;
      }
      error.value = `无法提出变更：${result.error.code}`; return;
    }
    const parsed = taskChangeViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.state !== 'proposed') {
      error.value = 'Host 未确认变更提议。'; return;
    }
    view.value = parsed.data; proposalKey = null; proposalDecisionId = null;
  } catch { error.value = '变更结果未知。请重新读取，不要重复提交。'; }
  finally { busy.value = false; }
}

async function decide(decision: 'approve' | 'reject'): Promise<void> {
  const current = view.value;
  if (busy.value || !current || current.state !== 'proposed' ||
    approveReason.value.trim().length < 12) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.run({type:'task.change.decide',payload:{
      projectId:props.projectId,taskId:props.taskId,changeId:current.changeId,
      expectedRevision:current.baseRevision,expectedContentHash:current.contentHash,
      decision,reason:approveReason.value.trim(),
    }});
    if (!result.ok) { error.value = `决定未保存：${result.error.code}`; return; }
    const parsed = taskChangeViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.changeId !== current.changeId) {
      error.value = 'Host 未确认此决定。'; return;
    }
    view.value = parsed.data;
    if (parsed.data.state === 'applied') emit('changed');
  } catch { error.value = '决定结果未知，请重新读取。'; }
  finally { busy.value = false; }
}

async function apply(): Promise<void> {
  const current = view.value;
  if (busy.value || current?.state !== 'awaiting_safe_point') return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.run({type:'task.change.apply',payload:{
      projectId:props.projectId,taskId:props.taskId,changeId:current.changeId,
      expectedRevision:current.baseRevision,confirmed:true,
    }});
    if (!result.ok) { error.value = result.error.code === 'TASK_CHANGE_WAITING_SAFE_POINT' ?
      '旧 Run 或检查仍在进行；当前目标保持冻结，请等待安全点。' :
      `无法应用变更：${result.error.code}`; return; }
    const parsed = taskChangeViewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.state !== 'applied') {
      error.value = 'Host 未确认新版本已应用。'; return;
    }
    view.value = parsed.data; emit('changed');
  } catch { error.value = '应用结果未知，请重新读取。'; }
  finally { busy.value = false; }
}

watch(() => [props.projectId,props.taskId,props.connected,props.contract.revision], () => {
  goal.value = props.contract.goal;
  criteria.value = props.contract.acceptance.map((item) => item.statement);
  reason.value = ''; approveReason.value = ''; confirmScope.value = false;
  proposalKey = null; proposalDecisionId = null;
  void refresh();
}, {immediate:true});
</script>

<template>
  <section class="acceptance-matrix" aria-label="任务版本变更">
    <div class="acceptance-matrix-head"><h4>任务版本变更</h4>
      <ForgeButton variant="ghost" size="sm" :disabled="busy" @click="refresh">重新读取</ForgeButton></div>
    <p>当前 Run 始终使用启动时冻结的目标和配置；变更需单独批准，旧报告不会用于新版本验收。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="view && (view.state === 'proposed' || view.state === 'awaiting_safe_point')">
      <p>提议 v{{ view.proposedRevision }}：{{ view.contract.goal }} · 状态 {{ view.state }}</p>
      <p>原版本 v{{ view.baseRevision }} 与已有 Run 保留。</p>
      <template v-if="view.state === 'proposed'">
        <ForgeTextarea v-model="approveReason" label="批准或拒绝理由" :rows="2" />
        <ForgeButton size="sm" :disabled="busy || approveReason.trim().length < 12"
          @click="decide('approve')">批准此版本</ForgeButton>
        <ForgeButton variant="ghost" size="sm" :disabled="busy || approveReason.trim().length < 12"
          @click="decide('reject')">拒绝</ForgeButton>
      </template>
      <template v-else>
        <p role="status">已批准，等待旧 Run、Review、Verify 与返工完全结束后由用户明确应用。</p>
        <ForgeButton size="sm" :disabled="busy" @click="apply">在安全点应用新版本</ForgeButton>
      </template>
    </template>
    <template v-else>
      <p v-if="view?.state === 'applied'">上次变更已应用；历史 Run 和报告保留。</p>
      <ForgeTextarea v-model="goal" label="下一版本目标" :rows="3" />
      <ForgeTextarea v-for="(item,index) in contract.acceptance" :key="item.id"
        :model-value="criteria[index] ?? ''" :label="`${item.id} 验收条件`" :rows="2"
        @update:model-value="criteria[index] = $event" />
      <label v-if="changedAcceptance">
        <input v-model="confirmScope" type="checkbox" /> 我确认验收范围改变，旧报告需重新验证。</label>
      <ForgeTextarea v-model="reason" label="本次变更的用户决定与原因" :rows="2" />
      <ForgeButton size="sm" :disabled="busy || reason.trim().length < 12 ||
        criteria.some((item) => !item.trim()) || (changedAcceptance && !confirmScope) ||
        (goal.trim() === contract.goal && !changedAcceptance)"
        @click="propose">提出新版本</ForgeButton>
    </template>
  </section>
</template>
