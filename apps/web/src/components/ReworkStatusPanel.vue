<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { reworkCycleSchema, type ReworkCycle } from '@forge/contracts';
import { ForgeBadge, ForgeButton } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const cycles = ref<ReworkCycle[]>([]);
const error = ref('');
let serial = 0;
let refreshing = false;
const activeStates = new Set<ReworkCycle['state']>(['pending', 'launching', 'running']);
const timer = setInterval(() => {
  if (props.connected && !refreshing &&
    cycles.value.some((cycle) => activeStates.has(cycle.state))) {
    void refresh();
  }
}, 2000);
onUnmounted(() => { clearInterval(timer); serial++; });
const statusLabel: Record<ReworkCycle['state'], string> = {
  pending: '待启动', launching: '启动中', running: '返工中',
  succeeded: '已生成新快照', failed: '返工失败', cancelled: '已取消',
  interrupted: '启动中断', blocked: '已阻断，等待人工处理',
};
function cycleStatus(cycle: ReworkCycle): string {
  return cycle.state === 'blocked' && cycle.reasonCode === 'REWORK_LIMIT_REACHED'
    ? '已达上限，等待人工处理' : statusLabel[cycle.state];
}
async function refresh(): Promise<void> {
  const token = ++serial;
  if (!props.connected) { cycles.value = []; return; }
  refreshing = true;
  try {
    const result = await props.client.run({type:'run.reworkCycles',payload:{
      projectId:props.projectId,taskId:props.taskId,
    }});
    if (token !== serial) return;
    if (!result.ok) { error.value = `返工记录读取失败：${result.error.code}`; return; }
    const parsed = reworkCycleSchema.array().max(20).safeParse(result.data);
    if (!parsed.success || parsed.data.some((item) => item.projectId !== props.projectId ||
      item.taskId !== props.taskId)) { error.value = 'Host 返回了无效的返工记录。'; return; }
    const completed = cycles.value.some((before) => activeStates.has(before.state) &&
      parsed.data.some((after) => after.cycleId === before.cycleId &&
        !activeStates.has(after.state)));
    cycles.value = parsed.data; error.value = '';
    if (completed) emit('changed');
  } catch { if (token === serial) error.value = '返工记录读取失败。'; }
  finally { if (token === serial) refreshing = false; }
}
watch(() => [props.projectId,props.taskId,props.connected], () => {
  cycles.value = []; void refresh();
}, {immediate:true});
</script>

<template>
  <section class="rework-status" aria-label="有限返工记录">
    <div class="acceptance-matrix-head"><h4>有限返工</h4>
      <ForgeButton variant="ghost" size="sm" @click="refresh">刷新</ForgeButton></div>
    <p v-if="!connected">Host 不可用；返工状态未加载。</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!cycles.length">尚无 Review 或 Verify 触发的返工。</p>
    <ol v-else class="acceptance-matrix-list"><li v-for="cycle in cycles" :key="cycle.cycleId">
      <strong>第 {{ cycle.cycleNo }} 次返工 · {{ cycle.triggerKind === 'review' ? 'Review' : 'Verify' }}</strong>
      <ForgeBadge>{{ cycleStatus(cycle) }}</ForgeBadge>
      <small>来源快照 {{ cycle.sourceSnapshotId.slice(0, 8) }} · 报告 {{ cycle.triggerReportId.slice(0, 8) }} ·
        已使用 {{ cycle.totalAttempts }} 次总尝试</small>
      <p v-if="cycle.reasonCode">{{ cycle.state === 'succeeded'
        ? '自动闸门曾启动失败；同一返工快照的有效报告已恢复当前流程。原因：'
        : '原因：' }}{{ cycle.reasonCode }}</p>
    </li></ol>
  </section>
</template>
