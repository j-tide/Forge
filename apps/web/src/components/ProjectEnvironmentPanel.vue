<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import { commandPresetSchema, forgeProjectSchema, projectEnvironmentSchema,
  projectProbeSchema, type CommandPreset, type ForgeProject,
  type ProjectEnvironment } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeDialog, ForgeInput, ForgeSelect,
  ForgeTextarea } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; project: ForgeProject; connected: boolean }>();
const environment = ref<ProjectEnvironment | null>(null);
const presets = ref<CommandPreset[]>([]);
const scriptsHash = ref('');
const environmentName = ref('');
const kind = ref('test');
const executable = ref('');
const argvText = ref('');
const cwdRelative = ref('.');
const timeoutText = ref('120');
const editing = ref<CommandPreset | null>(null);
const approvalTarget = ref<CommandPreset | null>(null);
const approvalOpen = ref(false);
const approvalConfirmed = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
let serial = 0;

async function readScriptsHash(): Promise<string> {
  const response = await props.client.project({ type: 'project.reprobe', payload: {
    projectId: props.project.projectId,
  } });
  if (!response.ok) throw new Error(response.error.code);
  const checked = projectProbeSchema.safeParse(response.data);
  if (!checked.success || checked.data.rootPath !== props.project.rootPath ||
    !checked.data.scriptsHash) throw new Error('PROJECT_PROBE_STALE');
  return checked.data.scriptsHash;
}

async function refresh(): Promise<void> {
  const token = ++serial;
  environment.value = null; presets.value = []; scriptsHash.value = '';
  error.value = ''; notice.value = '';
  if (!props.connected || !forgeProjectSchema.safeParse(props.project).success) return;
  busy.value = true;
  try {
    const [envResponse, presetResponse, freshHash] = await Promise.all([
      props.client.project({ type: 'environment.get', payload: {
        projectId: props.project.projectId, environmentId: props.project.environmentId,
      } }),
      props.client.project({ type: 'commandPreset.list', payload: {
        projectId: props.project.projectId, environmentId: props.project.environmentId,
      } }),
      readScriptsHash(),
    ]);
    if (token !== serial) return;
    const env = envResponse.ok ? projectEnvironmentSchema.safeParse(envResponse.data) : null;
    const list = presetResponse.ok ? commandPresetSchema.array().safeParse(presetResponse.data) : null;
    if (!env?.success || !list?.success || env.data.projectId !== props.project.projectId ||
      env.data.environmentId !== props.project.environmentId ||
      list.data.some((item) => item.projectId !== props.project.projectId ||
        item.environmentId !== props.project.environmentId)) throw new Error('INVALID_RESPONSE');
    environment.value = env.data;
    environmentName.value = env.data.name;
    presets.value = list.data;
    scriptsHash.value = freshHash;
  } catch (cause) {
    if (token === serial) error.value = `环境读取失败：${cause instanceof Error ? cause.message : 'HOST_UNAVAILABLE'}`;
  } finally { if (token === serial) busy.value = false; }
}

function edit(preset: CommandPreset): void {
  editing.value = preset;
  kind.value = preset.name;
  executable.value = preset.executable;
  argvText.value = preset.argv.join('\n');
  cwdRelative.value = preset.cwdRelative;
  timeoutText.value = String(preset.timeoutSeconds);
  error.value = ''; notice.value = '';
}

function clearForm(): void {
  editing.value = null; kind.value = 'test'; executable.value = '';
  argvText.value = ''; cwdRelative.value = '.'; timeoutText.value = '120';
}

async function savePreset(): Promise<void> {
  if (busy.value || !environment.value) return;
  const timeout = Number(timeoutText.value);
  if (!executable.value.trim() || !cwdRelative.value.trim() ||
    !Number.isInteger(timeout) || timeout < 1 || timeout > 7200) {
    error.value = '请填写可执行文件、项目内工作目录和 1～7200 秒的超时。'; return;
  }
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const freshHash = await readScriptsHash();
    const response = await props.client.project({ type: 'commandPreset.save', payload: {
      projectId: props.project.projectId, environmentId: environment.value.environmentId,
      ...(editing.value ? { presetId: editing.value.presetId } : {}),
      expectedRevision: editing.value?.revision ?? 0,
      name: kind.value, executable: executable.value.trim(),
      argv: argvText.value.split(/\r?\n/).filter((arg) => arg.length > 0),
      cwdRelative: cwdRelative.value.trim(), envRefs: [],
      timeoutSeconds: timeout, scriptsHash: freshHash,
    } });
    if (!response.ok) throw new Error(response.error.code);
    if (!commandPresetSchema.safeParse(response.data).success) throw new Error('INVALID_RESPONSE');
    clearForm(); await refresh();
    notice.value = '命令预设已保存，尚未批准或运行。请审阅完整 argv 后单独批准。';
  } catch (cause) { error.value = `预设未保存：${cause instanceof Error ? cause.message : 'HOST_UNAVAILABLE'}`; }
  finally { busy.value = false; }
}

function askApproval(preset: CommandPreset): void {
  approvalTarget.value = preset; approvalConfirmed.value = false; approvalOpen.value = true;
  error.value = ''; notice.value = '';
}

async function approvePreset(): Promise<void> {
  const target = approvalTarget.value;
  if (!target || !approvalConfirmed.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const freshHash = await readScriptsHash();
    const response = await props.client.project({ type: 'commandPreset.approve', payload: {
      projectId: props.project.projectId, presetId: target.presetId,
      expectedRevision: target.revision, scriptsHash: freshHash,
    } });
    if (!response.ok) throw new Error(response.error.code);
    if (!commandPresetSchema.safeParse(response.data).success) throw new Error('INVALID_RESPONSE');
    approvalOpen.value = false; approvalTarget.value = null; await refresh();
    notice.value = '预设已获本机人工批准；加入环境后仅供之后启动的 Run 使用，不会立即执行。';
  } catch (cause) { error.value = `预设未批准：${cause instanceof Error ? cause.message : 'HOST_UNAVAILABLE'}`; }
  finally { busy.value = false; }
}

async function saveEnvironment(ids: string[]): Promise<void> {
  const current = environment.value;
  if (!current || busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const response = await props.client.project({ type: 'environment.save', payload: {
      projectId: props.project.projectId, environmentId: current.environmentId,
      expectedRevision: current.revision, name: environmentName.value.trim(),
      config: { ...current.config, commandPresetIds: ids },
    } });
    if (!response.ok) throw new Error(response.error.code);
    const checked = projectEnvironmentSchema.safeParse(response.data);
    if (!checked.success) throw new Error('INVALID_RESPONSE');
    environment.value = checked.data;
    notice.value = '环境新版本已保存。已有 Run 保留旧版冻结配置；新 Run 才会读取此版本。';
  } catch (cause) { error.value = `环境未保存：${cause instanceof Error ? cause.message : 'HOST_UNAVAILABLE'}`; }
  finally { busy.value = false; }
}

watch(() => [props.project.projectId, props.project.environmentId, props.connected],
  () => { clearForm(); void refresh(); }, { immediate: true });
</script>

<template>
  <section class="project-environment" aria-label="项目环境与命令预设">
    <div class="acceptance-matrix-head"><h2>项目环境与验证命令</h2>
      <ForgeButton variant="ghost" size="sm" :disabled="busy" @click="refresh">重新只读探测</ForgeButton></div>
    <p>配置只作用于后续新 Run。保存、批准预设都不会执行项目脚本；Verify 仍须对具体快照明确启动。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="busy && !environment" role="status">正在只读读取项目环境…</p>
    <ForgeCard v-if="environment" tone="reading" class="project-environment-card">
      <ForgeInput v-model="environmentName" label="当前环境名称" />
      <p>环境 v{{ environment.revision }} · trusted-local · 已启用 {{ environment.config.commandPresetIds.length }} 个预设</p>
      <p v-if="environment.config.envRefs.length" role="alert">此环境含凭据引用；本版 Verify 不会使用它们，也不会在此显示密钥。</p>
      <ForgeButton variant="secondary" size="sm" :disabled="busy || !environmentName.trim()"
        @click="saveEnvironment([...environment.config.commandPresetIds])">保存环境新版本</ForgeButton>
    </ForgeCard>
    <ForgeCard v-if="environment" tone="reading" class="project-environment-card">
      <h3>验证命令预设</h3>
      <p>预设以 executable + 每行一个 argv 保存，不使用 Shell 拼接。项目脚本可能执行任意本机代码；只对受信任项目单独批准。</p>
      <p v-if="!presets.length">暂无命令预设。Detected script 不代表已经批准或执行。</p>
      <ul v-else class="project-preset-list"><li v-for="preset in presets" :key="preset.presetId">
        <strong>{{ preset.name }} · v{{ preset.revision }}</strong>
        <code>{{ preset.executable }} {{ preset.argv.join(' ') }}</code>
        <small>{{ preset.approvalHash && preset.scriptsHash === scriptsHash ? '已批准' :
          preset.approvalHash ? '项目脚本已变化，须重新审阅' : '未批准' }} ·
          {{ environment.config.commandPresetIds.includes(preset.presetId) ? '已加入环境' : '未加入环境' }}</small>
        <div class="project-actions">
          <ForgeButton variant="ghost" size="sm" :disabled="busy" @click="edit(preset)">编辑</ForgeButton>
          <ForgeButton v-if="!preset.approvalHash || preset.scriptsHash !== scriptsHash" variant="secondary" size="sm"
            :disabled="busy" @click="askApproval(preset)">审阅并批准</ForgeButton>
          <ForgeButton v-if="preset.approvalHash && preset.scriptsHash === scriptsHash &&
            !environment.config.commandPresetIds.includes(preset.presetId)" variant="secondary" size="sm"
            :disabled="busy" @click="saveEnvironment([...environment.config.commandPresetIds,preset.presetId])">加入新 Run 的环境</ForgeButton>
          <ForgeButton v-if="environment.config.commandPresetIds.includes(preset.presetId)" variant="ghost" size="sm"
            :disabled="busy" @click="saveEnvironment(environment.config.commandPresetIds.filter((id) => id !== preset.presetId))">从新 Run 移除</ForgeButton>
        </div>
      </li></ul>
      <h3>{{ editing ? `编辑 ${editing.name} v${editing.revision}` : '新建验证命令' }}</h3>
      <ForgeSelect v-model="kind" label="验证类型" :options="[
        {value:'test',label:'test'}, {value:'typecheck',label:'typecheck'},
        {value:'build',label:'build'}, {value:'lint',label:'lint'}]" />
      <ForgeInput v-model="executable" label="可执行文件" placeholder="例如 node" />
      <ForgeTextarea v-model="argvText" label="参数（每行一个，不进行 Shell 拆词）" :rows="3" />
      <ForgeInput v-model="cwdRelative" label="项目内相对工作目录" />
      <ForgeInput v-model="timeoutText" label="超时秒数（1～7200）" />
      <div class="project-actions">
        <ForgeButton variant="secondary" :disabled="busy" @click="savePreset">保存但不批准</ForgeButton>
        <ForgeButton v-if="editing" variant="ghost" :disabled="busy" @click="clearForm">取消编辑</ForgeButton>
      </div>
    </ForgeCard>
    <ForgeDialog v-model:open="approvalOpen" title="批准此项目命令？">
      <template v-if="approvalTarget">
        <p>将来明确启动 Verify 时，此命令可能运行项目代码。此确认只绑定当前脚本哈希和预设版本。</p>
        <dl><dt>类型</dt><dd>{{ approvalTarget.name }}</dd><dt>可执行文件</dt><dd>{{ approvalTarget.executable }}</dd>
          <dt>argv</dt><dd><code>{{ JSON.stringify(approvalTarget.argv) }}</code></dd>
          <dt>工作目录</dt><dd>{{ approvalTarget.cwdRelative }}</dd>
          <dt>超时</dt><dd>{{ approvalTarget.timeoutSeconds }} 秒</dd></dl>
        <label><input v-model="approvalConfirmed" type="checkbox" /> 我已审阅这条命令及项目脚本执行风险。</label>
        <div class="project-actions"><ForgeButton variant="secondary" @click="approvalOpen = false">取消</ForgeButton>
          <ForgeButton variant="primary" :disabled="busy || !approvalConfirmed" @click="approvePreset">批准当前版本</ForgeButton></div>
      </template>
    </ForgeDialog>
  </section>
</template>
