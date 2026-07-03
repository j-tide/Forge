<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { ForgeClient } from '@forge/client';
import { desktopDependenciesSchema, forgeProjectSchema, pythonHostSnapshotSchema,
  type DesktopDependencies, type ForgeProject, type DiagnosticsPreview,
  type HostConnectionSnapshot, type PythonHostSnapshot, type PairingIssued,
  type PairingInspection, pairingIssuedSchema, pairingInspectionSchema,
  pairingDecisionResultSchema, type RemoteOperationScope,
  type RemoteLoopbackState } from '@forge/contracts';
import { ForgeButton, ForgeDialog, ForgeDrawer, ForgeSelect } from '@forge/ui';
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
const projectPickerOpen = ref(false);
const newWorkOpen = ref(false);
const newWorkAfterProject = ref(false);
watch(projectPickerOpen, (open) => { if (!open) newWorkAfterProject.value = false; });
function chooseProject(): void { projectPickerOpen.value = true; }
function activatePickedProject(project: ForgeProject | null): void {
  activeProject.value = project;
  projectPickerOpen.value = false;
  if (project?.trusted && newWorkAfterProject.value) newWorkOpen.value = true;
  newWorkAfterProject.value = false;
}
function beginNewWork(): void {
  if (!activeProject.value?.trusted && runtime.kind === 'desktop') {
    newWorkAfterProject.value = true;
    chooseProject();
    return;
  }
  newWorkOpen.value = true;
}
function cancelProjectPicker(): void {
  projectPickerOpen.value = false;
  newWorkAfterProject.value = false;
}
const view = ref<ForgeView>('board');
const boardRefreshKey = ref(0);
const appearance = readAppearance(appearanceStorage());
const reduceTransparency = ref(appearance.reduceTransparency);
const reduceMotion = ref(appearance.reduceMotion);
const themeChoice = ref<string>(appearance.theme);
const settingsCategory = ref<'appearance' | 'environment' | 'data' | 'access'>('appearance');
watch(historicalReadOnly, (readOnly) => {
  if (readOnly && settingsCategory.value === 'access') settingsCategory.value = 'appearance';
});
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
const systemDark = ref(typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches);
const mobileViewport = ref(false);
const mobileRoute = ref(typeof location !== 'undefined' &&
  (location.hash === '#/m' || location.hash.startsWith('#/m/')));
const showMobile = computed(() => runtime.kind === 'web' &&
  (mobileViewport.value || mobileRoute.value));
const activeTheme = computed(() => themeChoice.value === 'dark' ||
  (themeChoice.value === 'system' && systemDark.value) ? 'dark' : 'light');
watch([activeTheme, reduceTransparency, reduceMotion], ([theme, transparency, motion]) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reduceTransparency = String(transparency);
  document.documentElement.dataset.reduceMotion = String(motion);
}, { immediate: true });
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
  unsubscribePythonStatus?.(); client.disconnect();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-reduce-transparency');
  document.documentElement.removeAttribute('data-reduce-motion'); });
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
  view.value = next === 'home' ? 'board' : next;
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
  <AppShell v-else :view="view" :runtime-label="runtime.label" :web-runtime="runtime.kind === 'web'" :host-status="hostStatus" :python-host-status="pythonHostStatus" :can-restart-host="client.canRestartHost" :host-restart-busy="hostRestartBusy" :host-restart-error="hostRestartError" :project-name="activeProject?.name ?? null" :theme="activeTheme" :reduce-transparency="reduceTransparency" :reduce-motion="reduceMotion" @navigate="navigate" @choose-project="chooseProject" @new-task="beginNewWork" @refresh-health="refreshHealth" @restart-host="restartHost">
    <UiShowcase v-if="showUiShowcase && UiShowcase" />
    <div v-else-if="view === 'home' || view === 'board'" class="work-layout work-layout--board">
      <section class="board-pane" aria-labelledby="board-title">
        <p v-if="activeProject && !activeProject.trusted" class="project-trust-notice" role="alert">此项目需要重新确认信任，才能创建或运行任务。<ForgeButton variant="secondary" size="sm" @click="chooseProject">重新确认</ForgeButton></p>
        <BoardView :client="client" :project-id="activeProject?.projectId ?? null"
          :connected="hostStatus.state === 'connected' && runtime.kind === 'desktop'"
          :read-only="historicalReadOnly"
          :refresh-key="boardRefreshKey" @choose-project="chooseProject" @new-task="beginNewWork" />
      </section>
    </div>
    <ProjectsView v-else-if="view === 'projects'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" :active-project="activeProject" @activated="activeProject = $event" @home="navigate('board')" />
    <PluginsView v-else-if="view === 'plugins'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" @open-settings="navigate('settings')" />
    <AgentsView v-else-if="view === 'agents'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" />
    <WorkflowsView v-else-if="view === 'workflows'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" />
    <KnowledgeView v-else-if="view === 'knowledge'" :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly" :project-id="activeProject?.projectId ?? null" :environment-id="activeProject?.environmentId ?? null" />
    <section v-else-if="view === 'settings'" class="utility-view settings-view" aria-labelledby="settings-title">
      <header class="settings-heading">
        <p class="eyebrow">FORGE / PREFERENCES</p>
        <h1 id="settings-title">设置</h1>
        <p>管理桌面外观、本机环境、数据与访问。</p>
      </header>
      <div class="settings-workspace">
        <nav class="settings-navigation" aria-label="设置分类">
          <button type="button" :aria-current="settingsCategory === 'appearance' ? 'page' : undefined"
            aria-controls="settings-panel-appearance" @click="settingsCategory = 'appearance'">外观<span>主题与辅助显示</span></button>
          <button type="button" :aria-current="settingsCategory === 'environment' ? 'page' : undefined"
            aria-controls="settings-panel-environment" @click="settingsCategory = 'environment'">运行环境<span>Host 与本机依赖</span></button>
          <button type="button" :aria-current="settingsCategory === 'data' ? 'page' : undefined"
            aria-controls="settings-panel-data" @click="settingsCategory = 'data'">数据与诊断<span>备份、恢复与保留</span></button>
          <button v-if="!historicalReadOnly" type="button" :aria-current="settingsCategory === 'access' ? 'page' : undefined"
            aria-controls="settings-panel-access" @click="settingsCategory = 'access'">本机访问<span>浏览器预览与设备</span></button>
        </nav>
        <div class="settings-main">
          <section v-show="settingsCategory === 'appearance'" id="settings-panel-appearance" class="settings-panel" aria-labelledby="settings-appearance-title">
            <div class="settings-panel-heading"><h2 id="settings-appearance-title">外观</h2><p>这些偏好保存在当前设备。</p></div>
            <div class="settings-row settings-card">
              <div><strong>界面主题</strong><p>跟随系统，或固定为浅色、深色。</p></div>
              <ForgeSelect v-model="themeChoice" label="界面主题" :options="[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]" />
            </div>
            <div class="settings-row">
              <div><strong>减少透明度</strong><p>使用更清晰的实色表面。</p></div>
              <button class="switch" type="button" role="switch" :aria-checked="reduceTransparency" aria-label="减少透明度" @click="reduceTransparency = !reduceTransparency"><span /></button>
            </div>
            <div class="settings-row">
              <div><strong>减少动效</strong><p>关闭非必要过渡；系统偏好仍会生效。</p></div>
              <button class="switch" type="button" role="switch" :aria-checked="reduceMotion" aria-label="减少动效" @click="reduceMotion = !reduceMotion"><span /></button>
            </div>
            <details class="settings-disclosure">
              <summary>窗口与后台运行</summary>
              <p>有活跃工作时，关闭窗口会让你选择取消、留在托盘或安全停止并退出。托盘模式需要电脑与用户会话保持唤醒；电脑睡眠或退出后，Forge 不能保证任务继续运行。</p>
            </details>
          </section>

          <section v-show="settingsCategory === 'environment'" id="settings-panel-environment" class="settings-panel" aria-labelledby="settings-environment-title">
            <div class="settings-panel-heading"><h2 id="settings-environment-title">运行环境</h2><p>检测当前 Python Host 实际使用的本机依赖。</p></div>
            <section class="settings-group diagnostics-settings" data-testid="desktop-dependencies" aria-labelledby="settings-dependencies-title">
              <div class="settings-group-heading"><h3 id="settings-dependencies-title">本机依赖</h3>
                <ForgeButton variant="secondary" size="sm" :disabled="runtime.kind !== 'desktop' || hostStatus.state !== 'connected' || dependenciesBusy" @click="inspectDependencies">重新检测</ForgeButton>
              </div>
              <p v-if="runtime.kind !== 'desktop'" class="settings-status">本机依赖检测需要 Forge Desktop。</p>
              <p v-else-if="hostStatus.state !== 'connected'" class="settings-status">Host 未连接，暂不能检测依赖。</p>
              <p v-else-if="dependenciesBusy" class="settings-status" role="status">正在检查 Git 与 Codex CLI…</p>
              <dl v-else-if="dependencies" class="dependency-list">
                <div><dt>Python Host</dt><dd>可用 · {{ dependencies.python.version }}</dd></div>
                <div><dt>Git</dt><dd>{{ dependencies.git.status === 'available' ? '可用 · ' + dependencies.git.version : dependencies.git.status === 'missing' ? '未找到' : '无法验证' }}</dd></div>
                <div><dt>Codex CLI</dt><dd>{{ dependencies.codex.status === 'authenticated' ? '版本与登录已检测 · ' + dependencies.codex.version : dependencies.codex.status === 'missing' ? '未找到' : dependencies.codex.status === 'version_mismatch' ? '版本不匹配 · ' + dependencies.codex.version : dependencies.codex.status === 'not_authenticated' ? '未登录' : '无法验证' }}</dd></div>
                <div><dt>代理</dt><dd>{{ dependencies.proxy.status === 'configured' ? 'Host 已接收安全代理配置' : 'Host 未配置代理' }}</dd></div>
              </dl>
              <p v-if="dependencies?.codex.status === 'missing' || dependencies?.codex.status === 'version_mismatch' || dependencies?.codex.status === 'not_authenticated'" class="settings-status">请安装仓库锁定的 Codex CLI 版本并在本机运行 <code>codex login</code>，然后重开 Forge。</p>
              <p v-if="dependenciesError" role="alert" class="settings-status">{{ dependenciesError }}</p>
              <details class="settings-disclosure"><summary>检测范围与登录</summary><p>检测不读取项目脚本，也不显示凭据或代理地址。Codex CLI 与登录检查不运行模型；执行能力以角色和插件页的实际探测为准。登录由本机 Codex CLI 管理，Forge 不接收或保存 API Key。</p></details>
            </section>
          </section>

          <section v-show="settingsCategory === 'data'" id="settings-panel-data" class="settings-panel" aria-labelledby="settings-data-title">
            <div class="settings-panel-heading"><h2 id="settings-data-title">数据与诊断</h2><p>先查看预览，再导出或清理；备份与恢复使用本机文件。</p></div>
            <section class="settings-group diagnostics-settings" aria-labelledby="settings-diagnostics-title">
              <div class="settings-group-heading"><h3 id="settings-diagnostics-title">诊断与数据保留</h3>
                <ForgeButton variant="secondary" size="sm" :disabled="!client.canManageDiagnostics || hostStatus.state !== 'connected' || diagnosticsBusy" @click="prepareDiagnostics">生成诊断预览</ForgeButton>
              </div>
              <p class="settings-status">Usage 汇总：当前不可用。未知用量不会显示为 0。</p>
              <p v-if="!client.canManageDiagnostics" class="settings-status">诊断导出需要 Forge Desktop。</p>
              <template v-if="diagnosticsPreview">
                <p class="settings-status">下面是将写入导出文件的完整内容：</p>
                <pre class="diagnostics-preview" tabindex="0">{{ JSON.stringify(diagnosticsPreview, null, 2) }}</pre>
                <div class="diagnostics-actions"><ForgeButton variant="secondary" :disabled="diagnosticsBusy" @click="exportDiagnostics">导出所示诊断包</ForgeButton><ForgeButton variant="danger" :disabled="historicalReadOnly || diagnosticsBusy || diagnosticsPreview.retention.expiredImportedArtifacts === 0" @click="cleanupExpiredArtifacts">清理到期 Artifact</ForgeButton></div>
              </template>
              <p v-if="diagnosticsMessage" role="status" class="settings-status">{{ diagnosticsMessage }}</p>
              <details class="settings-disclosure"><summary>诊断内容与保留规则</summary><p>诊断预览只包含版本、状态和数量，不包含项目路径、源码、原始日志或凭据。导入 Artifact 保留 30 天；到期内容只在确认后清理，并留下墓碑。</p></details>
            </section>
            <section class="settings-group diagnostics-settings" data-testid="database-backup" aria-labelledby="settings-backup-title">
              <div class="settings-group-heading"><h3 id="settings-backup-title">数据库备份</h3>
                <ForgeButton variant="secondary" size="sm" :loading="backupBusy" :disabled="historicalReadOnly || !client.canExportDatabaseBackup || hostStatus.state !== 'connected' || backupBusy" @click="exportDatabaseBackup">选择位置并导出数据库备份</ForgeButton>
              </div>
              <p v-if="!client.canExportDatabaseBackup" class="settings-status">数据库备份导出需要 Forge Desktop。</p>
              <p v-if="backupMessage" role="status" class="settings-status">{{ backupMessage }}</p>
              <div class="settings-data-profile">
                <span>当前数据集</span><strong>{{ restoredProfileId ? '恢复副本 ' + restoredProfileId.slice(0, 8) : '原数据集' }}</strong>
              </div>
              <p v-if="client.canRestoreDatabaseBackup && !restoreAvailable" class="settings-status">恢复入口只在已安装的内部 Desktop 中启用；开发运行不切换生产数据。</p>
              <div class="diagnostics-actions">
                <ForgeButton variant="secondary" :loading="restoreBusy" :disabled="historicalReadOnly || !restoreAvailable || hostStatus.state !== 'connected' || restoreBusy" @click="restoreDatabaseBackup">选择备份并恢复到独立数据集</ForgeButton>
                <ForgeButton v-if="restoredProfileId" variant="secondary" :loading="restoreBusy" :disabled="historicalReadOnly || !restoreAvailable || hostStatus.state !== 'connected' || restoreBusy" @click="returnToOriginalData">返回原数据集</ForgeButton>
              </div>
              <p v-if="restoreMessage" role="status" class="settings-status">{{ restoreMessage }}</p>
              <details class="settings-disclosure"><summary>备份与恢复范围</summary><p>Python Host 从已提交的 SQLite 数据生成一致快照。恢复会先在独立数据集校验与升级，再停止空闲 Host、切换并重启；原数据集保留，可返回。恢复项目须重新探测和信任，旧设备会话失效。备份可能含项目路径、消息和任务记录，应保存在私人位置。备份不包含项目源码、隔离工作区、导入 Artifact 文件或外部 Codex 凭据；这些历史证据在恢复数据集中可能不可用。</p></details>
            </section>
          </section>

          <section v-if="!historicalReadOnly" v-show="settingsCategory === 'access'" id="settings-panel-access" class="settings-panel" aria-labelledby="settings-access-title">
            <div class="settings-panel-heading"><h2 id="settings-access-title">本机访问</h2><p>网络入口默认关闭；本机预览仅监听 127.0.0.1。</p></div>
            <section class="settings-group diagnostics-settings" aria-labelledby="settings-preview-title">
              <div class="settings-group-heading"><h3 id="settings-preview-title">浏览器预览</h3><span class="settings-state">{{ localLoopback?.running ? '已开启' : localLoopback ? '已关闭' : '状态未确认' }}</span></div>
              <div class="diagnostics-actions">
                <ForgeButton variant="secondary" :disabled="!client.canControlLocalLoopback || hostStatus.state !== 'connected' || loopbackBusy || localLoopback?.running === true" @click="changeLocalLoopback('start')">开启本机浏览器预览</ForgeButton>
                <ForgeButton variant="ghost" :disabled="!client.canControlLocalLoopback || !localLoopback?.running || loopbackBusy" @click="changeLocalLoopback('stop')">关闭本机浏览器预览</ForgeButton>
              </div>
              <p v-if="localLoopback?.running && localLoopback.origin" class="settings-status">仅在这台 Mac 的浏览器打开：<code>{{ localLoopback.origin }}</code> · Host {{ localLoopback.hostId }}</p>
              <p v-if="loopbackMessage" role="status" class="settings-status">{{ loopbackMessage }}</p>
              <details class="settings-disclosure"><summary>访问范围</summary><p>只有你明确开启后，Python Host 才提供本机手机布局预览。预览使用同一 Host 和项目数据，手机和私网不能访问；手机 HTTPS 入口仍未启用。</p></details>
            </section>
            <section class="settings-group diagnostics-settings" aria-labelledby="settings-pairing-title">
              <div class="settings-group-heading"><h3 id="settings-pairing-title">一次性设备配对</h3>
                <ForgeButton variant="secondary" size="sm" :disabled="!client.canPairLocalDevice || hostStatus.state !== 'connected' || !activeProject || pairingBusy" @click="issueLocalPairing">创建一次性配对</ForgeButton>
              </div>
              <p class="settings-status">设备须领取一次性 nonce，并由你确认项目与权限。创建配对不会开放手机 HTTPS 入口。</p>
              <template v-if="localPairing">
                <p class="settings-status">配对 ID：<code>{{ localPairing.pairingId }}</code> · 到期：{{ localPairing.expiresAt }}</p>
                <details class="settings-disclosure"><summary>查看临时 nonce（录屏前请收起）</summary><code>{{ localPairing.nonce }}</code><p>仅供一次性 claim 使用；不能当作长期设备令牌。本机预览地址不能用作手机 HTTPS 配对地址。</p></details>
                <ForgeButton variant="secondary" size="sm" :disabled="pairingBusy" @click="inspectLocalPairing">检查状态</ForgeButton>
                <p v-if="pairingStatus" class="settings-status">状态：{{ pairingStatus.status }}<template v-if="pairingStatus.deviceName"> · {{ pairingStatus.deviceName }} · {{ pairingStatus.addressSummary }} · 设备自报指纹 {{ pairingStatus.fingerprintSummary }}</template></p>
                <div v-if="pairingStatus?.status === 'claimed' && activeProject" class="diagnostics-actions">
                  <fieldset class="pairing-scope-choices" :disabled="pairingBusy">
                    <legend>本次设备授权（默认只读）</legend>
                    <label><input v-model="requestedPairingScopes" type="checkbox" value="task:draft" />允许保存消息；不自动调用模型或生成任务</label>
                    <label><input v-model="requestedPairingScopes" type="checkbox" value="task:approve" />允许批准当前任务草稿进入 TODO；仍须逐次审阅确认</label>
                    <p>Run、人工验收与危险操作尚未开放；勾选不会启动远程网关或绕过单次审批。</p>
                  </fieldset>
                  <ForgeButton variant="primary" :disabled="pairingBusy" @click="decideLocalPairing(true)">批准访问 {{ activeProject.name }}</ForgeButton>
                  <ForgeButton variant="secondary" :disabled="pairingBusy" @click="decideLocalPairing(false)">拒绝设备</ForgeButton>
                </div>
              </template>
              <p v-if="pairingMessage" role="status" class="settings-status">{{ pairingMessage }}</p>
            </section>
            <RemoteDevicesView :client="client" :desktop="runtime.kind === 'desktop'" :connected="hostStatus.state === 'connected'" :project-id="activeProject?.projectId ?? null" :loopback="localLoopback" />
          </section>
          <div class="settings-footer"><ForgeButton variant="ghost" size="sm" @click="navigate('board')">返回看板</ForgeButton></div>
        </div>
      </div>
    </section>
    <ForgeDrawer v-model:open="newWorkOpen" title="新建任务">
      <div class="new-work-content">
        <ConversationPanel v-if="newWorkOpen && activeProject?.trusted && runtime.kind === 'desktop' && !historicalReadOnly"
          :client="client" :project-id="activeProject.projectId" :connected="hostStatus.state === 'connected'" start-new @approval-changed="(approval) => { boardRefreshKey += 1; if (approval.status === 'approved') newWorkOpen = false; }" />
        <div v-else class="new-work-unavailable" role="status">
          <p>{{ historicalReadOnly ? '当前数据集为只读，不能创建任务。' : runtime.kind === 'web' ? '本地项目任务需要 Forge Desktop。' : hostStatus.state !== 'connected' ? 'Host 未连接，暂不能创建任务。' : '先选择并信任项目。' }}</p>
          <ForgeButton v-if="runtime.kind === 'desktop' && hostStatus.state === 'connected' && !historicalReadOnly && !activeProject?.trusted" variant="primary" @click="newWorkOpen = false; chooseProject()">选择项目</ForgeButton>
        </div>
      </div>
    </ForgeDrawer>
    <ForgeDialog v-model:open="projectPickerOpen" title="选择项目">
      <ProjectsView v-if="projectPickerOpen" :client="client" :desktop="runtime.kind === 'desktop'"
        :connected="hostStatus.state === 'connected'" :read-only="historicalReadOnly"
        :active-project="activeProject" compact :auto-choose="!activeProject || !activeProject.trusted"
        @activated="activatePickedProject" @cancelled="cancelProjectPicker" @home="cancelProjectPicker" />
    </ForgeDialog>
  </AppShell>
</template>

<style scoped>
.settings-view.utility-view { width: 100%; min-height: 100%; padding: 30px clamp(20px, 3.5vw, 48px) 64px; }
.settings-heading { max-width: 1160px; }
.settings-heading .eyebrow { margin: 0; }
.settings-heading h1 { margin: 7px 0 3px; font-size: 26px; }
.settings-heading > p:last-child { margin: 0; color: var(--forge-color-text-secondary); font-size: 12px; }
.settings-workspace { display: grid; grid-template-columns: 208px minmax(0, 880px); align-items: start; gap: clamp(24px, 3vw, 48px); max-width: 1160px; margin-top: 27px; }
.settings-navigation { position: sticky; top: 24px; display: grid; gap: 3px; min-width: 0; }
.settings-navigation button { display: grid; gap: 3px; width: 100%; padding: 12px 14px; border: 0; border-left: 2px solid transparent; border-radius: var(--forge-radius-md); background: transparent; color: var(--forge-color-text-secondary); text-align: left; font-size: 14px; font-weight: 600; }
.settings-navigation button span { color: var(--forge-color-text-muted); font-size: 12px; font-weight: 400; }
.settings-navigation button:hover { background: var(--forge-surface-control); color: var(--forge-color-text); }
.settings-navigation button[aria-current='page'] { border-left-color: var(--forge-color-accent); background: var(--forge-surface-control); color: var(--forge-color-text); }
.settings-navigation button:focus-visible, .settings-disclosure summary:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 2px; }
.settings-main, .settings-panel { min-width: 0; }
.settings-panel { padding: clamp(22px, 3vw, 34px); border: var(--forge-border-highlight); border-radius: var(--forge-radius-panel); background: var(--forge-surface-panel); box-shadow: var(--forge-shadow-surface), var(--forge-glass-inner-highlight); }
.settings-panel-heading { padding: 0 0 17px; border-bottom: var(--forge-border-highlight); }
.settings-panel-heading h2 { margin: 0 0 4px; font-size: 19px; font-weight: 650; letter-spacing: -.025em; }
.settings-panel-heading p { margin: 0; color: var(--forge-color-text-secondary); font-size: 13px; line-height: 1.5; }
.settings-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 20px; min-height: 76px; padding: 14px 2px; border-bottom: var(--forge-border-subtle); }
.settings-row strong { font-size: 14px; font-weight: 600; }
.settings-row p { margin: 4px 0 0; color: var(--forge-color-text-secondary); font-size: 12px; line-height: 1.5; }
.settings-card :deep(.forge-field) { width: min(180px, 100%); }
.settings-card :deep(.forge-field-label) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.settings-card :deep(.forge-select) { min-height: 34px; font-size: 12px; }
.settings-row .switch { flex: none; }
.settings-group { display: grid; gap: 13px; min-width: 0; padding: 21px 2px 25px; border-bottom: var(--forge-border-subtle); }
.settings-group-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; min-width: 0; }
.settings-group h3 { margin: 0; font-size: 13px; font-weight: 650; }
.settings-group .dependency-list { font-size: 12px; }
.settings-group .dependency-list > div { padding: 8px 0; }
.settings-status { margin: 0; color: var(--forge-color-text-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.settings-status[role='alert'] { color: var(--forge-color-danger); }
.settings-status code, .settings-disclosure code { font: 11px/1.5 var(--forge-font-mono); overflow-wrap: anywhere; }
.settings-state { color: var(--forge-color-text-secondary); font-size: 11px; }
.settings-data-profile { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 12px 14px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-control); font-size: 12px; }
.settings-data-profile span { color: var(--forge-color-text-secondary); }
.settings-disclosure { min-width: 0; color: var(--forge-color-text-secondary); font-size: 11px; line-height: 1.6; }
.settings-disclosure summary { width: fit-content; padding: 5px 0; color: var(--forge-color-accent-text); cursor: pointer; }
.settings-disclosure p { margin: 8px 0 0; max-width: 70ch; }
.settings-panel > .settings-disclosure { padding: 17px 2px; border-bottom: var(--forge-border-subtle); }
.settings-footer { margin-top: 27px; }
.settings-view :deep(.remote-devices) { margin: 24px 0 0; }
.settings-view :deep(.remote-devices .eyebrow) { display: none; }
.settings-view :deep(.remote-devices h2) { font-size: 15px; }
.settings-view :deep(.remote-devices .utility-intro) { font-size: 11px; }
@media (max-width: 760px) {
  .settings-view.utility-view { padding: 22px 18px 48px; }
  .settings-workspace { display: block; margin-top: 20px; }
  .settings-panel { padding: 18px; }
  .settings-navigation { position: static; display: flex; gap: 3px; margin-bottom: 23px; overflow-x: auto; border-bottom: var(--forge-border-subtle); }
  .settings-navigation button { flex: 0 0 auto; width: auto; padding: 9px 12px; border-left: 0; border-bottom: 2px solid transparent; border-radius: 6px 6px 0 0; white-space: nowrap; }
  .settings-navigation button span { display: none; }
  .settings-navigation button[aria-current='page'] { border-left-color: transparent; border-bottom-color: var(--forge-color-accent); }
}
@media (max-width: 480px) {
  .settings-row { gap: 10px; }
  .settings-card :deep(.forge-field) { width: 140px; }
  .settings-group-heading { align-items: flex-start; }
}
</style>
