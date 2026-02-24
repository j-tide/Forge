<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { HostConnectionSnapshot, PythonHostSnapshot } from '@forge/contracts';
import { ForgeAppShell, ForgeContentArea, ForgeDialog, ForgeIconRail, ForgeInput, ForgePopover, ForgeWorkspaceHeader } from '@forge/ui';
import type { ForgeView } from '../views';

const props = defineProps<{
  view: ForgeView;
  runtimeLabel: string;
  webRuntime: boolean;
  hostStatus: HostConnectionSnapshot;
  pythonHostStatus?: PythonHostSnapshot | null;
  projectName: string | null;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  theme: 'light' | 'dark';
}>();
const emit = defineEmits<{ navigate: [view: ForgeView]; refreshHealth: [] }>();
const diagnosticsOpen = ref(false);
const commandOpen = ref(false);
const commandQuery = ref('');
const railItems = [
  { id: 'home', label: '工作台', icon: 'home' },
  { id: 'board', label: '研发看板', icon: 'board' },
  { id: 'workflows', label: '工作流', icon: 'workflow' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'plugins', label: '插件', icon: 'plugins' },
  { id: 'projects', label: '项目', icon: 'projects' },
  { id: 'knowledge', label: '项目资料', icon: 'knowledge' },
  { id: 'settings', label: '设置', icon: 'settings' },
];
const hostLabel = computed(() => {
  switch (props.hostStatus.state) {
    case 'starting': return 'Host starting…';
    case 'connected': return 'Host connected';
    case 'degraded': return 'Host degraded';
    case 'crashed': return 'Host crashed';
    case 'incompatible': return 'Host incompatible';
    case 'unavailable': return props.webRuntime ? 'Local Host unavailable' : 'Host unavailable';
  }
  return 'Host unavailable';
});
const uptime = computed(() => props.hostStatus.health ? `${Math.floor(props.hostStatus.health.uptimeMs / 1000)} 秒` : '—');
const matchingCommands = computed(() => railItems.filter((item) =>
  item.label.toLocaleLowerCase().includes(commandQuery.value.trim().toLocaleLowerCase())));
function navigate(id: string): void { emit('navigate', id as ForgeView); }
function navigateCommand(id: string): void { commandOpen.value = false; navigate(id); }
function onShortcut(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    commandQuery.value = '';
    commandOpen.value = true;
  }
}
onMounted(() => window.addEventListener('keydown', onShortcut));
onUnmounted(() => window.removeEventListener('keydown', onShortcut));
</script>

<template>
  <ForgeAppShell class="app-shell" :data-theme="theme" :data-reduce-transparency="reduceTransparency" :data-reduce-motion="reduceMotion">
    <template #rail><ForgeIconRail :items="railItems" :selected="view" @select="navigate" /></template>
    <template #header>
      <ForgeWorkspaceHeader>
        <div class="topbar-brand"><strong>Forge</strong><span>研发工作台</span></div>
        <button class="project-picker" type="button" :title="projectName ?? '未选择项目'" @click="emit('navigate', 'projects')"><span class="project-dot" aria-hidden="true" /><span class="project-picker-name">{{ projectName ?? '未选择项目' }}</span><span class="project-chevron" aria-hidden="true">⌄</span></button>
        <div class="topbar-spacer" />
        <button class="quick-nav-trigger" type="button" aria-label="快速导航" title="快速导航 · Cmd/Ctrl+K" @click="commandOpen = true">⌕ <span>⌘/Ctrl K</span></button>
        <span class="runtime-badge">{{ runtimeLabel }}</span>
        <div class="host-area">
          <ForgePopover v-model:open="diagnosticsOpen" label="Host 诊断" trigger-class="host-badge" panel-class="host-diagnostics" panel-id="host-diagnostics" :state="hostStatus.state">
            <template #trigger><span aria-hidden="true" />{{ hostLabel }}</template>
            <div class="diagnostics-heading"><strong>Host 诊断</strong><button type="button" aria-label="关闭 Host 诊断" @click="diagnosticsOpen = false">×</button></div>
            <p class="diagnostics-state">{{ hostLabel }}</p>
            <dl>
              <dt>Host ID</dt><dd>{{ hostStatus.info?.hostId ?? '—' }}</dd>
              <dt>Host Version</dt><dd>{{ hostStatus.info?.version ?? '—' }}</dd>
              <dt>Python Version</dt><dd>{{ pythonHostStatus?.info?.runtime.python ?? '—' }}</dd>
              <dt>Protocol</dt><dd>{{ hostStatus.info?.protocolVersion ?? '—' }}</dd>
              <dt>PID</dt><dd>{{ hostStatus.info?.pid ?? '—' }}</dd>
              <dt>Uptime</dt><dd>{{ uptime }}</dd>
              <dt>Last Health Check</dt><dd>{{ hostStatus.lastHealthCheck ?? '—' }}</dd>
              <dt>Storage</dt><dd>{{ hostStatus.health?.storage.status === 'ready' ? 'Ready' : 'Unavailable' }}</dd>
              <dt>Schema</dt><dd>{{ hostStatus.health?.storage.schemaVersion ?? '—' }}</dd>
            </dl>
            <p v-if="hostStatus.error" class="diagnostics-error">{{ hostStatus.error.code }} · {{ hostStatus.error.message }}</p>
            <button v-if="hostStatus.state === 'connected' || hostStatus.state === 'degraded'" class="diagnostics-refresh" type="button" @click="emit('refreshHealth')">检查健康状态</button>
          </ForgePopover>
        </div>
      </ForgeWorkspaceHeader>
    </template>
    <ForgeContentArea><slot /></ForgeContentArea>
    <template #footer><footer class="shell-footer" :title="projectName ?? undefined">{{ projectName ? `${projectName} · 仅执行已批准的任务` : '当前为空工作区' }}</footer></template>
    <ForgeDialog v-model:open="commandOpen" title="快速导航" initial-focus="input.forge-text-input">
      <div class="quick-nav">
        <ForgeInput v-model="commandQuery" label="搜索页面" description="Cmd/Ctrl+K 打开；Esc 关闭。" />
        <nav aria-label="可用页面" class="quick-nav-list">
          <button v-for="item in matchingCommands" :key="item.id" type="button"
            :aria-current="view === item.id ? 'page' : undefined" @click="navigateCommand(item.id)">{{ item.label }}</button>
          <p v-if="!matchingCommands.length">没有匹配页面。</p>
        </nav>
      </div>
    </ForgeDialog>
  </ForgeAppShell>
</template>
