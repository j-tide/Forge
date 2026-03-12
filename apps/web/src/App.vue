<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { ForgeClient } from '@forge/client';
import { forgeProjectSchema, pythonHostSnapshotSchema, type ForgeProject, type DiagnosticsPreview,
  type HostConnectionSnapshot, type PythonHostSnapshot, type PairingIssued,
  type PairingInspection, pairingIssuedSchema, pairingInspectionSchema,
  pairingDecisionResultSchema } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeCommandPanelShell, ForgeSelect, ForgeTextarea } from '@forge/ui';
import AppShell from './components/AppShell.vue';
import ProjectsView from './components/ProjectsView.vue';
import ConversationPanel from './components/ConversationPanel.vue';
import BoardView from './components/BoardView.vue';
import PluginsView from './components/PluginsView.vue';
import AgentsView from './components/AgentsView.vue';
import WorkflowsView from './components/WorkflowsView.vue';
import KnowledgeView from './components/KnowledgeView.vue';
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
const themeChoice = ref('system');
const diagnosticsPreview = ref<DiagnosticsPreview | null>(null);
const diagnosticsMessage = ref('');
const diagnosticsBusy = ref(false);
const localPairing = ref<PairingIssued | null>(null);
const pairingStatus = ref<PairingInspection | null>(null);
const pairingBusy = ref(false);
const pairingMessage = ref('');
const systemDark = ref(false);
const activeTheme = computed(() => themeChoice.value === 'dark' ||
  (themeChoice.value === 'system' && systemDark.value) ? 'dark' : 'light');
const showUiShowcase = ref(import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#/dev/ui');
const UiShowcase = import.meta.env.DEV ? defineAsyncComponent(() => import('./showcase/UiShowcase.vue')) : null;
let unsubscribeStatus: (() => void) | null = null;
let unsubscribePythonStatus: (() => void) | null = null;
let loadedHostId: string | null = null;
let colorQuery: MediaQueryList | null = null;
function updateSystemTheme(event: MediaQueryListEvent): void { systemDark.value = event.matches; }
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
  if (typeof window.matchMedia === 'function') {
    colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark.value = colorQuery.matches;
    colorQuery.addEventListener('change', updateSystemTheme);
  }
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
onUnmounted(() => { colorQuery?.removeEventListener('change', updateSystemTheme);
  window.removeEventListener('hashchange', updateShowcase); unsubscribeStatus?.();
  unsubscribePythonStatus?.(); client.disconnect(); });
async function refreshHealth(): Promise<void> { await client.health(); }
function navigate(next: ForgeView): void { view.value = next; }
async function prepareDiagnostics(): Promise<void> {
  diagnosticsBusy.value = true;
  diagnosticsMessage.value = '';
  try { diagnosticsPreview.value = await client.prepareDiagnostics(); }
  catch { diagnosticsPreview.value = null; diagnosticsMessage.value = '诊断预览不可用。请检查 Host 状态。'; }
  finally { diagnosticsBusy.value = false; }
}
async function exportDiagnostics(): Promise<void> {
  if (!diagnosticsPreview.value) return;
  diagnosticsBusy.value = true;
  try {
    const result = await client.exportDiagnostics(diagnosticsPreview.value.previewId);
    diagnosticsMessage.value = result.saved ? '诊断包已保存。' : '已取消导出；没有写入文件。';
  } catch { diagnosticsMessage.value = '导出失败或预览已过期。请重新生成预览。'; }
  finally { diagnosticsBusy.value = false; }
}
async function cleanupExpiredArtifacts(): Promise<void> {
  if (!diagnosticsPreview.value) return;
  diagnosticsBusy.value = true;
  try {
    const result = await client.cleanupExpiredArtifacts(diagnosticsPreview.value.previewId);
    diagnosticsMessage.value = result.cancelled ? '已取消清理；没有更改数据。' : result.purgedImportedArtifacts > 0
      ? `已清理 ${result.purgedImportedArtifacts} 项到期导入内容；项目文件未删除。`
      : '未清理任何内容。';
    if (!result.cancelled) diagnosticsPreview.value = null;
  } catch { diagnosticsMessage.value = '清理失败或预览已过期。请重新生成预览。'; }
  finally { diagnosticsBusy.value = false; }
}
async function issueLocalPairing(): Promise<void> {
  pairingBusy.value = true; pairingMessage.value = '';
  try {
    localPairing.value = pairingIssuedSchema.parse(await client.devicePairing({
      type: 'issue', payload: {},
    }));
    pairingStatus.value = null;
    pairingMessage.value = '一次性配对已创建。当前没有可用的手机会话或 HTTPS 配对入口。';
  } catch { pairingMessage.value = '无法创建配对；请检查本地 Host。'; }
  finally { pairingBusy.value = false; }
}
async function inspectLocalPairing(): Promise<void> {
  if (!localPairing.value) return;
  pairingBusy.value = true; pairingMessage.value = '';
  try {
    pairingStatus.value = pairingInspectionSchema.parse(await client.devicePairing({
      type: 'inspect', payload: { pairingId: localPairing.value.pairingId },
    }));
  } catch { pairingMessage.value = '无法读取配对状态。'; }
  finally { pairingBusy.value = false; }
}
async function decideLocalPairing(approve: boolean): Promise<void> {
  if (!localPairing.value || pairingStatus.value?.status !== 'claimed' || !activeProject.value) return;
  pairingBusy.value = true; pairingMessage.value = '';
  try {
    const result = pairingDecisionResultSchema.parse(await client.devicePairing({
      type: 'decide', payload: { pairingId: localPairing.value.pairingId,
        approve, projectIds: approve ? [activeProject.value.projectId] : [] },
    }));
    pairingMessage.value = result.status === 'approved'
      ? '设备已获本项目范围批准；远程会话尚未启用。'
      : '已拒绝此设备。';
    await inspectLocalPairing();
  } catch { pairingMessage.value = '未更改设备授权；请重新检查状态。'; }
  finally { pairingBusy.value = false; }
}
</script>

<template>
  <AppShell :view="view" :runtime-label="runtime.label" :web-runtime="runtime.kind === 'web'" :host-status="hostStatus" :python-host-status="pythonHostStatus" :project-name="activeProject?.name ?? null" :theme="activeTheme" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" @navigate="navigate" @refresh-health="refreshHealth">
    <UiShowcase v-if="showUiShowcase && UiShowcase" />
    <div v-else-if="view === 'home' || view === 'board'" class="work-layout" :class="{ 'work-layout--board': view === 'board' }">
      <ForgeCommandPanelShell v-if="view === 'home'" aria-labelledby="compose-title">
        <div class="compose-intro">
          <p class="eyebrow">FORGE / NEW WORK</p>
          <h1 id="compose-title">What do you want to build?</h1>
          <p class="compose-description">在已信任项目中保存想法，整理并编辑任务草稿；人工批准后才进入 TODO。</p>
        </div>
        <ConversationPanel v-if="activeProject && runtime.kind === 'desktop' && hostStatus.state === 'connected'"
          :client="client" :project-id="activeProject.projectId" @approval-changed="boardRefreshKey += 1" />
        <div v-else class="compose-bottom">
          <div class="compose-divider" />
          <ForgeTextarea v-model="idea" label="描述你的想法" visually-hidden-label placeholder="例如：给订单列表添加日期筛选…" :max-height="240" :rows="5" disabled />
          <div class="compose-action"><span>{{ runtime.kind === 'web' ? '普通 Web 尚未连接远程 Host。' : '先选择并信任本地项目。' }}</span><ForgeButton v-if="runtime.kind === 'desktop'" variant="primary" @click="navigate('projects')">选择项目</ForgeButton></div>
          <p class="availability-note">{{ runtime.kind === 'web' ? '本地项目选择只在 Forge Desktop 中提供。' : '信任项目不会自动运行脚本或启动 Agent。' }}</p>
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
    <AgentsView v-else-if="view === 'agents'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" />
    <WorkflowsView v-else-if="view === 'workflows'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" />
    <KnowledgeView v-else-if="view === 'knowledge'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :project-id="activeProject?.projectId ?? null" :environment-id="activeProject?.environmentId ?? null" />
    <section v-else-if="view === 'settings'" class="utility-view" aria-labelledby="settings-title">
      <p class="eyebrow">FORGE / SETTINGS</p><h1 id="settings-title">外观</h1><p class="utility-intro">显示偏好只影响当前窗口。系统主题变更会在“跟随系统”时同步。</p>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>主题</strong><p>浅色银雾或低亮度蓝灰阅读面。</p></div><ForgeSelect v-model="themeChoice" label="界面主题" :options="[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]" /></ForgeCard>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少透明度</strong><p>将雾面表面切换为更清晰的实色阅读面。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceTransparency" aria-label="减少透明度" @click="reduceTransparency = !reduceTransparency"><span /></button></ForgeCard>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少动效</strong><p>关闭非必要的位移和过渡；系统偏好也会自动生效。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceMotion" aria-label="减少动效" @click="reduceMotion = !reduceMotion"><span /></button></ForgeCard>
      <ForgeCard tone="reading" class="utility-card"><div><strong>窗口与后台运行</strong><p>有活跃工作时，关闭窗口会让你选择取消、留在托盘或安全停止并退出。托盘模式需要当前电脑与用户会话保持唤醒；电脑睡眠或真正退出后，Forge 不能保证任务继续运行。</p></div></ForgeCard>
      <ForgeCard tone="reading" class="utility-card diagnostics-settings">
        <div><strong>本机设备配对</strong><p>一次性配对需手机通过私网 HTTPS 领取，再由本机确认项目范围。远程会话及手机连接尚未启用；当前操作只用于检查本机配对生命周期，不会开放网络端口。</p></div>
        <ForgeButton variant="secondary" :disabled="!client.canPairLocalDevice || hostStatus.state !== 'connected' || !activeProject || pairingBusy" @click="issueLocalPairing">创建一次性配对</ForgeButton>
        <template v-if="localPairing">
          <p>配对 ID：<code>{{ localPairing.pairingId }}</code> · 到期：{{ localPairing.expiresAt }}</p>
          <details><summary>查看临时 nonce（录屏前请收起）</summary><code>{{ localPairing.nonce }}</code><p>仅一次性 claim 使用；请勿当作长期设备令牌。当前没有可扫描的 HTTPS 配对地址。</p></details>
          <ForgeButton variant="secondary" :disabled="pairingBusy" @click="inspectLocalPairing">检查状态</ForgeButton>
          <p v-if="pairingStatus">状态：{{ pairingStatus.status }}<template v-if="pairingStatus.deviceName"> · {{ pairingStatus.deviceName }} · {{ pairingStatus.addressSummary }} · 设备自报指纹 {{ pairingStatus.fingerprintSummary }}</template></p>
          <div v-if="pairingStatus?.status === 'claimed' && activeProject" class="diagnostics-actions">
            <ForgeButton variant="primary" :disabled="pairingBusy" @click="decideLocalPairing(true)">批准访问 {{ activeProject.name }}</ForgeButton>
            <ForgeButton variant="secondary" :disabled="pairingBusy" @click="decideLocalPairing(false)">拒绝设备</ForgeButton>
          </div>
        </template>
        <p v-if="pairingMessage" role="status">{{ pairingMessage }}</p>
      </ForgeCard>
      <ForgeCard tone="reading" class="utility-card diagnostics-settings"><div><strong>诊断与数据保留</strong><p>预览只包含版本、状态和数量；不包含项目路径、源码、原始日志或凭据。导入 Artifact 保留 30 天，过期内容只在确认后清理，并留下墓碑。</p></div>
        <p>Usage 汇总：当前不可用。不会以 0 代替未知用量。</p>
        <ForgeButton variant="secondary" :disabled="!client.canManageDiagnostics || hostStatus.state !== 'connected' || diagnosticsBusy" @click="prepareDiagnostics">生成诊断预览</ForgeButton>
        <p v-if="!client.canManageDiagnostics">诊断导出需要 Forge Desktop。</p>
        <template v-if="diagnosticsPreview">
          <p>下面是将写入导出文件的完整内容：</p>
          <pre class="diagnostics-preview" tabindex="0">{{ JSON.stringify(diagnosticsPreview, null, 2) }}</pre>
          <div class="diagnostics-actions"><ForgeButton variant="secondary" :disabled="diagnosticsBusy" @click="exportDiagnostics">导出所示诊断包</ForgeButton><ForgeButton variant="danger" :disabled="diagnosticsBusy || diagnosticsPreview.retention.expiredImportedArtifacts === 0" @click="cleanupExpiredArtifacts">清理到期 Artifact</ForgeButton></div>
        </template>
        <p v-if="diagnosticsMessage" role="status">{{ diagnosticsMessage }}</p>
      </ForgeCard>
      <ForgeButton variant="secondary" @click="navigate('home')">返回工作台</ForgeButton>
    </section>
  </AppShell>
</template>
