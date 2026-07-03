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
  canRestartHost: boolean;
  hostRestartBusy: boolean;
  hostRestartError: string;
  projectName: string | null;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  theme: 'light' | 'dark';
}>();
const emit = defineEmits<{ navigate: [view: ForgeView]; chooseProject: []; newTask: []; refreshHealth: []; restartHost: [] }>();
const diagnosticsOpen = ref(false);
const commandOpen = ref(false);
const commandQuery = ref('');
const railItems = [
  { id: 'board', label: '看板', icon: 'board' },
  { id: 'workflows', label: '工作流', icon: 'workflow' },
  { id: 'agents', label: '角色', icon: 'agents' },
  { id: 'plugins', label: '插件', icon: 'plugins' },
  { id: 'knowledge', label: '项目资料', icon: 'knowledge' },
  { id: 'projects', label: '项目管理', icon: 'projects' },
  { id: 'settings', label: '设置', icon: 'settings' },
];
const currentPage = computed(() => railItems.find((item) => item.id === props.view)?.label ?? '看板');
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
    <template #rail>
      <ForgeIconRail :items="railItems" :selected="view" @select="navigate">
        <template #footer>
          <button v-if="!hostStatus.health?.storage.readOnly" class="sidebar-new-task" type="button"
            aria-label="新建任务" title="新建任务" @click="emit('newTask')">
            <span aria-hidden="true">＋</span>
          </button>
        </template>
      </ForgeIconRail>
    </template>
    <template #header>
      <ForgeWorkspaceHeader>
        <div class="topbar-brand"><strong>{{ currentPage }}</strong></div>
        <span class="topbar-separator" aria-hidden="true" />
        <button class="project-picker" type="button" :title="projectName ?? '选择项目'" @click="emit('chooseProject')">
          <svg class="project-picker-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" /></svg>
          <span class="project-picker-name">{{ projectName ?? '选择项目' }}</span>
          <span class="project-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="topbar-spacer" />
        <button class="quick-nav-trigger" type="button" aria-label="快速导航" title="快速导航 · Cmd/Ctrl+K" @click="commandOpen = true"><span aria-hidden="true">⌕</span> <span>⌘/Ctrl K</span></button>
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
              <dt>Storage</dt><dd>{{ hostStatus.health?.storage.status === 'ready' ? hostStatus.health.storage.readOnly ? 'Read-only' : 'Ready' : 'Unavailable' }}</dd>
              <dt>Schema</dt><dd>{{ hostStatus.health?.storage.schemaVersion ?? '—' }}</dd>
            </dl>
            <p v-if="hostStatus.error" class="diagnostics-error">{{ hostStatus.error.code }} · {{ hostStatus.error.message }}</p>
            <button v-if="hostStatus.state === 'connected' || hostStatus.state === 'degraded'" class="diagnostics-refresh" type="button" @click="emit('refreshHealth')">检查健康状态</button>
            <template v-if="hostStatus.state === 'crashed' && canRestartHost">
              <p>只重启当前 Desktop 拥有且已退出的 Host；未完成 Run 会中断并隔离工作区，不会自动继续执行。</p>
              <button class="diagnostics-refresh" type="button" :disabled="hostRestartBusy" @click="emit('restartHost')">{{ hostRestartBusy ? '正在重启…' : '重启本地 Host' }}</button>
              <p v-if="hostRestartError" role="alert" class="diagnostics-error">{{ hostRestartError }}</p>
            </template>
          </ForgePopover>
        </div>
      </ForgeWorkspaceHeader>
    </template>
    <ForgeContentArea :class="{ 'shell-content--historical': hostStatus.health?.storage.readOnly }">
      <p v-if="hostStatus.health?.storage.readOnly" class="historical-read-only-banner" role="status">
        历史数据只读 · 此窗口可查看记录，但不能更改项目、任务或运行。请使用正常的 Forge 工作区继续操作。
      </p>
      <slot />
    </ForgeContentArea>
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
