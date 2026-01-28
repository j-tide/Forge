<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { reworkCycleSchema, type ReworkCycle } from '@forge/contracts';
import { ForgeBadge, ForgeButton } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; projectId: string; taskId: string;
  connected: boolean }>();
const cycles = ref<ReworkCycle[]>([]);
const error = ref('');
let serial = 0;
const statusLabel: Record<ReworkCycle['state'], string> = {
  pending: '待启动', launching: '启动中', running: '返工中',
  succeeded: '已生成新快照', failed: '返工失败', cancelled: '已取消',
  interrupted: '启动中断', blocked: '已达上限，等待人工处理',
};
async function refresh(): Promise<void> {
  const token = ++serial;
  if (!props.connected) { cycles.value = []; return; }
  try {
    const result = await props.client.run({type:'run.reworkCycles',payload:{
      projectId:props.projectId,taskId:props.taskId,
    }});
    if (token !== serial) return;
    if (!result.ok) { error.value = `返工记录读取失败：${result.error.code}`; return; }
    const parsed = reworkCycleSchema.array().max(20).safeParse(result.data);
    if (!parsed.success || parsed.data.some((item) => item.projectId !== props.projectId ||
      item.taskId !== props.taskId)) { error.value = 'Host 返回了无效的返工记录。'; return; }
    cycles.value = parsed.data; error.value = '';
  } catch { if (token === serial) error.value = '返工记录读取失败。'; }
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
      <ForgeBadge>{{ statusLabel[cycle.state] }}</ForgeBadge>
      <small>来源快照 {{ cycle.sourceSnapshotId.slice(0, 8) }} · 报告 {{ cycle.triggerReportId.slice(0, 8) }} ·
        已使用 {{ cycle.totalAttempts }} 次总尝试</small>
      <p v-if="cycle.reasonCode">{{ cycle.reasonCode }}</p>
    </li></ol>
  </section>
</template>
