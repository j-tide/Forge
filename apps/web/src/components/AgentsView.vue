<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { AgentProfile, AgentProfileCatalog } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeInput, ForgeSelect, ForgeTextarea, StatusTag } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean }>();
const catalog = ref<AgentProfileCatalog | null>(null);
const loading = ref(false);
const notice = ref('');
const name = ref('');
const role = ref<'developer' | 'reviewer'>('developer');
const executorId = ref('executor.codex');
const modelId = ref('');
const policyProfile = ref('workspace-write');
const prompt = ref('');
const selected = ref<AgentProfile | null>(null);

const executorOptions = computed(() => catalog.value?.executors.map((item) => ({
  value: item.executorId,
  label: item.available ? item.executorId : `${item.executorId} · 未配置/未验收`,
  disabled: !item.available,
})) ?? []);
const currentExecutor = computed(() => catalog.value?.executors.find((item) => item.executorId === executorId.value));
const modelOptions = computed(() => currentExecutor.value?.modelIds.map((id) => ({ value: id, label: id })) ?? []);
const policyOptions = computed(() => role.value === 'reviewer' ? [
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
  name.value = profile.name; role.value = profile.role === 'reviewer' ? 'reviewer' : 'developer';
  executorId.value = profile.executorId; modelId.value = profile.modelId ?? '';
  policyProfile.value = profile.policyProfile; prompt.value = profile.promptTemplate;
}
function newProfile(): void {
  selected.value = null; name.value = ''; role.value = 'developer';
  executorId.value = 'executor.codex'; modelId.value = currentExecutor.value?.modelIds[0] ?? '';
  policyProfile.value = 'workspace-write'; prompt.value = '';
}
async function save(): Promise<void> {
  if (!currentExecutor.value?.available || !modelId.value || !name.value.trim() || !prompt.value.trim()) {
    notice.value = '请选择真实可用的执行器和模型，并填写角色职责。'; return;
  }
  const revision = (selected.value?.revision ?? 0) + 1;
  const id = selected.value?.id ?? `profile.${crypto.randomUUID()}`;
  const profile: AgentProfile = {
    schemaVersion: '1.0', id, revision, name: name.value.trim(), role: role.value,
    executorId: executorId.value, modelId: modelId.value,
    promptTemplate: prompt.value.trim(),
    contextProviders: role.value === 'reviewer' ? ['task-contract', 'snapshot-diff'] : ['task-contract', 'project-context'],
    policyProfile: policyProfile.value as AgentProfile['policyProfile'],
    limits: { maxTurns: 24, maxSeconds: 1800, maxOutputTokens: 12000 },
  };
  try {
    selected.value = await props.client.saveAgentProfile({ profile, expectedRevision: revision - 1 });
    notice.value = 'Profile 版本已保存。启动仍会由 Host 重新检查模型、只读、网络和审批能力。';
    await load();
  } catch { notice.value = '保存失败：Profile 版本冲突、配置无效或 Host 不可用。'; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
watch(role, () => { policyProfile.value = role.value === 'reviewer' ? 'read-only' : 'workspace-write'; });
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
          <StatusTag :tone="executor.available ? 'success' : 'warning'" :label="executor.available ? '可用' : '未配置/未验收'" />
          <small v-if="!executor.available">{{ executor.reason }}</small>
        </div>
        <h2>Model Providers</h2>
        <p>整理器使用独立模型接口；它不具有 Coding Executor 的工作区写入能力。</p>
        <div v-for="provider in catalog.modelProviders" :key="provider.providerId" class="agent-row">
          <strong>{{ provider.providerId }}</strong>
          <StatusTag :tone="provider.available ? 'success' : 'warning'"
            :label="provider.available ? '可用' : '不可用'" />
          <small>结构化输出 {{ provider.structuredOutput ? '可用' : '不可用' }} · 文本流 {{ provider.textStreaming ? '可用' : '不可用' }} · Usage {{ provider.usageReporting ? '可用' : '未验证' }} · Token 上限 {{ provider.tokenLimitEnforced ? '可执行' : '未保障' }}</small>
        </div>
        <h2>已保存 Profile</h2>
        <p v-if="catalog.profiles.length === 0">尚无自定义 Profile；内置开发与 Reviewer 路径继续使用其固定配置。</p>
        <div v-for="profile in catalog.profiles" :key="profile.id" class="agent-row">
          <div><strong>{{ profile.name }}</strong><p>{{ profile.role }} · {{ profile.executorId }} · v{{ profile.revision }}</p></div>
          <StatusTag :tone="catalog.availability.find((item) => item.profileId === profile.id)?.runnable ? 'success' : 'warning'"
            :label="catalog.availability.find((item) => item.profileId === profile.id)?.runnable ? '能力可用' : '不可启动'" />
          <ForgeButton variant="ghost" @click="edit(profile)">编辑</ForgeButton>
        </div>
        <ForgeButton variant="secondary" @click="newProfile">新建 Profile</ForgeButton>
        <div class="agent-form">
          <h2>{{ selected ? `编辑 ${selected.name} · 下一版本` : '新建 Profile' }}</h2>
          <ForgeInput v-model="name" label="名称" />
          <ForgeSelect v-model="role" label="角色" :options="[{ value: 'developer', label: 'Developer' }, { value: 'reviewer', label: 'Reviewer' }]" />
          <ForgeSelect v-model="executorId" label="执行器" :options="executorOptions" />
          <ForgeSelect v-model="modelId" label="模型" :options="modelOptions" :disabled="!currentExecutor?.available" />
          <ForgeSelect v-model="policyProfile" label="权限要求" :options="policyOptions" />
          <ForgeTextarea v-model="prompt" label="角色职责与提示词" :rows="4" :max-height="260" />
          <p>只读、网络限制或审批若无法由执行器实际保障，Host 会拒绝启动；项目信任不代表自动授权工具。</p>
          <ForgeButton variant="primary" :disabled="!currentExecutor?.available" @click="save">保存新版本</ForgeButton>
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
