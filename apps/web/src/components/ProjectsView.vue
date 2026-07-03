<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { forgeProjectSchema, projectProbeSchema, projectTrustVersion,
  type ForgeProject, type ProjectProbe } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeDialog } from '@forge/ui';
import ProjectEnvironmentPanel from './ProjectEnvironmentPanel.vue';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean;
  readOnly?: boolean; activeProject: ForgeProject | null; compact?: boolean; autoChoose?: boolean }>();
const emit = defineEmits<{ activated: [project: ForgeProject | null]; home: []; cancelled: [] }>();
const projects = ref<ForgeProject[]>([]);
const probe = ref<ProjectProbe | null>(null);
const pendingActivation = ref<ForgeProject | null>(null);
const stage = ref<'choose' | 'detected' | 'trust' | 'ready'>('choose');
const busy = ref(false);
const loading = ref(false);
const inspecting = computed(() => stage.value === 'detected' || stage.value === 'trust');
const declaredScripts = computed(() => Object.entries(probe.value?.scripts ?? {}).filter(([, value]) => value));
function workingTreeLabel(value: ProjectProbe['workingTree']): string {
  return value === 'clean' ? '干净' : value === 'dirty' ? '有未提交修改' : '未检测';
}
function scriptCommand(name: string): string {
  const manager = probe.value?.packageManager;
  return manager && !['unknown', 'conflict'].includes(manager) ? `${manager} run ${name}` : name;
}
const error = ref('');
const removeTarget = ref<ForgeProject | null>(null);
const removeOpen = ref(false);
const removeError = ref('');
let disposed = false;
let autoChooseStarted = false;

async function refresh(): Promise<boolean> {
  if (!props.desktop || !props.connected) return false;
  loading.value = true;
  try {
    const result = await props.client.project({ type: 'project.list', payload: {} });
    if (disposed) return false;
    if (!result.ok) { error.value = result.error.message; return false; }
    if (!Array.isArray(result.data) || !result.data.every((item) => forgeProjectSchema.safeParse(item).success)) {
      error.value = '项目列表无法读取，请关闭后重试。'; return false;
    }
    projects.value = result.data as ForgeProject[];
    return true;
  } catch { if (!disposed) error.value = '暂时无法读取项目列表，请稍后重试。'; return false; }
  finally { loading.value = false; }
}

async function choose(): Promise<void> {
  if (busy.value || !props.desktop || !props.connected || props.readOnly) return;
  busy.value = true; error.value = '';
  try {
    const selected = await props.client.chooseProjectFolder();
    if (disposed) return;
    if (selected === null) return;
    const result = await props.client.project({ type: 'project.probe', payload: { rootPath: selected } });
    if (disposed) return;
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = projectProbeSchema.safeParse(result.data);
    if (!checked.success) { error.value = '项目检查结果无效，请重新选择。'; return; }
    probe.value = checked.data; pendingActivation.value = null; stage.value = 'detected';
  } catch { if (!disposed) error.value = '无法打开或检查这个目录，请重新选择。'; }
  finally { busy.value = false; }
}

async function trust(): Promise<void> {
  if (!probe.value || busy.value || !props.desktop || !props.connected || props.readOnly) return;
  busy.value = true; error.value = '';
  try {
    if (!pendingActivation.value) {
      const result = await props.client.project({ type: 'project.create', payload: {
        rootPath: probe.value.rootPath, fingerprint: probe.value.fingerprint,
        trustVersion: projectTrustVersion, approved: true,
        expectedRevision: probe.value.existingProject?.revision ?? 0,
      } });
      if (!result.ok) { error.value = result.error.message; if (result.error.code === 'PROJECT_PROBE_STALE') stage.value = 'choose'; return; }
      const checked = forgeProjectSchema.safeParse(result.data);
      if (!checked.success) { error.value = '项目保存结果无效，请重新选择。'; return; }
      pendingActivation.value = checked.data;
    }
    const active = await props.client.project({ type: 'project.setActive', payload: {
      projectId: pendingActivation.value.projectId, expectedRevision: pendingActivation.value.revision,
    } });
    if (!active.ok || !forgeProjectSchema.safeParse(active.data).success) {
      error.value = active.ok ? '项目切换结果无效，请重试。' : active.error.message;
      await refreshActivation(); return;
    }
    pendingActivation.value = null;
    emit('activated', forgeProjectSchema.parse(active.data)); stage.value = 'ready'; await refresh();
  } catch {
    error.value = pendingActivation.value ? '信任已保存，暂时无法打开项目。请重试。' : '未能保存项目，请重试。';
    if (pendingActivation.value) await refreshActivation();
  }
  finally { busy.value = false; }
}

async function refreshActivation(): Promise<void> {
  if (!pendingActivation.value || !await refresh()) return;
  const current = projects.value.find((project) => project.projectId === pendingActivation.value?.projectId);
  if (current) pendingActivation.value = current;
}

async function activate(project: ForgeProject): Promise<void> {
  if (busy.value || !project.trusted || !props.desktop || !props.connected || props.readOnly) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.project({ type: 'project.setActive', payload: {
      projectId: project.projectId, expectedRevision: project.revision,
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = forgeProjectSchema.safeParse(result.data);
    if (!checked.success) { error.value = '项目切换结果无效，请重试。'; return; }
    emit('activated', checked.data); stage.value = 'ready'; await refresh();
  } catch { error.value = '未能切换项目，请重试。'; }
  finally { busy.value = false; }
}

function askRemove(project: ForgeProject): void {
  if (busy.value || !props.connected || props.readOnly) return;
  removeTarget.value = project; removeError.value = ''; removeOpen.value = true;
}
async function remove(): Promise<void> {
  if (busy.value || !props.connected || props.readOnly) return;
  const target = removeTarget.value;
  if (!target) return;
  busy.value = true; removeError.value = '';
  try {
    const result = await props.client.project({ type: 'project.remove', payload: {
      projectId: target.projectId, expectedRevision: target.revision,
    } });
    if (!result.ok) {
      removeError.value = result.error.code === 'PROJECT_BUSY'
        ? '项目还有正在进行的开发、审查、验证、返工或合并。请先等待它们结束，再从 Forge 移除。'
        : result.error.code === 'RUN_RECOVERY_REQUIRED'
          ? '项目有中断的开发、审查、验证或隔离工作区，结果尚未安全对账。请先保留项目和诊断记录。'
          : result.error.message;
      return;
    }
    if (props.activeProject?.projectId === target.projectId) emit('activated', null);
    removeOpen.value = false; removeTarget.value = null; stage.value = 'choose'; await refresh();
  } catch { removeError.value = '未能移除项目记录，请重试。'; }
  finally { busy.value = false; }
}

function maybeAutoChoose(): void {
  if (!disposed && !autoChooseStarted && props.autoChoose && props.desktop && props.connected && !props.readOnly) {
    autoChooseStarted = true;
    if (!projects.value.length) void choose();
  }
}
async function refreshAndChoose(): Promise<void> {
  if (await refresh()) maybeAutoChoose();
}
onMounted(() => { void refreshAndChoose(); });
onUnmounted(() => { disposed = true; });
watch(() => props.connected, (connected) => { if (connected) void refreshAndChoose(); });
</script>

<template>
  <section class="projects-view project-manager" :class="{ 'projects-view--compact': compact }"
    :aria-labelledby="compact ? undefined : 'projects-title'" :aria-label="compact ? '选择项目' : undefined">
    <header v-if="!compact" class="project-manager-heading">
      <div><h1 id="projects-title">项目</h1><p>管理本地项目与工作环境。</p></div>
      <ForgeButton v-if="desktop && connected && !readOnly" variant="primary" size="sm" :loading="busy" @click="choose">选择文件夹</ForgeButton>
    </header>
    <p v-if="error" class="project-error" role="alert">{{ error }}</p>
    <div v-if="!desktop" class="project-unavailable" role="status">
      <h2>本地项目需要 Forge Desktop</h2><p>请在桌面应用中打开项目。</p>
    </div>
    <div v-else-if="!connected" class="project-unavailable" role="status">
      <h2>Host unavailable</h2><p>本地服务连接后即可打开项目。</p>
    </div>
    <template v-else>
      <p v-if="readOnly" class="project-readonly" role="status">历史项目记录 · 此数据集只读。</p>
      <div class="project-manager-layout" :class="{ 'project-manager-layout--inspecting': inspecting }">
        <section v-if="!compact || !inspecting" class="project-catalog" aria-labelledby="saved-projects-title">
          <header class="project-section-heading"><h2 id="saved-projects-title">已保存项目</h2><span>{{ projects.length }}</span></header>
          <p v-if="loading && !projects.length" class="project-list-notice" role="status">正在读取项目…</p>
          <p v-else-if="!projects.length" class="project-list-notice">还没有项目。选择本地代码目录开始。</p>
          <ul v-else class="project-record-list">
            <li v-for="project in projects" :key="project.projectId" class="project-record"
              :class="{ 'project-record--active': activeProject?.projectId === project.projectId }">
              <div class="project-record-title"><strong>{{ project.name }}</strong>
                <ForgeBadge v-if="!project.trusted">需重新信任</ForgeBadge>
                <ForgeBadge v-else-if="activeProject?.projectId === project.projectId">当前</ForgeBadge>
              </div>
              <p class="project-path" :title="project.rootPath">{{ project.rootPath }}</p>
              <p class="project-record-meta"><span>{{ project.repositoryType === 'git' ? project.probe.currentBranch ?? '分支未知' : '非 Git 项目' }}</span><span>{{ project.probe.projectType === 'unknown' ? '未识别类型' : project.probe.projectType }}</span></p>
              <div v-if="!readOnly" class="project-record-actions">
                <ForgeButton v-if="!project.trusted" size="sm" :disabled="busy" @click="choose">重新选择并探测</ForgeButton>
                <ForgeButton v-else-if="activeProject?.projectId !== project.projectId" size="sm" :disabled="busy" @click="activate(project)">切换</ForgeButton>
                <ForgeButton v-else-if="!compact" size="sm" :disabled="busy" @click="emit('home')">打开看板</ForgeButton>
                <ForgeButton v-if="!compact" variant="ghost" size="sm" :disabled="busy" @click="askRemove(project)">从 Forge 移除</ForgeButton>
              </div>
            </li>
          </ul>
          <div v-if="compact && !readOnly" class="project-catalog-footer">
            <ForgeButton variant="ghost" :disabled="busy" @click="emit('cancelled')">取消</ForgeButton>
            <ForgeButton variant="secondary" :loading="busy" :disabled="loading" @click="choose">选择文件夹</ForgeButton>
          </div>
        </section>
        <div v-if="!compact || inspecting" class="project-manager-detail">
          <section v-if="!readOnly && stage === 'detected' && probe" class="project-inspection" aria-labelledby="project-inspection-title">
            <header class="project-inspection-heading"><span class="project-inspection-label">已检查项目</span><h2 id="project-inspection-title">{{ probe.name }}</h2><p class="project-path" :title="probe.rootPath">{{ probe.rootPath }}</p></header>
            <p v-if="probe.workingTree === 'dirty'" class="project-warning">工作区有未提交修改。现有文件会保留。</p>
            <p v-if="probe.repositoryType === 'none'" class="project-warning">非 Git 项目：无法使用隔离工作区。</p>
            <p v-if="probe.packageManager === 'conflict'" class="project-warning">发现多个 lockfile，请确认实际使用的包管理器。</p>
            <dl class="project-overview-facts">
              <dt>仓库</dt><dd>{{ probe.repositoryType === 'git' ? 'Git' : '普通目录' }}</dd>
              <dt>当前分支</dt><dd>{{ probe.currentBranch ?? '未检测' }}</dd>
              <dt>工作区</dt><dd>{{ workingTreeLabel(probe.workingTree) }}</dd>
              <dt>包管理器</dt><dd>{{ probe.packageManager === 'unknown' ? '未检测' : probe.packageManager === 'conflict' ? '存在冲突' : probe.packageManager }}</dd>
              <dt>项目类型</dt><dd>{{ probe.projectType === 'unknown' ? '未识别' : probe.projectType }}</dd>
            </dl>
            <details class="project-detection-details"><summary>环境与命令详情</summary>
              <dl class="project-overview-facts">
                <dt>默认分支</dt><dd>{{ probe.defaultBranch ?? '未检测' }}</dd>
                <dt>远程仓库</dt><dd>{{ probe.remoteConfigured ? '已配置' : '未检测' }}</dd>
                <dt>运行环境</dt><dd>{{ probe.detectedRuntime.join('、') || '未检测' }}</dd>
                <dt>识别依据</dt><dd>{{ probe.packageManagerEvidence.join('、') || '无' }}</dd>
              </dl>
              <ul v-if="declaredScripts.length" class="project-script-list"><li v-for="[name] in declaredScripts" :key="name"><code>{{ scriptCommand(name) }}</code><span>已声明 · 未运行</span></li></ul>
              <p v-else>未发现已声明的项目命令。</p>
            </details>
            <div class="project-actions"><ForgeButton variant="ghost" :disabled="busy" @click="stage = 'choose'">返回</ForgeButton><ForgeButton variant="primary" @click="stage = 'trust'">继续</ForgeButton></div>
          </section>
          <section v-else-if="!readOnly && stage === 'trust' && probe" class="project-inspection project-trust" aria-labelledby="project-trust-title">
            <header class="project-inspection-heading"><h2 id="project-trust-title">{{ pendingActivation ? '项目已信任' : '信任这个项目？' }}</h2><p><strong>{{ probe.name }}</strong></p><p class="project-path" :title="probe.rootPath">{{ probe.rootPath }}</p></header>
            <p v-if="pendingActivation" role="status">信任决定已保存。重新打开项目即可，不需要重复确认。</p>
            <template v-else>
            <p>信任后，你可以让 Forge 在这个项目中执行开发任务。</p>
            <ul><li>读取项目文件，并创建独立 Git 工作区。</li><li>经任务授权后修改代码、运行 Agent、测试和构建。</li><li>项目脚本可以执行任意本机代码，请只信任来源可靠的项目。</li></ul>
            <p class="project-trust-boundary">此操作不会开始执行任务。推送、合并、发布、删除和访问其他目录仍需独立授权。</p>
            </template>
            <div class="project-actions"><ForgeButton variant="ghost" :disabled="busy" @click="stage = pendingActivation ? 'choose' : 'detected'">返回</ForgeButton><ForgeButton variant="primary" :loading="busy" @click="trust">{{ pendingActivation ? '重试打开项目' : '信任并打开' }}</ForgeButton></div>
          </section>
          <template v-else-if="activeProject">
            <header class="project-active-heading"><div><span class="project-inspection-label">当前项目</span><h2>{{ activeProject.name }}</h2><p class="project-path" :title="activeProject.rootPath">{{ activeProject.rootPath }}</p></div><ForgeBadge>{{ activeProject.trusted ? '已信任' : '需重新信任' }}</ForgeBadge></header>
            <p v-if="stage === 'ready'" class="project-connection-notice" role="status">已切换到 {{ activeProject.name }}</p>
            <p v-if="!activeProject.trusted" class="project-warning" role="alert">重新选择目录并确认信任后，才能创建和运行任务。</p>
            <ProjectEnvironmentPanel v-if="activeProject.trusted && !readOnly" :client="client" :project="activeProject" :connected="connected" />
          </template>
          <div v-else class="project-unselected"><h2>打开你的代码项目</h2><p>选择文件夹，查看环境并确认信任后开始工作。</p></div>
        </div>
      </div>
    </template>
    <ForgeDialog v-model:open="removeOpen" :title="`从 Forge 移除“${removeTarget?.name ?? '项目'}”？`">
      <p class="project-remove-explanation">仅移除 Forge 中的项目记录。你的源码、Git 仓库和项目文件不会被删除。</p>
      <p v-if="removeError" class="project-error" role="alert">{{ removeError }}</p>
      <div class="project-actions"><ForgeButton variant="secondary" :disabled="busy" @click="removeOpen = false">取消</ForgeButton><ForgeButton variant="danger" :loading="busy" @click="remove">从 Forge 移除</ForgeButton></div>
    </ForgeDialog>
  </section>
</template>

<style scoped>
.project-manager { width: 100%; max-width: 1200px; margin: 0 auto; padding: var(--forge-space-24); }
.project-manager-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-16); margin-bottom: var(--forge-space-24); }
.project-manager h1 { margin: 0; font-size: 22px; letter-spacing: -.025em; }
.project-manager-heading p { margin: var(--forge-space-6) 0 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-small); }
.project-manager-layout { display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap: var(--forge-space-24); align-items: start; }
.project-catalog, .project-manager-detail { min-width: 0; }
.project-catalog { border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); overflow: hidden; }
.project-section-heading { display: flex; align-items: center; justify-content: space-between; padding: var(--forge-space-12) var(--forge-space-16); border-bottom: var(--forge-border-subtle); }
.project-section-heading h2 { margin: 0; font-size: var(--forge-font-small); font-weight: var(--forge-font-weight-semibold); }
.project-section-heading > span { color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.project-record-list { list-style: none; margin: 0; padding: 0; }
.project-record { padding: var(--forge-space-16); border-bottom: var(--forge-border-subtle); }
.project-record:last-child { border-bottom: 0; }
.project-record--active { background: var(--forge-surface-control); }
.project-record-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--forge-space-8); }
.project-record-title strong { min-width: 0; overflow-wrap: anywhere; font-size: var(--forge-font-body); }
.project-manager .project-path { margin: var(--forge-space-6) 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-small); }
.project-record-meta { display: flex; gap: var(--forge-space-12); margin: var(--forge-space-8) 0 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.project-record-actions { display: flex; flex-wrap: wrap; gap: var(--forge-space-6); margin-top: var(--forge-space-12); }
.project-list-notice { margin: 0; padding: var(--forge-space-20) var(--forge-space-16); color: var(--forge-color-text-secondary); font-size: var(--forge-font-body); line-height: var(--forge-line-body); }
.project-catalog-footer { display: flex; justify-content: flex-end; gap: var(--forge-space-8); border-top: var(--forge-border-subtle); padding: var(--forge-space-12); }
.project-inspection { border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); padding: var(--forge-space-20); background: var(--forge-surface-reading); }
.project-inspection-heading h2, .project-active-heading h2 { margin: var(--forge-space-6) 0; font-size: 20px; overflow-wrap: anywhere; }
.project-inspection-label { color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.project-inspection-heading > p { margin: var(--forge-space-6) 0; }
.project-manager .project-warning { padding: var(--forge-space-12); font-size: var(--forge-font-small); line-height: 1.5; }
.project-overview-facts { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1.3fr); gap: var(--forge-space-8) var(--forge-space-16); margin: var(--forge-space-16) 0; font-size: var(--forge-font-body); }
.project-overview-facts dt { color: var(--forge-color-text-secondary); }
.project-overview-facts dd { margin: 0; overflow-wrap: anywhere; }
.project-detection-details { border-top: var(--forge-border-subtle); padding-top: var(--forge-space-12); font-size: var(--forge-font-small); }
.project-detection-details summary { cursor: pointer; color: var(--forge-color-text-secondary); }
.project-detection-details summary:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 4px; }
.project-script-list { list-style: none; padding: 0; margin: var(--forge-space-12) 0 0; }
.project-script-list li { display: flex; justify-content: space-between; gap: var(--forge-space-12); padding: var(--forge-space-6) 0; }
.project-script-list span { color: var(--forge-color-text-secondary); }
.project-manager .project-actions { justify-content: flex-end; margin-top: var(--forge-space-20); }
.project-trust > p, .project-trust ul, .project-remove-explanation { font-size: var(--forge-font-body); color: var(--forge-color-text-secondary); line-height: 1.7; }
.project-trust ul { padding-left: var(--forge-space-20); }
.project-trust-boundary { border-top: var(--forge-border-subtle); padding-top: var(--forge-space-12); }
.project-active-heading { display: flex; align-items: start; justify-content: space-between; gap: var(--forge-space-12); padding-bottom: var(--forge-space-16); border-bottom: var(--forge-border-subtle); }
.project-active-heading > div { min-width: 0; }
.project-active-heading :deep(.forge-badge) { flex-shrink: 0; }
.project-connection-notice { color: var(--forge-color-success); font-size: var(--forge-font-small); }
.project-manager-detail :deep(.project-environment) { margin-top: var(--forge-space-20); }
.project-manager-detail :deep(.project-environment-card) { border-radius: var(--forge-radius-md); box-shadow: none; }
.project-unavailable, .project-unselected { border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); padding: var(--forge-space-24); }
.project-unavailable h2, .project-unselected h2 { margin: 0 0 var(--forge-space-8); font-size: 17px; }
.project-unavailable p, .project-unselected p, .project-readonly { margin: 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-body); line-height: 1.7; }
.project-readonly { margin-bottom: var(--forge-space-16); }
.projects-view--compact.project-manager { padding: 0; }
.projects-view--compact .project-manager-layout { display: block; }
.projects-view--compact .project-inspection { padding: var(--forge-space-16); }
@media (max-width: 1050px) { .project-manager-layout { grid-template-columns: minmax(230px, .7fr) minmax(0, 1.3fr); gap: var(--forge-space-16); } }
@media (max-width: 780px) { .project-manager { padding: var(--forge-space-16); } .project-manager-layout { grid-template-columns: minmax(0, 1fr); } }
</style>
