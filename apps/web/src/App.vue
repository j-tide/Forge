<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { ForgeClient } from '@forge/client';
import { forgeProjectSchema, pythonHostSnapshotSchema, type ForgeProject,
  type HostConnectionSnapshot, type PythonHostSnapshot } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeCommandPanelShell, ForgeTextarea } from '@forge/ui';
import AppShell from './components/AppShell.vue';
import ProjectsView from './components/ProjectsView.vue';
import ConversationPanel from './components/ConversationPanel.vue';
import BoardView from './components/BoardView.vue';
import PluginsView from './components/PluginsView.vue';
import { detectRuntime } from './runtime';
import type { ForgeView } from './views';

const runtime = detectRuntime();
const client = new ForgeClient(typeof window === 'undefined' ? undefined : window.forge);
const hostStatus = ref<HostConnectionSnapshot>(client.status);
const pythonHostStatus = ref<PythonHostSnapshot | null>(null);
const activeProject = ref<ForgeProject | null>(null);
const view = ref<ForgeView>(typeof location !== 'undefined' && location.hash.startsWith('#/tasks/') ?
  'board' : 'home');
const boardRefreshKey = ref(0);
const idea = ref('');
const reduceTransparency = ref(false);
const reduceMotion = ref(false);
const showUiShowcase = ref(import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#/dev/ui');
const UiShowcase = import.meta.env.DEV ? defineAsyncComponent(() => import('./showcase/UiShowcase.vue')) : null;
let unsubscribeStatus: (() => void) | null = null;
let unsubscribePythonStatus: (() => void) | null = null;
let loadedHostId: string | null = null;
async function loadActive(): Promise<void> {
  if (!hostStatus.value.info || !['connected', 'degraded'].includes(hostStatus.value.state)) return;
  const hostId = hostStatus.value.info.hostId;
  if (loadedHostId === hostId) return;
  loadedHostId = hostId;
  try {
    const result = await client.project({ type: 'project.active', payload: {} });
    if (result.ok) {
      const checked = forgeProjectSchema.safeParse(result.data);
      activeProject.value = checked.success ? checked.data : null;
    }
  } catch { loadedHostId = null; }
}
function updateShowcase(): void { showUiShowcase.value = import.meta.env.DEV && location.hash === '#/dev/ui'; }

onMounted(async () => {
  if (window.forge?.pythonHostStatus && window.forge.onPythonHostStatus) {
    unsubscribePythonStatus = window.forge.onPythonHostStatus((raw) => {
      const parsed = pythonHostSnapshotSchema.safeParse(raw);
      if (parsed.success) pythonHostStatus.value = parsed.data;
    });
    const initial = pythonHostSnapshotSchema.safeParse(await window.forge.pythonHostStatus());
    if (initial.success) pythonHostStatus.value = initial.data;
  }
  window.addEventListener('hashchange', updateShowcase);
  unsubscribeStatus = client.subscribe((snapshot) => { hostStatus.value = snapshot; void loadActive(); });
  await client.connect();
  await client.health();
  await loadActive();
});
onUnmounted(() => { window.removeEventListener('hashchange', updateShowcase); unsubscribeStatus?.();
  unsubscribePythonStatus?.(); client.disconnect(); });
async function refreshHealth(): Promise<void> { await client.health(); }
function navigate(next: ForgeView): void { view.value = next; }
const unavailableCopy: Record<'workflows' | 'agents', { title: string; text: string }> = {
  workflows: { title: '工作流', text: '工作流编辑器尚未启用。此处不会展示演示流程。' },
  agents: { title: 'Agents', text: 'Agent 管理尚未启用；没有连接的执行角色。' },
};
</script>

<template>
  <AppShell :view="view" :runtime-label="runtime.label" :web-runtime="runtime.kind === 'web'" :host-status="hostStatus" :python-host-status="pythonHostStatus" :project-name="activeProject?.name ?? null" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" @navigate="navigate" @refresh-health="refreshHealth">
    <UiShowcase v-if="showUiShowcase && UiShowcase" />
    <div v-else-if="view === 'home' || view === 'board'" class="work-layout" :class="{ 'work-layout--board': view === 'board' }">
      <ForgeCommandPanelShell v-if="view === 'home'" aria-labelledby="compose-title">
        <div class="compose-intro">
          <p class="eyebrow">FORGE / NEW WORK</p>
          <h1 id="compose-title">What do you want to build?</h1>
          <p class="compose-description">从一句想法开始。任务草稿能力将在后续接入；当前 Agent runtime 尚未启用。</p>
        </div>
        <ConversationPanel v-if="activeProject && runtime.kind === 'desktop' && hostStatus.state === 'connected'"
          :client="client" :project-id="activeProject.projectId" @approval-changed="boardRefreshKey += 1" />
        <div v-else class="compose-bottom">
          <div class="compose-divider" />
          <ForgeTextarea v-model="idea" label="描述你的想法" visually-hidden-label placeholder="例如：给订单列表添加日期筛选…" :max-height="240" :rows="5" />
          <div class="compose-action"><span>输入仅保留在当前页面</span><ForgeButton variant="primary" disabled>Agent runtime 尚未启用</ForgeButton></div>
          <p class="availability-note">此处没有调用模型，也不会创建任务。</p>
        </div>
      </ForgeCommandPanelShell>
      <section class="board-pane" aria-labelledby="board-title">
        <ForgeCard tone="reading" class="project-summary"><span class="summary-symbol" aria-hidden="true">⌁</span><div><strong>当前项目</strong><p>{{ activeProject ? `${activeProject.name} · ${activeProject.probe.currentBranch ?? 'branch unknown'}` : '尚未选择项目目录' }}</p></div><ForgeButton variant="ghost" @click="navigate('projects')">{{ activeProject ? '切换项目' : '选择项目' }} <span aria-hidden="true">↗</span></ForgeButton></ForgeCard>
        <BoardView :client="client" :project-id="activeProject?.projectId ?? null"
          :connected="hostStatus.state === 'connected' && runtime.kind === 'desktop'"
          :refresh-key="boardRefreshKey" @choose-project="navigate('projects')" />
      </section>
    </div>
    <ProjectsView v-else-if="view === 'projects'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :active-project="activeProject" @activated="activeProject = $event" @home="navigate('home')" />
    <PluginsView v-else-if="view === 'plugins'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" />
    <section v-else-if="view === 'settings'" class="utility-view" aria-labelledby="settings-title">
      <p class="eyebrow">FORGE / SETTINGS</p><h1 id="settings-title">外观</h1><p class="utility-intro">显示偏好只影响当前窗口；完整设置将在后续任务中提供。</p>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少透明度</strong><p>将雾面表面切换为更清晰的实色阅读面。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceTransparency" aria-label="减少透明度" @click="reduceTransparency = !reduceTransparency"><span /></button></ForgeCard>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少动效</strong><p>关闭非必要的位移和过渡；系统偏好也会自动生效。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceMotion" aria-label="减少动效" @click="reduceMotion = !reduceMotion"><span /></button></ForgeCard>
      <ForgeButton variant="secondary" @click="navigate('home')">返回工作台</ForgeButton>
    </section>
    <section v-else class="utility-view" aria-labelledby="unavailable-title">
      <p class="eyebrow">FORGE / FOUNDATION</p><h1 id="unavailable-title">{{ unavailableCopy[view].title }}</h1><p class="utility-intro">{{ unavailableCopy[view].text }}</p>
      <ForgeButton variant="secondary" @click="navigate('home')">返回工作台</ForgeButton>
    </section>
  </AppShell>
</template>
