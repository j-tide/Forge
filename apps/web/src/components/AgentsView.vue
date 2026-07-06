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
const editorOpen = ref(false);
const saving = ref(false);
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
const runnableCount = computed(() => catalog.value?.availability.filter((item) => item.runnable).length ?? 0);
const executorCount = computed(() => catalog.value?.executors.filter((item) => item.available).length ?? 0);
const roleOptions = [
  { value: 'developer', label: 'Developer' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'planner', label: 'Planner（只读实施计划）' },
  { value: 'refiner', label: 'Refiner（当前仅可查看）', disabled: true },
];

const executorOptions = computed(() => {
  const options = catalog.value?.executors.map((item) => ({
    value: item.executorId,
    label: item.available ? item.executorId : `${item.executorId} · 未配置/未验收`,
    disabled: !item.available,
  })) ?? [];
  if (selected.value && !options.some((item) => item.value === selected.value?.executorId)) {
    options.unshift({ value: selected.value.executorId,
      label: `${selected.value.executorId} · 当前不可用`, disabled: true });
  }
  return options;
});
const currentExecutor = computed(() => catalog.value?.executors.find((item) => item.executorId === executorId.value));
const modelOptions = computed(() => {
  const options = currentExecutor.value?.modelIds.map((id) => ({ value: id, label: id,
    disabled: false })) ?? [];
  if (selected.value?.modelId && !options.some((item) => item.value === selected.value?.modelId)) {
    options.unshift({ value: selected.value.modelId,
      label: `${selected.value.modelId} · 当前不可用`, disabled: true });
  }
  return options;
});
const policyOptions = computed(() => unsupportedRole.value ? [
  { value: policyProfile.value, label: policyProfile.value },
] : role.value === 'reviewer' || role.value === 'planner' ? [
  { value: 'read-only', label: '只读' },
  { value: 'read-only-no-network', label: '只读且限制网络' },
] : [
  { value: 'workspace-write', label: '隔离工作区写入' },
  { value: 'approval-required', label: '操作需要审批' },
]);
const policySupported = computed(() => {
  const executor = currentExecutor.value;
  if (!executor?.available) return false;
  if ((role.value === 'reviewer' || role.value === 'planner') && !executor.readOnlyEnforced) return false;
  if (policyProfile.value === 'read-only' && !executor.readOnlyEnforced) return false;
  if (policyProfile.value === 'read-only-no-network' &&
    (!executor.readOnlyEnforced || !executor.networkPolicyEnforced)) return false;
  if (policyProfile.value === 'approval-required' && !executor.approval) return false;
  return true;
});

function roleLabel(value: AgentProfile['role']): string {
  return { refiner: '需求整理', planner: '规划', developer: '开发', reviewer: '审查' }[value];
}
function policyLabel(value: AgentProfile['policyProfile']): string {
  return { 'workspace-write': '隔离工作区写入', 'read-only': '只读',
    'read-only-no-network': '只读且限制网络', 'approval-required': '操作需审批' }[value];
}
function executorLabel(executorId: string): string {
  return { 'executor.codex': 'Codex', 'executor.claude': 'Claude' }[executorId] ?? executorId;
}
function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'Host 尚未确认此配置可启动';
  const labels: Record<string, string> = {
    PROFILE_POLICY_UNSUPPORTED: '角色与权限要求不兼容',
    EXECUTOR_UNAVAILABLE: '执行器未配置或不可用',
    EXECUTOR_MISMATCH: '执行器与角色要求不一致',
    MODEL_UNAVAILABLE: '所选模型当前不可用',
    READ_ONLY_UNENFORCED: '执行器不能保证只读',
    NETWORK_POLICY_UNENFORCED: '执行器不能保证网络限制',
    APPROVAL_UNSUPPORTED: '执行器不支持所需审批',
    STRUCTURED_OUTPUT_UNSUPPORTED: '执行器不支持结构化输出',
    WORKSPACE_UNSUPPORTED: '执行器不能保证工作区隔离',
    ROLE_UNSUPPORTED: '此角色尚未接入运行时',
  };
  return labels[reason] ?? `Host 报告此配置不可用（${reason}）`;
}
function availabilityFor(profile: AgentProfile): AgentProfileCatalog['availability'][number] | undefined {
  return catalog.value?.availability.find((item) => item.profileId === profile.id);
}

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) { catalog.value = null; editorOpen.value = false; return; }
  loading.value = true;
  catalog.value = null;
  try {
    catalog.value = await props.client.agentProfileCatalog();
    if (!catalog.value) return;
    const codex = catalog.value.executors.find((item) => item.executorId === 'executor.codex');
    if (codex?.available && !modelId.value) modelId.value = codex.modelIds[0] ?? '';
  } catch { notice.value = '无法读取 Host 中的 Agent Profile。'; }
  finally { loading.value = false; }
}
function edit(profile: AgentProfile): void {
  notice.value = '';
  editorOpen.value = true;
  selected.value = profile;
  name.value = profile.name; role.value = profile.role;
  executorId.value = profile.executorId; modelId.value = profile.modelId ?? '';
  policyProfile.value = profile.policyProfile; prompt.value = profile.promptTemplate;
  maxSeconds.value = String(profile.limits.maxSeconds);
  maxOutputTokens.value = String(profile.limits.maxOutputTokens);
  allowProjectContext.value = profile.contextProviders.includes('project-context');
}
function newProfile(): void {
  notice.value = '';
  editorOpen.value = true;
  selected.value = null; name.value = ''; role.value = 'developer';
  executorId.value = catalog.value?.executors.find((item) => item.available)?.executorId ?? 'executor.codex';
  modelId.value = currentExecutor.value?.modelIds[0] ?? '';
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
  if (!currentExecutor.value.modelIds.includes(modelId.value)) {
    notice.value = '当前模型不在执行器报告的可用模型列表中，请重新选择。'; return;
  }
  if (!policySupported.value) {
    notice.value = '当前执行器无法保障所选角色或权限要求，请选择兼容配置。'; return;
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
    saving.value = true;
    selected.value = await props.client.saveAgentProfile({ profile, expectedRevision: revision - 1 });
    notice.value = '角色配置已保存。新运行会使用所选工作流绑定的版本。';
    await load();
    editorOpen.value = false;
  } catch { notice.value = '保存失败：版本冲突、配置无效或 Host 不可用。'; }
  finally { saving.value = false; }
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
watch(executorId, (value) => {
  // Opening an existing Profile must never rewrite its saved model implicitly.
  if (selected.value && value === selected.value.executorId) return;
  modelId.value = currentExecutor.value?.modelIds[0] ?? '';
});
</script>

<template>
  <section class="agents-view" aria-labelledby="agents-title">
    <header class="agents-header">
      <div>
        <h1 id="agents-title">Agent 角色</h1>
        <p>为规划、开发和审查分别指定模型与权限，工作流会按阶段使用这些角色。</p>
      </div>
      <ForgeButton v-if="desktop && connected && catalog && !readOnly" variant="primary"
        :disabled="executorCount === 0" @click="newProfile">新建角色</ForgeButton>
      <ForgeButton v-else-if="desktop && connected && !catalog" variant="secondary"
        :disabled="loading" @click="load">重新探测</ForgeButton>
    </header>
    <ForgeCard tone="reading" class="agents-panel"
      :class="{ 'agents-panel-empty': catalog && catalog.profiles.length === 0 && !editorOpen }">
      <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 没有本地 Host 或执行器。" />
      <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接 Python Host 后查看真实执行器能力。" />
      <p v-else-if="loading" role="status">正在探测执行器…</p>
      <template v-else-if="catalog">
        <div class="agents-layout" :class="{ 'agents-layout-editing': editorOpen }">
          <div class="agent-list-section">
            <div v-if="catalog.profiles.length > 0" class="agent-section-heading">
              <div><h2>已配置角色</h2><p>{{ catalog.profiles.length }} 个角色 · {{ runnableCount }} 个可启动</p></div>
            </div>
            <div v-if="catalog.profiles.length === 0" class="agent-empty">
              <div class="agent-empty-copy">
                <h2>还没有创建角色</h2>
                <p v-if="readOnly">当前数据以历史只读方式打开，无法创建角色。</p>
                <p v-else-if="executorCount === 0">当前没有可用执行器。展开下方详情，查看 Host 返回的原因。</p>
                <p v-else>创建第一个角色，为它选择执行器、模型和权限。</p>
              </div>
              <div class="agent-empty-capabilities" role="group" aria-label="Host 报告的执行器状态">
                <div class="agent-empty-capabilities-heading">
                  <span>可用执行器</span>
                  <strong>{{ executorCount }} / {{ catalog.executors.length }} 可用</strong>
                </div>
                <div v-for="executor in catalog.executors" :key="executor.executorId"
                  class="agent-empty-executor">
                  <span :title="executor.executorId">{{ executorLabel(executor.executorId) }}</span>
                  <StatusTag :tone="executor.available && !readOnly ? 'success' : 'warning'"
                    :label="readOnly ? '历史只读' : executor.available ? '可用' : '不可用'" />
                </div>
                <p v-if="catalog.executors.length === 0">Host 未报告执行器。</p>
              </div>
            </div>
            <div v-else class="agent-list" aria-label="已保存的 Agent 角色">
              <article v-for="profile in catalog.profiles" :key="profile.id" class="agent-profile"
                :class="{ 'agent-profile-selected': editorOpen && selected?.id === profile.id }">
                <div class="agent-profile-identity">
                  <span class="agent-role">{{ roleLabel(profile.role) }}</span>
                  <h3>{{ profile.name }}</h3>
                  <p>v{{ profile.revision }} · {{ policyLabel(profile.policyProfile) }}</p>
                </div>
                <div class="agent-profile-runtime">
                  <span><small>执行器</small><strong>{{ profile.executorId }}</strong></span>
                  <span><small>模型</small><strong>{{ profile.modelId ?? '未选择' }}</strong></span>
                </div>
                <div class="agent-profile-action">
                  <StatusTag :tone="!readOnly && availabilityFor(profile)?.runnable ? 'success' : 'warning'"
                    :label="readOnly ? '历史只读' : availabilityFor(profile)?.runnable ? '可启动' : '不可启动'" />
                  <ForgeButton v-if="!readOnly" variant="ghost" @click="edit(profile)">编辑</ForgeButton>
                </div>
                <p v-if="!readOnly && !availabilityFor(profile)?.runnable" class="agent-profile-reason"
                  :title="availabilityFor(profile)?.reason ?? undefined">
                  {{ reasonLabel(availabilityFor(profile)?.reason) }}
                </p>
              </article>
            </div>
            <details class="agent-connections">
              <summary>{{ catalog.profiles.length === 0 ? '查看执行器与模型服务详情' : '执行器与模型服务' }}
                <span v-if="catalog.profiles.length > 0">{{ executorCount }} 个执行器可用</span></summary>
              <div class="agent-connections-content">
                <h3>执行器</h3>
                <div v-for="executor in catalog.executors" :key="executor.executorId" class="agent-connection-row">
                  <strong>{{ executor.executorId }}</strong>
                  <StatusTag :tone="executor.available && !readOnly ? 'success' : 'warning'"
                    :label="readOnly ? '历史只读' : executor.available ? '可用' : '未配置/未验收'" />
                  <small v-if="!executor.available">{{ executor.reason }}</small>
                </div>
                <h3>需求整理模型服务</h3>
                <p>整理模型与 Coding Executor 分开配置；它不能修改项目代码。</p>
                <div v-for="provider in catalog.modelProviders" :key="provider.providerId" class="agent-connection-row">
                  <strong>{{ provider.providerId }}</strong>
                  <StatusTag :tone="provider.available && !readOnly ? 'success' : 'warning'"
                    :label="readOnly ? '历史只读' : provider.available ? '可用' : '不可用'" />
                  <small v-if="!provider.available">{{ provider.reason }}</small>
                  <small v-else>结构化输出 {{ provider.structuredOutput ? '可用' : '不可用' }} · Usage {{ provider.usageReporting ? '可用' : '未验证' }}</small>
                </div>
              </div>
            </details>
          </div>
          <aside v-if="editorOpen && !readOnly" class="agent-editor" aria-label="角色编辑器">
            <div class="agent-editor-header">
              <div><h2>{{ selected ? `编辑 ${selected.name}` : '新建角色' }}</h2>
                <p>保存会创建新版本；已有 Run 保持原有冻结配置。</p></div>
              <ForgeButton variant="ghost" @click="editorOpen = false">关闭编辑</ForgeButton>
            </div>
            <div class="agent-form">
          <p v-if="formReadOnly" role="status">{{ roleLabel(role) }}角色仅供查看：{{ reasonLabel(selectedAvailability?.reason) }}。编辑不会改写角色或权限。</p>
          <ForgeInput v-model="name" label="名称" :disabled="formReadOnly" />
          <ForgeSelect v-model="role" label="角色" :options="roleOptions" :disabled="formReadOnly || selected !== null" />
          <p v-if="selected" class="agent-field-note">已保存角色不可变更；如需其他职责，请新建角色。</p>
          <ForgeSelect v-model="executorId" label="执行器" :options="executorOptions" :disabled="formReadOnly" />
          <ForgeSelect v-model="modelId" label="模型" :options="modelOptions" :disabled="formReadOnly || !currentExecutor?.available" />
          <ForgeSelect v-model="policyProfile" label="权限要求" :options="policyOptions" :disabled="formReadOnly" />
          <p v-if="!policySupported && !formReadOnly" class="agent-policy-warning" role="alert">
            当前执行器无法保障这个角色或权限要求，不能保存为可启动配置。
          </p>
          <ForgeTextarea v-model="prompt" label="角色职责与提示词" :rows="4" :max-height="260" :disabled="formReadOnly" />
          <ForgeInput v-model="maxSeconds" label="最长运行时间（秒）" description="新 Run 将冻结此上限；发布的工作流节点可能设有更短上限。" :disabled="formReadOnly" />
          <ForgeInput v-model="maxOutputTokens" label="输出 Token 观测上限" description="Host 收到真实用量事件达到上限后停止 Run；事件可能延迟，不能作为精确费用硬限制。" :disabled="formReadOnly" />
          <label v-if="role === 'developer' || role === 'planner'"><input v-model="allowProjectContext" type="checkbox" :disabled="formReadOnly" /> 允许启动新 Run 时显式检索项目知识与记忆</label>
          <p v-else-if="role === 'reviewer'" class="agent-field-note">Reviewer 固定读取 Task Contract 与快照 Diff。</p>
          <p v-if="role === 'planner'" class="agent-field-note">Planner 在只读隔离工作区读取已批准 Task Contract 和代码基线，输出结构化计划；不能改写源码或验收标准。</p>
          <details class="agent-safety-details">
            <summary>运行和权限说明</summary>
            <p>每个开发 Run 只启动一次 provider turn；内部工具循环次数不等于 Profile 回合数。Token/工具调用上限根据实时事件停止，可能超额；请勿将其作为精确费用或安全硬限制。</p>
            <p>只读、网络限制或审批若无法由执行器实际保障，Host 会拒绝启动；项目信任不代表自动授权工具。</p>
          </details>
          <ForgeButton variant="primary" :disabled="formReadOnly || !policySupported || !modelId ||
            !currentExecutor?.modelIds.includes(modelId) || saving"
            @click="save">{{ saving ? '正在保存…' : '保存新版本' }}</ForgeButton>
            </div>
          </aside>
        </div>
      </template>
      <ForgeEmptyState v-else title="无法读取角色配置" description="检查 Host 连接后重试。" />
      <p v-if="notice" class="agent-notice" role="status">{{ notice }}</p>
    </ForgeCard>
  </section>
</template>

<style scoped>
.agents-view { padding: var(--forge-space-32); width: 100%; min-width: 0; }
.agents-header { display: flex; align-items: end; justify-content: space-between; gap: var(--forge-space-24); margin-bottom: var(--forge-space-24); }
.agents-header h1 { margin: 0 0 var(--forge-space-8); font-size: var(--forge-font-heading); }
.agents-header p { margin: 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-body); }
.agents-panel { padding: var(--forge-space-24); }
.agents-panel-empty { max-width: 1040px; }
.agent-notice { margin: 0 0 var(--forge-space-16); padding: var(--forge-space-12) var(--forge-space-16); border-radius: var(--forge-radius-md); background: var(--forge-surface-elevated); color: var(--forge-color-text); }
.agents-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--forge-space-24); }
.agents-layout-editing { grid-template-columns: minmax(0, 1fr) minmax(360px, 440px); }
.agent-list-section { min-width: 0; }
.agent-section-heading { display: flex; justify-content: space-between; align-items: end; padding-bottom: var(--forge-space-16); }
.agent-section-heading h2 { font-size: var(--forge-font-heading); margin: 0 0 var(--forge-space-4); }
.agent-section-heading p { margin: 0; color: var(--forge-color-text-secondary); }
.agent-list { display: grid; gap: var(--forge-space-12); }
.agent-profile { display: grid; grid-template-columns: minmax(170px, 1.2fr) minmax(220px, 1fr) auto; gap: var(--forge-space-20); align-items: center; padding: var(--forge-space-20); border: 1px solid var(--forge-color-line); border-radius: var(--forge-radius-lg); background: var(--forge-surface-panel); }
.agent-profile-selected { border-color: var(--forge-color-accent); }
.agent-profile-identity, .agent-profile-runtime { min-width: 0; }
.agent-profile h3 { margin: var(--forge-space-8) 0 var(--forge-space-4); font-size: var(--forge-font-body); }
.agent-profile p { margin: 0; color: var(--forge-color-text-secondary); }
.agent-role { display: inline-flex; padding: var(--forge-space-4) var(--forge-space-8); border-radius: var(--forge-radius-pill); background: var(--forge-surface-elevated); font-size: var(--forge-font-small); color: var(--forge-color-text-secondary); }
.agent-profile-runtime { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--forge-space-12); }
.agent-profile-runtime span { min-width: 0; display: grid; gap: var(--forge-space-4); }
.agent-profile-runtime small { color: var(--forge-color-text-muted); }
.agent-profile-runtime strong { overflow-wrap: anywhere; font-size: var(--forge-font-small); }
.agent-profile-action { display: flex; align-items: center; gap: var(--forge-space-8); }
.agent-profile-reason { grid-column: 1 / -1; font-size: var(--forge-font-small); }
.agent-empty { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 280px); gap: var(--forge-space-32); align-items: center; padding: var(--forge-space-12) 0; }
.agent-empty-copy { max-width: 490px; }
.agent-empty h2 { margin: 0 0 var(--forge-space-8); font-size: 24px; letter-spacing: -.025em; }
.agent-empty p { max-width: 40ch; margin: 0; color: var(--forge-color-text-secondary); line-height: 1.55; }
.agent-empty-capabilities { padding-left: var(--forge-space-24); border-left: 1px solid var(--forge-color-line); }
.agent-empty-capabilities-heading, .agent-empty-executor { display: flex; justify-content: space-between; align-items: center; gap: var(--forge-space-12); }
.agent-empty-capabilities-heading { margin-bottom: var(--forge-space-8); color: var(--forge-color-text-secondary); font-size: var(--forge-font-small); }
.agent-empty-capabilities-heading strong { color: var(--forge-color-text); font-weight: 600; }
.agent-empty-executor { padding: var(--forge-space-8) 0; border-top: 1px solid var(--forge-color-line); font-size: var(--forge-font-small); }
.agent-empty-executor span { overflow-wrap: anywhere; }
.agent-connections { margin-top: var(--forge-space-24); padding-top: var(--forge-space-20); border-top: 1px solid var(--forge-color-line); }
.agent-connections summary, .agent-safety-details summary { cursor: pointer; font-weight: 600; }
.agent-connections summary span { margin-left: var(--forge-space-8); font-weight: 400; color: var(--forge-color-text-secondary); }
.agent-connections-content { padding-top: var(--forge-space-16); display: grid; gap: var(--forge-space-12); }
.agent-connections-content h3 { margin: var(--forge-space-12) 0 0; }
.agent-connections-content p { margin: 0; color: var(--forge-color-text-secondary); }
.agent-connection-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--forge-space-12); }
.agent-connection-row small { color: var(--forge-color-text-secondary); }
.agent-editor { min-width: 0; padding: var(--forge-space-24); border: 1px solid var(--forge-color-line); border-radius: var(--forge-radius-lg); background: var(--forge-surface-elevated); }
.agent-editor-header { display: flex; align-items: start; justify-content: space-between; gap: var(--forge-space-12); margin-bottom: var(--forge-space-24); }
.agent-editor-header h2 { margin: var(--forge-space-8) 0 var(--forge-space-4); }
.agent-editor-header p, .agent-field-note { margin: 0; color: var(--forge-color-text-secondary); }
.agent-form { display: grid; gap: var(--forge-space-16); }
.agent-form > label { display: flex; align-items: start; gap: var(--forge-space-8); }
.agent-policy-warning { margin: 0; color: var(--forge-color-danger); }
.agent-safety-details { color: var(--forge-color-text-secondary); }
.agent-safety-details p { margin: var(--forge-space-12) 0 0; }
@media (max-width: 1200px) { .agents-layout-editing { grid-template-columns: minmax(0, 1fr); } .agent-profile { grid-template-columns: minmax(140px, 1fr) minmax(190px, 1fr) auto; } }
@media (max-width: 720px) { .agents-view { padding: var(--forge-space-16); } .agents-header { align-items: start; flex-direction: column; } .agent-empty { grid-template-columns: minmax(0, 1fr); gap: var(--forge-space-20); } .agent-empty-capabilities { padding-left: 0; border-left: 0; } .agent-profile { grid-template-columns: minmax(0, 1fr); gap: var(--forge-space-12); } .agent-profile-action { justify-content: space-between; } .agent-editor { padding: var(--forge-space-16); } }
</style>
