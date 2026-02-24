<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { forgeProjectSchema, projectProbeSchema, projectTrustVersion,
  type ForgeProject, type ProjectProbe } from '@forge/contracts';
import { ForgeBadge, ForgeButton, ForgeCard, ForgeDialog, ForgeEmptyState } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean; activeProject: ForgeProject | null }>();
const emit = defineEmits<{ activated: [project: ForgeProject | null]; home: [] }>();
const projects = ref<ForgeProject[]>([]);
const probe = ref<ProjectProbe | null>(null);
const stage = ref<'choose' | 'detected' | 'trust' | 'ready'>('choose');
const busy = ref(false);
const error = ref('');
const removeTarget = ref<ForgeProject | null>(null);
const removeOpen = ref(false);

async function refresh(): Promise<void> {
  if (!props.desktop || !props.connected) return;
  const result = await props.client.project({ type: 'project.list', payload: {} });
  if (result.ok && Array.isArray(result.data)) projects.value = result.data.filter((item) => forgeProjectSchema.safeParse(item).success) as ForgeProject[];
}

async function choose(): Promise<void> {
  if (busy.value || !props.connected) return;
  busy.value = true; error.value = '';
  try {
    const selected = await props.client.chooseProjectFolder();
    if (selected === null) return;
    const result = await props.client.project({ type: 'project.probe', payload: { rootPath: selected } });
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = projectProbeSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Invalid project probe response'; return; }
    probe.value = checked.data; stage.value = 'detected';
  } catch { error.value = 'Could not choose or inspect the project directory'; }
  finally { busy.value = false; }
}

async function trust(): Promise<void> {
  if (!probe.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.project({ type: 'project.create', payload: {
      rootPath: probe.value.rootPath, fingerprint: probe.value.fingerprint,
      trustVersion: projectTrustVersion, approved: true,
      expectedRevision: probe.value.existingProject?.revision ?? 0,
    } });
    if (!result.ok) { error.value = result.error.message; if (result.error.code === 'PROJECT_PROBE_STALE') stage.value = 'choose'; return; }
    const checked = forgeProjectSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Invalid saved project response'; return; }
    const active = await props.client.project({ type: 'project.setActive', payload: {
      projectId: checked.data.projectId, expectedRevision: checked.data.revision,
    } });
    if (!active.ok || !forgeProjectSchema.safeParse(active.data).success) {
      error.value = active.ok ? 'Invalid active project response' : active.error.message; await refresh(); return;
    }
    emit('activated', forgeProjectSchema.parse(active.data)); stage.value = 'ready'; await refresh();
  } catch { error.value = 'Could not save the trusted project'; }
  finally { busy.value = false; }
}

async function activate(project: ForgeProject): Promise<void> {
  busy.value = true; error.value = '';
  try {
    const result = await props.client.project({ type: 'project.setActive', payload: {
      projectId: project.projectId, expectedRevision: project.revision,
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    const checked = forgeProjectSchema.safeParse(result.data);
    if (!checked.success) { error.value = 'Invalid project response'; return; }
    emit('activated', checked.data); stage.value = 'ready'; await refresh();
  } catch { error.value = 'Could not switch project'; }
  finally { busy.value = false; }
}

function askRemove(project: ForgeProject): void { removeTarget.value = project; removeOpen.value = true; }
async function remove(): Promise<void> {
  const target = removeTarget.value;
  if (!target) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.client.project({ type: 'project.remove', payload: {
      projectId: target.projectId, expectedRevision: target.revision,
    } });
    if (!result.ok) { error.value = result.error.message; return; }
    if (props.activeProject?.projectId === target.projectId) emit('activated', null);
    removeOpen.value = false; removeTarget.value = null; stage.value = 'choose'; await refresh();
  } catch { error.value = 'Could not remove the Forge project record'; }
  finally { busy.value = false; }
}

onMounted(() => { void refresh(); });
watch(() => props.connected, (connected) => { if (connected) void refresh(); });
</script>

<template>
  <section class="projects-view" aria-labelledby="projects-title">
    <div class="projects-heading"><p class="eyebrow">FORGE / PROJECTS</p><h1 id="projects-title">选择一个项目</h1>
      <p>先查看本地环境，再决定是否信任。探测不会安装依赖或运行项目脚本。</p></div>
    <p v-if="error" class="project-error" role="alert">{{ error }}</p>
    <ForgeCard v-if="!desktop" tone="reading" class="project-step">
      <ForgeEmptyState title="本地项目需要 Forge Desktop" description="Connect to a Forge Host to access projects. Web 暂未提供 Remote Host。" />
    </ForgeCard>
    <ForgeCard v-else-if="!connected" tone="reading" class="project-step">
      <ForgeEmptyState title="Host unavailable" description="连接到本地 Forge Host 后才能探测或保存项目。" />
    </ForgeCard>
    <template v-else>
      <div class="project-step-indicator" aria-label="项目连接进度"><span :data-current="stage === 'choose'">01 选择</span><span :data-current="stage === 'detected'">02 探测</span><span :data-current="stage === 'trust'">03 信任</span><span :data-current="stage === 'ready'">04 就绪</span></div>
      <ForgeCard v-if="stage === 'choose'" tone="reading" class="project-step">
        <span class="project-step-icon" aria-hidden="true">⌁</span><h2>Choose project</h2>
        <p>选择本地代码目录。Forge 会只读检查 Git 状态和常见项目清单。</p>
        <ForgeButton variant="primary" :loading="busy" @click="choose">Choose folder</ForgeButton>
      </ForgeCard>
      <ForgeCard v-else-if="stage === 'detected' && probe" tone="reading" class="project-step project-detected">
        <p class="eyebrow">PROJECT DETECTED</p><h2>{{ probe.name }}</h2>
        <p class="project-path" :title="probe.rootPath">{{ probe.rootPath }}</p>
        <p v-if="probe.workingTree === 'dirty'" class="project-warning">Working tree has uncommitted changes. Forge 不会修改、stash 或清理这些文件。</p>
        <p v-if="probe.repositoryType === 'none'" class="project-warning">不是 Git 仓库。后续依赖 Git worktree 的功能将不可用；Forge 不会自动初始化 Git。</p>
        <p v-if="probe.packageManager === 'conflict'" class="project-warning">发现多个 lockfile，请自行确认实际使用的包管理器。Forge 不会删除它们。</p>
        <dl class="project-facts">
          <dt>Repository</dt><dd>{{ probe.repositoryType === 'git' ? 'Git repository' : 'Non-Git directory' }}</dd>
          <dt>Current branch</dt><dd>{{ probe.currentBranch ?? 'Unknown' }}</dd>
          <dt>Default branch</dt><dd>{{ probe.defaultBranch ?? 'Unknown' }}</dd>
          <dt>Working tree</dt><dd>{{ probe.workingTree }}</dd>
          <dt>Remote</dt><dd>{{ probe.remoteConfigured ? 'Configured locally' : 'Not detected' }}</dd>
          <dt>Package manager</dt><dd>{{ probe.packageManager }} <small v-if="probe.packageManagerEvidence.length">· {{ probe.packageManagerEvidence.join(', ') }}</small></dd>
          <dt>Detected stack</dt><dd>{{ probe.projectType }} · {{ probe.detectedRuntime.join(', ') || 'Unknown' }}</dd>
          <template v-for="(script, name) in probe.scripts" :key="name"><dt>{{ name }}</dt><dd>{{ script ? `${probe.packageManager === 'unknown' || probe.packageManager === 'conflict' ? 'script' : probe.packageManager} ${name}` : 'Not declared' }} <small v-if="script">· Detected, not run</small></dd></template>
        </dl>
        <div class="project-actions"><ForgeButton variant="secondary" @click="stage = 'choose'">返回</ForgeButton><ForgeButton variant="primary" @click="stage = 'trust'">继续查看信任范围</ForgeButton></div>
      </ForgeCard>
      <ForgeCard v-else-if="stage === 'trust' && probe" tone="reading" class="project-step project-trust">
        <p class="eyebrow">EXPLICIT TRUST / {{ projectTrustVersion }}</p><h2>Trust this project?</h2>
        <p>你选择的是 <strong>{{ probe.name }}</strong>。确认后，Forge 将其保存为可执行项目上下文。</p>
        <ul><li>Forge 以后可能读取项目文件并创建独立 Git worktree。</li><li>经后续任务授权后，Forge 可能在隔离工作区修改文件、运行项目脚本、构建、测试或启动 Coding Agent。</li><li>项目脚本可以执行任意本机代码；此处不会立即执行脚本。</li><li>信任项目不等于自动批准发布、推送、合并、删除或访问其他目录。</li></ul>
        <div class="project-actions"><ForgeButton variant="secondary" @click="stage = 'detected'">返回探测结果</ForgeButton><ForgeButton variant="primary" :loading="busy" @click="trust">Trust this project</ForgeButton></div>
      </ForgeCard>
      <ForgeCard v-else-if="stage === 'ready' && activeProject" tone="reading" class="project-step project-ready">
        <ForgeBadge>PROJECT CONNECTED</ForgeBadge><h2>{{ activeProject.name }}</h2>
        <p>已保存信任决定。当前工作区为该项目；任务草稿需人工批准，开发运行需单独启动。</p>
        <div class="project-actions"><ForgeButton variant="secondary" @click="stage = 'choose'">连接其他项目</ForgeButton><ForgeButton variant="primary" @click="emit('home')">进入 Forge Workspace</ForgeButton></div>
      </ForgeCard>
      <section v-if="projects.length" class="saved-projects" aria-labelledby="saved-projects-title"><h2 id="saved-projects-title">已保存项目</h2>
        <ForgeCard v-for="project in projects" :key="project.projectId" tone="reading" class="saved-project">
          <div><strong>{{ project.name }}</strong><p :title="project.rootPath">{{ project.rootPath }}</p><small>{{ project.repositoryType === 'git' ? project.probe.currentBranch ?? 'Detached / unknown branch' : 'Non-Git · limited capabilities' }}</small></div>
          <ForgeBadge v-if="activeProject?.projectId === project.projectId">当前</ForgeBadge>
          <ForgeButton v-else size="sm" @click="activate(project)">切换</ForgeButton>
          <ForgeButton variant="ghost" size="sm" @click="askRemove(project)">Remove from Forge</ForgeButton>
        </ForgeCard>
      </section>
    </template>
    <ForgeDialog v-model:open="removeOpen" :title="`Remove “${removeTarget?.name ?? 'project'}” from Forge?`">
      <p>This removes Forge metadata only. Your project files will not be deleted.</p>
      <div class="project-actions"><ForgeButton variant="secondary" @click="removeOpen = false">Cancel</ForgeButton><ForgeButton variant="danger" :loading="busy" @click="remove">Remove from Forge</ForgeButton></div>
    </ForgeDialog>
  </section>
</template>
