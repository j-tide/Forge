<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { ForgeClient } from '@forge/client';
import { desktopDependenciesSchema, forgeProjectSchema, pythonHostSnapshotSchema,
  type DesktopDependencies, type ForgeProject, type DiagnosticsPreview,
  type HostConnectionSnapshot, type PythonHostSnapshot, type PairingIssued,
  type PairingInspection, pairingIssuedSchema, pairingInspectionSchema,
  pairingDecisionResultSchema, type RemoteOperationScope,
  type RemoteLoopbackState } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeCommandPanelShell, ForgeSelect, ForgeTextarea } from '@forge/ui';
import AppShell from './components/AppShell.vue';
import ProjectsView from './components/ProjectsView.vue';
import ConversationPanel from './components/ConversationPanel.vue';
import BoardView from './components/BoardView.vue';
import PluginsView from './components/PluginsView.vue';
import AgentsView from './components/AgentsView.vue';
import WorkflowsView from './components/WorkflowsView.vue';
import KnowledgeView from './components/KnowledgeView.vue';
import RemoteDevicesView from './components/RemoteDevicesView.vue';
import MobileApp from './mobile/MobileApp.vue';
import { detectRuntime } from './runtime';
import { appearanceStorage, readAppearance, writeAppearance } from './appearance-preferences';
import type { ForgeView } from './views';

const runtime = detectRuntime();
const client = new ForgeClient(typeof window === 'undefined' ? undefined : window.forge);
const hostStatus = ref<HostConnectionSnapshot>(client.status);
const historicalReadOnly = computed(() => hostStatus.value.health?.storage.readOnly === true);
const pythonHostStatus = ref<PythonHostSnapshot | null>(null);
const hostRestartBusy = ref(false);
const hostRestartError = ref('');
const activeProject = ref<ForgeProject | null>(null);
const view = ref<ForgeView>(typeof location !== 'undefined' && location.hash.startsWith('#/tasks/') ?
  'board' : 'home');
const boardRefreshKey = ref(0);
const idea = ref('');
const appearance = readAppearance(appearanceStorage());
const reduceTransparency = ref(appearance.reduceTransparency);
const reduceMotion = ref(appearance.reduceMotion);
const themeChoice = ref<string>(appearance.theme);
watch([themeChoice, reduceTransparency, reduceMotion], ([theme, transparency, motion]) => {
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
  writeAppearance(appearanceStorage(), {
    theme, reduceTransparency: transparency, reduceMotion: motion,
  });
});
const diagnosticsPreview = ref<DiagnosticsPreview | null>(null);
const diagnosticsMessage = ref('');
const diagnosticsBusy = ref(false);
const backupBusy = ref(false);
const backupMessage = ref('');
const restoreBusy = ref(false);
const restoreMessage = ref('');
const restoredProfileId = ref<string | null>(null);
const restoreAvailable = ref(false);
const dependencies = ref<DesktopDependencies | null>(null);
const dependenciesBusy = ref(false);
const dependenciesError = ref('');
const localPairing = ref<PairingIssued | null>(null);
const pairingStatus = ref<PairingInspection | null>(null);
const pairingBusy = ref(false);
const pairingMessage = ref('');
const requestedPairingScopes = ref<RemoteOperationScope[]>([]);
const localLoopback = ref<RemoteLoopbackState | null>(null);
const loopbackBusy = ref(false);
const loopbackMessage = ref('');
const systemDark = ref(false);
const mobileViewport = ref(false);
const mobileRoute = ref(typeof location !== 'undefined' &&
  (location.hash === '#/m' || location.hash.startsWith('#/m/')));
const showMobile = computed(() => runtime.kind === 'web' &&
  (mobileViewport.value || mobileRoute.value));
const activeTheme = computed(() => themeChoice.value === 'dark' ||
  (themeChoice.value === 'system' && systemDark.value) ? 'dark' : 'light');
const showUiShowcase = ref(import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#/dev/ui');
const UiShowcase = import.meta.env.DEV ? defineAsyncComponent(() => import('./showcase/UiShowcase.vue')) : null;
let unsubscribeStatus: (() => void) | null = null;
let unsubscribePythonStatus: (() => void) | null = null;
let loadedHostId: string | null = null;
let colorQuery: MediaQueryList | null = null;
let mobileQuery: MediaQueryList | null = null;
function updateSystemTheme(event: MediaQueryListEvent): void { systemDark.value = event.matches; }
function updateMobileViewport(event: MediaQueryListEvent): void { mobileViewport.value = event.matches; }
function updateMobileRoute(): void {
  mobileRoute.value = location.hash === '#/m' || location.hash.startsWith('#/m/');
}
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
    mobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-height: 500px)');
    mobileViewport.value = mobileQuery.matches;
    mobileQuery.addEventListener('change', updateMobileViewport);
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
  window.addEventListener('hashchange', updateMobileRoute);
  unsubscribeStatus = client.subscribe((snapshot) => {
    hostStatus.value = snapshot;
    if (snapshot.state !== 'connected') localLoopback.value = null;
    void loadActive();
  });
  await client.connect();
  await client.health();
  await loadActive();
  if (client.canRestoreDatabaseBackup) void inspectDatabaseProfile();
  if (client.canControlLocalLoopback) void inspectLocalLoopback();
});
onUnmounted(() => { colorQuery?.removeEventListener('change', updateSystemTheme);
  mobileQuery?.removeEventListener('change', updateMobileViewport);
  window.removeEventListener('hashchange', updateShowcase); unsubscribeStatus?.();
  window.removeEventListener('hashchange', updateMobileRoute);
  unsubscribePythonStatus?.(); client.disconnect(); });
async function refreshHealth(): Promise<void> { await client.health(); }
async function restartHost(): Promise<void> {
  hostRestartBusy.value = true;
  hostRestartError.value = '';
  try {
    const status = await client.restartHost();
    if (status.state !== 'connected' && status.state !== 'degraded') {
      hostRestartError.value = 'Host 重启未成功；请查看诊断。';
      return;
    }
    await client.connect();
    await loadActive();
  } catch (error) {
    hostRestartError.value = error instanceof Error && error.message.includes('HOST_RESTART_CANCELLED')
      ? '已取消重启。' : 'Host 重启未成功；请查看诊断。';
  } finally { hostRestartBusy.value = false; }
}
function navigate(next: ForgeView): void {
  view.value = next;
  if (next === 'settings' && client.canControlLocalLoopback) void inspectLocalLoopback();
  if (next === 'settings') void inspectDependencies();
  if (next === 'settings' && client.canRestoreDatabaseBackup) void inspectDatabaseProfile();
}
async function inspectDatabaseProfile(): Promise<void> {
  try { const status = await client.databaseProfileStatus();
    restoredProfileId.value = status.profileId; restoreAvailable.value = status.available; }
  catch { restoreMessage.value = '无法读取当前数据集状态；恢复操作暂不可用。'; }
}
async function inspectDependencies(): Promise<void> {
  dependencies.value = null;
  dependenciesError.value = '';
  if (runtime.kind !== 'desktop' || hostStatus.value.state !== 'connected') return;
  dependenciesBusy.value = true;
  try {
    const result = await client.invoke('system.dependencies');
    if (!result.ok) throw new Error(result.error.code);
    dependencies.value = desktopDependenciesSchema.parse(result.data);
  } catch {
    dependenciesError.value = '依赖检测失败；请检查 Host 状态后重试。';
  } finally { dependenciesBusy.value = false; }
}
async function inspectLocalLoopback(): Promise<void> {
  try { localLoopback.value = await client.remoteLoopback('inspect'); }
  catch { localLoopback.value = null; }
}
async function changeLocalLoopback(action: 'start' | 'stop'): Promise<void> {
  loopbackBusy.value = true; loopbackMessage.value = '';
  try {
    localLoopback.value = await client.remoteLoopback(action);
    loopbackMessage.value = action === 'start'
      ? '本机浏览器预览已开启；仍仅监听这台 Mac 的 127.0.0.1，手机无法连接。'
      : '本机浏览器预览已关闭；已配对设备的授权记录未自动删除。';
  } catch { loopbackMessage.value = action === 'start'
    ? '本机预览未开启。请检查 Host、构建资源或本机确认。'
    : '关闭预览失败；请检查 Host 状态。'; }
  finally { loopbackBusy.value = false; }
}
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
async function exportDatabaseBackup(): Promise<void> {
  backupBusy.value = true;
  backupMessage.value = '';
  try {
    const result = await client.exportDatabaseBackup();
    backupMessage.value = result.saved
      ? `数据库备份已导出 · Schema ${result.schemaVersion} · ${result.sizeBytes} bytes · SHA-256 ${result.sha256}`
      : '已取消导出；没有写入目标文件。';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    backupMessage.value = message.includes('RUN_CONFLICT')
      ? '仍有工作运行；请等待完成或安全停止后重试备份。'
      : message.includes('EEXIST') ? '目标文件已存在；请选择新的备份文件名。'
        : '数据库备份失败；未确认导出完成。请检查 Host、磁盘空间与目标权限。';
  } finally { backupBusy.value = false; }
}
async function restoreDatabaseBackup(): Promise<void> {
  restoreBusy.value = true; restoreMessage.value = '';
  try {
    const result = await client.restoreDatabaseBackup();
    restoredProfileId.value = result.profileId;
    restoreMessage.value = result.switched
      ? `已切换到独立恢复数据集 · Schema ${result.schemaVersion}。原数据集已保留。`
      : '已取消；当前数据集未切换。';
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    restoreMessage.value = code.includes('RUN_RECOVERY_REQUIRED')
      ? '当前数据集仍有中断的开发、审查或验证记录，需要先安全对账；数据未切换，也不会自动清理旧进程。'
      : code.includes('RUN_CONFLICT') || code.includes('RESTORE_REQUESTS_IN_FLIGHT')
      ? '仍有工作或请求未结束；请等待完成或安全停止后再恢复。'
      : code.includes('RESTORE_SOURCE_') || code.includes('RESTORE_SCHEMA_')
        ? '备份无效、仍有 WAL 或版本不兼容；当前数据未切换。'
        : '恢复未完成；原数据集保持不变。请查看 Host 状态与诊断。';
  } finally { restoreBusy.value = false; }
}
async function returnToOriginalData(): Promise<void> {
  restoreBusy.value = true; restoreMessage.value = '';
  try {
    const result = await client.returnToOriginalData();
    restoredProfileId.value = result.profileId;
    restoreMessage.value = result.switched
      ? '已回到原数据集；恢复数据集仍保留。' : '已取消；当前数据集未切换。';
  } catch (error) {
    restoreMessage.value = error instanceof Error && error.message.includes('RUN_RECOVERY_REQUIRED')
      ? '恢复数据集中有中断作业或旧进程记录；请保留当前数据与诊断，确认安全前不能切换。'
      : error instanceof Error &&
      (error.message.includes('RUN_CONFLICT') || error.message.includes('RESTORE_REQUESTS_IN_FLIGHT'))
      ? '仍有工作或请求未结束；请等待完成或安全停止后再切换。'
      : '切换未完成；请检查 Host 状态与诊断。';
  } finally { restoreBusy.value = false; }
}
async function issueLocalPairing(): Promise<void> {
  pairingBusy.value = true; pairingMessage.value = '';
  try {
    localPairing.value = pairingIssuedSchema.parse(await client.devicePairing({
      type: 'issue', payload: {},
    }));
    pairingStatus.value = null;
    requestedPairingScopes.value = [];
    pairingMessage.value = localLoopback.value?.running
      ? '一次性配对已创建。可在本机浏览器预览输入 nonce；手机私网 HTTPS 入口尚未启用。'
      : '一次性配对已创建。当前没有可用的手机会话或 HTTPS 配对入口。';
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
        approve, projectIds: approve ? [activeProject.value.projectId] : [],
        scopes: approve ? [...requestedPairingScopes.value] : [] },
    }));
    const confirmation = result.status === 'approved'
      ? `设备已获本项目 ${result.scopes.length ? result.scopes.join('、') : '只读'} 范围批准；${localLoopback.value?.running ? '仅本机浏览器预览可用，手机 HTTPS 仍未启用。' : 'Desktop 尚未启动远程网关。'}`
      : '已拒绝此设备。';
    await inspectLocalPairing();
    pairingMessage.value = confirmation;
  } catch { pairingMessage.value = '未更改设备授权；请重新检查状态。'; }
  finally { pairingBusy.value = false; }
}
</script>

<template>
  <MobileApp v-if="showMobile" :theme="activeTheme" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" />
  <AppShell v-else :view="view" :runtime-label="runtime.label" :web-runtime="runtime.kind === 'web'" :host-status="hostStatus" :python-host-status="pythonHostStatus" :can-restart-host="client.canRestartHost" :host-restart-busy="hostRestartBusy" :host-restart-error="hostRestartError" :project-name="activeProject?.name ?? null" :theme="activeTheme" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" @navigate="navigate" @refresh-health="refreshHealth" @restart-host="restartHost">
    <UiShowcase v-if="showUiShowcase && UiShowcase" />
    <div v-else-if="view === 'home' || view === 'board'" class="work-layout" :class="{ 'work-layout--board': view === 'board' }">
      <ForgeCommandPanelShell v-if="view === 'home'" aria-labelledby="compose-title">
        <div class="compose-intro">
          <p class="eyebrow">FORGE / NEW WORK</p>
          <h1 id="compose-title">What do you want to build?</h1>
          <p class="compose-description">在已信任项目中保存想法，整理并编辑任务草稿；人工批准后才进入 TODO。</p>
        </div>
        <ConversationPanel v-if="activeProject?.trusted && runtime.kind === 'desktop' && hostStatus.state === 'connected' && !historicalReadOnly"
          :client="client" :project-id="activeProject.projectId" @approval-changed="boardRefreshKey += 1" />
        <div v-else-if="historicalReadOnly" class="compose-bottom" role="status">
          <p>这是历史只读数据集。消息、草稿和审批记录仍可在任务详情中查看；此处不能新建任务。</p>
        </div>
        <div v-else class="compose-bottom">
          <div class="compose-divider" />
          <ForgeTextarea v-model="idea" label="描述你的想法" visually-hidden-label placeholder="例如：给订单列表添加日期筛选…" :max-height="240" :rows="5" disabled />
          <div class="compose-action"><span>{{ runtime.kind === 'web' ? '普通 Web 尚未连接远程 Host。' : activeProject && !activeProject.trusted ? '恢复的项目须在本机重新选择、探测并确认信任，才能继续执行。' : '先选择并信任本地项目。' }}</span><ForgeButton v-if="runtime.kind === 'desktop'" variant="primary" @click="navigate('projects')">{{ activeProject && !activeProject.trusted ? '重新确认项目' : '选择项目' }}</ForgeButton></div>
          <p class="availability-note">{{ runtime.kind === 'web' ? '本地项目选择只在 Forge Desktop 中提供。' : '信任项目不会自动运行脚本或启动 Agent。' }}</p>
        </div>
      </ForgeCommandPanelShell>
      <section class="board-pane" aria-labelledby="board-title">
        <ForgeCard tone="reading" class="project-summary"><span class="summary-symbol" aria-hidden="true">⌁</span><div><strong>当前项目</strong><p>{{ activeProject ? `${activeProject.name} · ${activeProject.probe.currentBranch ?? 'branch unknown'}` : '尚未选择项目目录' }}</p><p v-if="activeProject && !activeProject.trusted" role="alert">恢复数据中的项目需重新信任；暂不能启动代码或运行项目命令。</p></div><ForgeButton variant="ghost" @click="navigate('projects')">{{ activeProject ? '切换项目' : '选择项目' }} <span aria-hidden="true">↗</span></ForgeButton></ForgeCard>
        <BoardView :client="client" :project-id="activeProject?.projectId ?? null"
          :connected="hostStatus.state === 'connected' && runtime.kind === 'desktop'"
          :read-only="historicalReadOnly"
          :refresh-key="boardRefreshKey" @choose-project="navigate('projects')" />
      </section>
    </div>
    <ProjectsView v-else-if="view === 'projects'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" :active-project="activeProject" @activated="activeProject = $event" @home="navigate('home')" />
    <PluginsView v-else-if="view === 'plugins'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" />
    <AgentsView v-else-if="view === 'agents'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" />
    <WorkflowsView v-else-if="view === 'workflows'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" />
    <KnowledgeView v-else-if="view === 'knowledge'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" :project-id="activeProject?.projectId ?? null" :environment-id="activeProject?.environmentId ?? null" />
    <section v-else-if="view === 'settings'" class="utility-view" aria-labelledby="settings-title">
      <p class="eyebrow">FORGE / SETTINGS</p><h1 id="settings-title">设置</h1><p class="utility-intro">先检查桌面外观、本机依赖、诊断与数据；本机浏览器预览和设备管理列在页面末尾，默认不开放远程访问。</p>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>主题</strong><p>浅色银雾或低亮度蓝灰阅读面。</p></div><ForgeSelect v-model="themeChoice" label="界面主题" :options="[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]" /></ForgeCard>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少透明度</strong><p>将雾面表面切换为更清晰的实色阅读面。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceTransparency" aria-label="减少透明度" @click="reduceTransparency = !reduceTransparency"><span /></button></ForgeCard>
      <ForgeCard tone="reading" class="utility-card settings-card"><div><strong>减少动效</strong><p>关闭非必要的位移和过渡；系统偏好也会自动生效。</p></div><button class="switch" type="button" role="switch" :aria-checked="reduceMotion" aria-label="减少动效" @click="reduceMotion = !reduceMotion"><span /></button></ForgeCard>
      <ForgeCard tone="reading" class="utility-card"><div><strong>窗口与后台运行</strong><p>有活跃工作时，关闭窗口会让你选择取消、留在托盘或安全停止并退出。托盘模式需要当前电脑与用户会话保持唤醒；电脑睡眠或真正退出后，Forge 不能保证任务继续运行。</p></div></ForgeCard>
      <ForgeCard tone="reading" class="utility-card diagnostics-settings" data-testid="desktop-dependencies">
        <div><strong>本机依赖</strong><p>从当前 Forge Host 的实际启动环境检测；不会读取项目脚本，也不会显示凭据或代理地址。</p></div>
        <p v-if="runtime.kind !== 'desktop'">本机依赖检测需要 Forge Desktop。</p>
        <p v-else-if="hostStatus.state !== 'connected'">Host 未连接，暂不能检测依赖。</p>
        <p v-else-if="dependenciesBusy" role="status">正在检查 Git 与 Codex CLI…</p>
        <dl v-else-if="dependencies" class="dependency-list">
          <div><dt>Python Host</dt><dd>可用 · {{ dependencies.python.version }}</dd></div>
          <div><dt>Git</dt><dd>{{ dependencies.git.status === 'available' ? `可用 · ${dependencies.git.version}` : dependencies.git.status === 'missing' ? '未找到' : '无法验证' }}</dd></div>
          <div><dt>Codex CLI</dt><dd>{{ dependencies.codex.status === 'authenticated' ? `版本与登录已检测 · ${dependencies.codex.version}` : dependencies.codex.status === 'missing' ? '未找到' : dependencies.codex.status === 'version_mismatch' ? `版本不匹配 · ${dependencies.codex.version}` : dependencies.codex.status === 'not_authenticated' ? '未登录' : '无法验证' }}</dd></div>
          <div><dt>代理</dt><dd>{{ dependencies.proxy.status === 'configured' ? 'Host 已接收安全代理配置' : 'Host 未配置代理' }}</dd></div>
        </dl>
        <p v-if="dependencies">Codex CLI 与登录检查不运行模型；可执行能力仍以 Agents / Plugins 页的真实探测为准。登录由 Codex CLI 在本机管理，Forge 不接收或保存 API Key。</p>
        <p v-if="dependencies?.codex.status === 'missing' || dependencies?.codex.status === 'version_mismatch' || dependencies?.codex.status === 'not_authenticated'">请在本机安装仓库锁定的 Codex CLI 版本并运行 <code>codex login</code>；然后重新打开 Forge，确认应用启动环境能找到 CLI。</p>
        <p v-if="dependenciesError" role="alert">{{ dependenciesError }}</p>
        <ForgeButton variant="secondary" :disabled="runtime.kind !== 'desktop' || hostStatus.state !== 'connected' || dependenciesBusy" @click="inspectDependencies">重新检测</ForgeButton>
      </ForgeCard>
      <ForgeCard tone="reading" class="utility-card diagnostics-settings"><div><strong>诊断与数据保留</strong><p>预览只包含版本、状态和数量；不包含项目路径、源码、原始日志或凭据。导入 Artifact 保留 30 天，过期内容只在确认后清理，并留下墓碑。</p></div>
        <p>Usage 汇总：当前不可用。不会以 0 代替未知用量。</p>
        <ForgeButton variant="secondary" :disabled="!client.canManageDiagnostics || hostStatus.state !== 'connected' || diagnosticsBusy" @click="prepareDiagnostics">生成诊断预览</ForgeButton>
        <p v-if="!client.canManageDiagnostics">诊断导出需要 Forge Desktop。</p>
        <template v-if="diagnosticsPreview">
          <p>下面是将写入导出文件的完整内容：</p>
          <pre class="diagnostics-preview" tabindex="0">{{ JSON.stringify(diagnosticsPreview, null, 2) }}</pre>
          <div class="diagnostics-actions"><ForgeButton variant="secondary" :disabled="diagnosticsBusy" @click="exportDiagnostics">导出所示诊断包</ForgeButton><ForgeButton variant="danger" :disabled="historicalReadOnly || diagnosticsBusy || diagnosticsPreview.retention.expiredImportedArtifacts === 0" @click="cleanupExpiredArtifacts">清理到期 Artifact</ForgeButton></div>
        </template>
        <p v-if="diagnosticsMessage" role="status">{{ diagnosticsMessage }}</p>
      </ForgeCard>
      <ForgeCard tone="reading" class="utility-card diagnostics-settings" data-testid="database-backup">
        <div><strong>备份与独立恢复数据集</strong><p>从 Python Host 的已提交 SQLite 数据生成一致快照。恢复时先在独立数据集校验与升级，再停止空闲 Host、切换并重启；原数据集保留，可返回。恢复项目须在本机重新探测和信任，旧设备会话失效。SQLite 备份可能含项目路径、消息和任务记录，应保存在私人位置。它不包含项目源码、隔离工作区、导入 Artifact 文件或外部 Codex 凭据；这些历史证据可能在恢复数据集中不可用。</p></div>
        <ForgeButton variant="secondary" :loading="backupBusy" :disabled="historicalReadOnly || !client.canExportDatabaseBackup || hostStatus.state !== 'connected' || backupBusy" @click="exportDatabaseBackup">选择位置并导出数据库备份</ForgeButton>
        <p v-if="!client.canExportDatabaseBackup">数据库备份导出需要 Forge Desktop。</p>
        <p v-if="backupMessage" role="status">{{ backupMessage }}</p>
        <p v-if="client.canRestoreDatabaseBackup">当前数据集：{{ restoredProfileId ? `恢复副本 ${restoredProfileId.slice(0, 8)}` : '原数据集' }}。恢复只切换 Forge 数据，不删除用户项目或原数据库。</p>
        <p v-if="client.canRestoreDatabaseBackup && !restoreAvailable">恢复入口只在已安装的内部 Desktop 中启用；开发运行不切换生产数据。</p>
        <div class="diagnostics-actions">
          <ForgeButton variant="secondary" :loading="restoreBusy" :disabled="historicalReadOnly || !restoreAvailable || hostStatus.state !== 'connected' || restoreBusy" @click="restoreDatabaseBackup">选择备份并恢复到独立数据集</ForgeButton>
          <ForgeButton v-if="restoredProfileId" variant="secondary" :loading="restoreBusy" :disabled="historicalReadOnly || !restoreAvailable || hostStatus.state !== 'connected' || restoreBusy" @click="returnToOriginalData">返回原数据集</ForgeButton>
        </div>
        <p v-if="restoreMessage" role="status">{{ restoreMessage }}</p>
      </ForgeCard>
      <h2 v-if="!historicalReadOnly" class="settings-section-title">本机预览与设备（后置能力）</h2>
      <ForgeCard v-if="!historicalReadOnly" tone="reading" class="utility-card diagnostics-settings">
        <div><strong>本机浏览器预览与设备配对</strong><p>只有你明确开启后，Python Host 才在 127.0.0.1 提供手机布局预览。它与 Desktop 使用同一 Host 和项目数据，但不能从手机或私网访问；手机 HTTPS 入口仍未启用。设备还必须单独领取一次性 nonce，并由你确认项目与权限。</p></div>
        <div class="diagnostics-actions">
          <ForgeButton variant="secondary" :disabled="!client.canControlLocalLoopback || hostStatus.state !== 'connected' || loopbackBusy || localLoopback?.running === true" @click="changeLocalLoopback('start')">开启本机浏览器预览</ForgeButton>
          <ForgeButton variant="ghost" :disabled="!client.canControlLocalLoopback || !localLoopback?.running || loopbackBusy" @click="changeLocalLoopback('stop')">关闭本机浏览器预览</ForgeButton>
        </div>
        <p v-if="localLoopback?.running && localLoopback.origin">仅在这台 Mac 的浏览器打开：<code>{{ localLoopback.origin }}</code> · Host {{ localLoopback.hostId }}</p>
        <p v-if="loopbackMessage" role="status">{{ loopbackMessage }}</p>
        <ForgeButton variant="secondary" :disabled="!client.canPairLocalDevice || hostStatus.state !== 'connected' || !activeProject || pairingBusy" @click="issueLocalPairing">创建一次性配对</ForgeButton>
        <template v-if="localPairing">
          <p>配对 ID：<code>{{ localPairing.pairingId }}</code> · 到期：{{ localPairing.expiresAt }}</p>
          <details><summary>查看临时 nonce（录屏前请收起）</summary><code>{{ localPairing.nonce }}</code><p>仅一次性 claim 使用；请勿当作长期设备令牌。本机预览地址不能用作手机 HTTPS 配对地址。</p></details>
          <ForgeButton variant="secondary" :disabled="pairingBusy" @click="inspectLocalPairing">检查状态</ForgeButton>
          <p v-if="pairingStatus">状态：{{ pairingStatus.status }}<template v-if="pairingStatus.deviceName"> · {{ pairingStatus.deviceName }} · {{ pairingStatus.addressSummary }} · 设备自报指纹 {{ pairingStatus.fingerprintSummary }}</template></p>
          <div v-if="pairingStatus?.status === 'claimed' && activeProject" class="diagnostics-actions">
            <fieldset class="pairing-scope-choices" :disabled="pairingBusy">
              <legend>本次设备授权（默认只读）</legend>
              <label><input v-model="requestedPairingScopes" type="checkbox" value="task:draft" />允许保存消息；不自动调用模型或生成任务</label>
              <label><input v-model="requestedPairingScopes" type="checkbox" value="task:approve" />允许批准当前任务草稿进入 TODO；仍须逐次审阅确认</label>
              <p>其余 Run、人工验收与危险操作尚未开放；勾选不会启动远程网关或绕过单次审批。</p>
            </fieldset>
            <ForgeButton variant="primary" :disabled="pairingBusy" @click="decideLocalPairing(true)">批准访问 {{ activeProject.name }}</ForgeButton>
            <ForgeButton variant="secondary" :disabled="pairingBusy" @click="decideLocalPairing(false)">拒绝设备</ForgeButton>
          </div>
        </template>
        <p v-if="pairingMessage" role="status">{{ pairingMessage }}</p>
      </ForgeCard>
      <RemoteDevicesView v-if="!historicalReadOnly" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :project-id="activeProject?.projectId ?? null" :loopback="localLoopback" />
      <ForgeButton variant="secondary" @click="navigate('home')">返回工作台</ForgeButton>
    </section>
  </AppShell>
</template>
