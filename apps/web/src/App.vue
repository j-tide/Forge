<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { ForgeClient } from '@forge/client';
import type { HostConnectionSnapshot } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeCommandPanelShell, ForgeEmptyState, ForgeTextarea, ForgeBadge } from '@forge/ui';
import AppShell from './components/AppShell.vue';
import { detectRuntime } from './runtime';
import type { ForgeView } from './views';

const runtime = detectRuntime();
const client = new ForgeClient(typeof window === 'undefined' ? undefined : window.forge);
const hostStatus = ref<HostConnectionSnapshot>(client.status);
const view = ref<ForgeView>('home');
const idea = ref('');
const reduceTransparency = ref(false);
const reduceMotion = ref(false);
const showUiShowcase = ref(import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#/dev/ui');
const UiShowcase = import.meta.env.DEV ? defineAsyncComponent(() => import('./showcase/UiShowcase.vue')) : null;
let unsubscribeStatus: (() => void) | null = null;
function updateShowcase(): void { showUiShowcase.value = import.meta.env.DEV && location.hash === '#/dev/ui'; }

onMounted(async () => {
  window.addEventListener('hashchange', updateShowcase);
  unsubscribeStatus = client.subscribe((snapshot) => { hostStatus.value = snapshot; });
  await client.connect();
  await client.health();
});
onUnmounted(() => { window.removeEventListener('hashchange', updateShowcase); unsubscribeStatus?.(); client.disconnect(); });
async function refreshHealth(): Promise<void> { await client.health(); }
function navigate(next: ForgeView): void { view.value = next; }
const unavailableCopy: Record<'workflows' | 'agents' | 'plugins', { title: string; text: string }> = {
  workflows: { title: '工作流', text: '工作流编辑器尚未启用。此处不会展示演示流程。' },
  agents: { title: 'Agents', text: 'Agent 管理尚未启用；没有连接的执行角色。' },
  plugins: { title: '插件', text: '插件管理尚未启用；没有安装或运行状态可展示。' },
};
</script>

<template>
  <AppShell :view="view" :runtime-label="runtime.label" :web-runtime="runtime.kind === 'web'" :host-status="hostStatus" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" @navigate="navigate" @refresh-health="refreshHealth">
    <UiShowcase v-if="showUiShowcase && UiShowcase" />
    <div v-else-if="view === 'home' || view === 'board'" class="work-layout" :class="{ 'work-layout--board': view === 'board' }">
      <ForgeCommandPanelShell v-if="view === 'home'" aria-labelledby="compose-title">
        <div class="compose-intro">
          <p class="eyebrow">FORGE / NEW WORK</p>
          <h1 id="compose-title">What do you want to build?</h1>
          <p class="compose-description">从一句想法开始。任务草稿能力将在后续接入；当前 Agent runtime 尚未启用。</p>
        </div>
        <div class="compose-bottom">
          <div class="compose-divider" />
          <ForgeTextarea v-model="idea" label="描述你的想法" visually-hidden-label placeholder="例如：给订单列表添加日期筛选…" :max-height="240" :rows="5" />
          <div class="compose-action"><span>输入仅保留在当前页面</span><ForgeButton variant="primary" disabled>Agent runtime 尚未启用</ForgeButton></div>
          <p class="availability-note">此处没有调用模型，也不会创建任务。</p>
        </div>
      </ForgeCommandPanelShell>
      <section class="board-pane" aria-labelledby="board-title">
        <div class="board-heading"><div><p class="eyebrow">WORKSPACE / BOARD</p><h2 id="board-title">研发看板</h2><p>任务服务尚未启用，当前只显示真实空状态。</p></div><ForgeBadge>空状态</ForgeBadge></div>
        <ForgeCard tone="reading" class="project-summary"><span class="summary-symbol" aria-hidden="true">⌁</span><div><strong>当前项目</strong><p>尚未选择项目目录</p></div><ForgeButton variant="ghost" @click="navigate('projects')">查看项目入口 <span aria-hidden="true">↗</span></ForgeButton></ForgeCard>
        <div class="empty-board"><ForgeEmptyState title="还没有任务" description="任务服务接入后，这里会显示真实的状态与交付记录。" /></div>
        <div class="board-footnote"><span class="footnote-line" />任务看板尚不可用 · 不显示演示任务</div>
      </section>
    </div>
    <section v-else-if="view === 'projects'" class="utility-view" aria-labelledby="projects-title">
      <p class="eyebrow">FORGE / PROJECTS</p><h1 id="projects-title">项目</h1><p class="utility-intro">当前未连接项目。项目目录选择与环境检查将在后续任务接入。</p>
      <ForgeCard tone="reading" class="utility-card"><span class="utility-icon" aria-hidden="true">⌁</span><div><strong>尚未选择项目</strong><p>Forge 不会在本轮读取仓库或运行项目命令。</p></div></ForgeCard>
      <ForgeButton variant="secondary" @click="navigate('home')">返回工作台</ForgeButton>
    </section>
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
