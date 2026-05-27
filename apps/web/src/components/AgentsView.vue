<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { AgentProfile, AgentProfileCatalog } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeInput, ForgeSelect, ForgeTextarea, StatusTag } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean;
  readOnly?: boolean }>();
const catalog = ref<AgentProfileCatalog | null>(null);
const loading = ref(false);
const notice = ref('');
const name = ref('');
const role = ref<AgentProfile['role']>('developer');
const executorId = ref('executor.codex');
const modelId = ref('');
const policyProfile = ref('workspace-write');
const prompt = ref('');
const maxSeconds = ref('1800');
const maxOutputTokens = ref('12000');
const allowProjectContext = ref(true);
const selected = ref<AgentProfile | null>(null);
const unsupportedRole = computed(() => role.value === 'refiner');
const formReadOnly = computed(() => unsupportedRole.value && selected.value !== null);
const selectedAvailability = computed(() => catalog.value?.availability.find((item) =>
  item.profileId === selected.value?.id));
const roleOptions = [
  { value: 'developer', label: 'Developer' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'planner', label: 'Planner（只读实施计划）' },
  { value: 'refiner', label: 'Refiner（当前仅可查看）', disabled: true },
];

const executorOptions = computed(() => catalog.value?.executors.map((item) => ({
  value: item.executorId,
  label: item.available ? item.executorId : `${item.executorId} · 未配置/未验收`,
  disabled: !item.available,
})) ?? []);
const currentExecutor = computed(() => catalog.value?.executors.find((item) => item.executorId === executorId.value));
const modelOptions = computed(() => currentExecutor.value?.modelIds.map((id) => ({ value: id, label: id })) ?? []);
const policyOptions = computed(() => unsupportedRole.value ? [
  { value: policyProfile.value, label: policyProfile.value },
] : role.value === 'reviewer' || role.value === 'planner' ? [
  { value: 'read-only', label: '只读' },
  { value: 'read-only-no-network', label: '只读且限制网络' },
] : [
  { value: 'workspace-write', label: '隔离工作区写入' },
  { value: 'approval-required', label: '操作需要审批' },
]);

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) { catalog.value = null; return; }
  loading.value = true;
  try {
    catalog.value = await props.client.agentProfileCatalog();
    if (!catalog.value) return;
    const codex = catalog.value.executors.find((item) => item.executorId === 'executor.codex');
    if (codex?.available && !modelId.value) modelId.value = codex.modelIds[0] ?? '';
  } catch { notice.value = '无法读取 Host 中的 Agent Profile。'; }
  finally { loading.value = false; }
}
function edit(profile: AgentProfile): void {
  selected.value = profile;
  name.value = profile.name; role.value = profile.role;
  executorId.value = profile.executorId; modelId.value = profile.modelId ?? '';
  policyProfile.value = profile.policyProfile; prompt.value = profile.promptTemplate;
  maxSeconds.value = String(profile.limits.maxSeconds);
  maxOutputTokens.value = String(profile.limits.maxOutputTokens);
  allowProjectContext.value = profile.contextProviders.includes('project-context');
}
function newProfile(): void {
  selected.value = null; name.value = ''; role.value = 'developer';
  executorId.value = 'executor.codex'; modelId.value = currentExecutor.value?.modelIds[0] ?? '';
  policyProfile.value = 'workspace-write'; prompt.value = ''; maxSeconds.value = '1800';
  maxOutputTokens.value = '12000';
  allowProjectContext.value = true;
}
async function save(): Promise<void> {
  if (props.readOnly) return;
  if (unsupportedRole.value) {
    notice.value = '此角色尚无可运行的 Host 支持，不能从桌面编辑或启动。'; return;
  }
  if (!currentExecutor.value?.available || !modelId.value || !name.value.trim() || !prompt.value.trim()) {
    notice.value = '请选择真实可用的执行器和模型，并填写角色职责。'; return;
  }
  const seconds = Number(maxSeconds.value);
  if (!/^[1-9]\d*$/.test(maxSeconds.value) || !Number.isInteger(seconds) || seconds > 3600) {
    notice.value = '最长运行时间须为 1～3600 秒的整数。'; return;
  }
  const outputTokens = Number(maxOutputTokens.value);
  if (!/^[1-9]\d*$/.test(maxOutputTokens.value) || !Number.isInteger(outputTokens) ||
    outputTokens > 100000) {
    notice.value = '输出 Token 观测上限须为 1～100000 的整数。'; return;
  }
  const revision = (selected.value?.revision ?? 0) + 1;
  const id = selected.value?.id ?? `profile.${crypto.randomUUID()}`;
  const profile: AgentProfile = {
    schemaVersion: '1.0', id, revision, name: name.value.trim(), role: role.value,
    executorId: executorId.value, modelId: modelId.value,
    promptTemplate: prompt.value.trim(),
    contextProviders: role.value === 'reviewer' ? ['task-contract', 'snapshot-diff'] : [
      ...(selected.value?.role === 'developer' ?
        selected.value.contextProviders.filter((item) => item !== 'project-context') : ['task-contract']),
      ...(allowProjectContext.value ? ['project-context'] : []),
    ],
    policyProfile: policyProfile.value as AgentProfile['policyProfile'],
    limits: {
      maxTurns: selected.value?.limits.maxTurns ?? 24,
      maxSeconds: seconds,
      maxOutputTokens: outputTokens,
    },
  };
  try {
    selected.value = await props.client.saveAgentProfile({ profile, expectedRevision: revision - 1 });
    notice.value = 'Profile 版本已保存。启动仍会由 Host 重新检查模型、只读、网络和审批能力。';
    await load();
  } catch { notice.value = '保存失败：Profile 版本冲突、配置无效或 Host 不可用。'; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
watch(role, (value) => {
  if (value !== selected.value?.role && !unsupportedRole.value) {
    policyProfile.value = value === 'reviewer' || value === 'planner'
      ? 'read-only' : 'workspace-write';
    allowProjectContext.value = value === 'developer';
  }
});
watch(executorId, () => { modelId.value = currentExecutor.value?.modelIds[0] ?? ''; });
</script>

<template>
  <section class="agents-view" aria-labelledby="agents-title">
    <p class="eyebrow">FORGE / AGENTS</p><h1 id="agents-title">Agent Profiles</h1>
    <p>角色、执行器、模型与权限分别配置。保存配置不会启动 Agent；运行时 Host 会重新检查能力。</p>
    <ForgeCard tone="reading" class="agents-panel">
      <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 没有本地 Host 或执行器。" />
      <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接 Python Host 后查看真实执行器能力。" />
      <p v-else-if="loading" role="status">正在探测执行器…</p>
      <template v-else-if="catalog">
        <div v-for="executor in catalog.executors" :key="executor.executorId" class="agent-row">
          <strong>{{ executor.executorId }}</strong>
          <StatusTag :tone="!readOnly && executor.available ? 'success' : 'warning'" :label="readOnly ? '历史只读' : executor.available ? '可用' : '未配置/未验收'" />
          <small v-if="!executor.available">{{ executor.reason }}</small>
        </div>
        <h2>Model Providers</h2>
        <p>整理器使用独立模型接口；它不具有 Coding Executor 的工作区写入能力。</p>
        <div v-for="provider in catalog.modelProviders" :key="provider.providerId" class="agent-row">
          <strong>{{ provider.providerId }}</strong>
          <StatusTag :tone="!readOnly && provider.available ? 'success' : 'warning'"
            :label="readOnly ? '历史只读' : provider.available ? '可用' : '不可用'" />
          <small>结构化输出 {{ provider.structuredOutput ? '可用' : '不可用' }} · 文本流 {{ provider.textStreaming ? '可用' : '不可用' }} · Usage {{ provider.usageReporting ? '可用' : '未验证' }} · Token 上限 {{ provider.tokenLimitEnforced ? '可执行' : '未保障' }}</small>
        </div>
        <h2>已保存 Profile</h2>
        <p v-if="catalog.profiles.length === 0">尚无自定义 Profile；内置开发与 Reviewer 路径继续使用其固定配置。</p>
        <div v-for="profile in catalog.profiles" :key="profile.id" class="agent-row">
          <div><strong>{{ profile.name }}</strong><p>{{ profile.role }} · {{ profile.executorId }} · v{{ profile.revision }}</p></div>
          <StatusTag :tone="!readOnly && catalog.availability.find((item) => item.profileId === profile.id)?.runnable ? 'success' : 'warning'"
            :label="readOnly ? '历史只读' : catalog.availability.find((item) => item.profileId === profile.id)?.runnable ? '能力可用' : '不可启动'" />
          <ForgeButton v-if="!readOnly" variant="ghost" @click="edit(profile)">编辑</ForgeButton>
        </div>
        <ForgeButton v-if="!readOnly" variant="secondary" @click="newProfile">新建 Profile</ForgeButton>
        <div v-if="!readOnly" class="agent-form">
          <h2>{{ selected ? `编辑 ${selected.name} · 下一版本` : '新建 Profile' }}</h2>
          <p v-if="formReadOnly" role="status">{{ role }} Profile 只读：{{ selectedAvailability?.reason ?? 'ROLE_UNSUPPORTED' }}。当前 Host 未支持此角色运行，编辑不会改写角色或权限。</p>
          <ForgeInput v-model="name" label="名称" :disabled="formReadOnly" />
          <ForgeSelect v-model="role" label="角色" :options="roleOptions" :disabled="formReadOnly || selected !== null" />
          <p v-if="selected">已保存 Profile 的角色固定；如需其他角色，请新建 Profile。</p>
          <ForgeSelect v-model="executorId" label="执行器" :options="executorOptions" :disabled="formReadOnly" />
          <ForgeSelect v-model="modelId" label="模型" :options="modelOptions" :disabled="formReadOnly || !currentExecutor?.available" />
          <ForgeSelect v-model="policyProfile" label="权限要求" :options="policyOptions" :disabled="formReadOnly" />
          <ForgeTextarea v-model="prompt" label="角色职责与提示词" :rows="4" :max-height="260" :disabled="formReadOnly" />
          <ForgeInput v-model="maxSeconds" label="最长运行时间（秒）" description="新 Run 将冻结此上限；发布的工作流节点可能设有更短上限。" :disabled="formReadOnly" />
          <ForgeInput v-model="maxOutputTokens" label="输出 Token 观测上限" description="Host 收到真实用量事件达到上限后停止 Run；事件可能延迟，不能作为精确费用硬限制。" :disabled="formReadOnly" />
          <label v-if="role === 'developer' || role === 'planner'"><input v-model="allowProjectContext" type="checkbox" :disabled="formReadOnly" /> 允许启动新 Run 时显式检索项目知识与记忆</label>
          <p v-else-if="role === 'reviewer'">Reviewer 固定读取当前 Task Contract 与快照 Diff，不接收项目知识检索。</p>
          <p v-if="role === 'planner'">Planner 在只读隔离工作区读取已批准 Task Contract 和代码基线，输出结构化计划；只有启用并显式检索时才读取项目资料，不能改写源码或验收标准。</p>
          <p>每个开发 Run 只启动一次 provider turn；内部工具循环次数不等于 Profile 回合数。Token/工具调用上限根据实时事件停止，可能超额；请勿将其作为精确费用或安全硬限制。</p>
          <p>只读、网络限制或审批若无法由执行器实际保障，Host 会拒绝启动；项目信任不代表自动授权工具。</p>
          <ForgeButton variant="primary" :disabled="formReadOnly || !currentExecutor?.available" @click="save">保存新版本</ForgeButton>
        </div>
      </template>
      <p v-if="notice" role="status">{{ notice }}</p>
    </ForgeCard>
  </section>
</template>

<style scoped>
.agents-view { padding: var(--forge-space-32); width: 100%; min-width: 0; }
.agents-view > p { color: var(--forge-color-text-secondary); }
.agents-panel { max-width: 900px; padding: var(--forge-space-24); display: grid; gap: var(--forge-space-16); }
.agent-row { display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-16); border-bottom: 1px solid var(--forge-color-line); padding: var(--forge-space-12) 0; }
.agent-row p, .agent-row small { color: var(--forge-color-text-secondary); }
.agent-form { display: grid; gap: var(--forge-space-16); max-width: 620px; }
@media (max-width: 720px) { .agents-view { padding: var(--forge-space-16); } .agent-row { flex-wrap: wrap; } }
</style>
