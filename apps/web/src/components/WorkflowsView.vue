<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, toRaw, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { AgentProfileCatalog, WorkflowCompile, WorkflowImpact, WorkflowNode, WorkflowRecord,
  WorkflowTemplate } from '@forge/contracts';
import { workflowTemplateSchema } from '@forge/contracts';
import { ForgeButton, ForgeEmptyState, ForgeInput, ForgeSelect, ForgeTextarea,
  StatusTag } from '@forge/ui';
import { defaultCanvasLayout, exportCanvasDocument, importCanvasDocument,
  validateCanvasLayout, type CanvasLayout } from '../workflow-canvas-document';
import { clearUnsavedWorkflow, getUnsavedWorkflow, setUnsavedWorkflow } from '../workflow-draft-session';
import { diffWorkflowDefinitions, type WorkflowDifference } from '../workflow-diff';

const WorkflowCanvas = defineAsyncComponent(() => import('./WorkflowCanvas.vue'));

const copyJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean;
  readOnly?: boolean }>();
const clientKey = toRaw(props.client);
const presets = ref<WorkflowTemplate[]>([]);
const records = ref<WorkflowRecord[]>([]);
const profiles = ref<AgentProfileCatalog | null>(null);
const draft = ref<WorkflowTemplate | null>(null);
const currentRecord = ref<WorkflowRecord | null>(null);
const compiled = ref<WorkflowCompile | null>(null);
const impact = ref<WorkflowImpact | null>(null);
const compareRevision = ref('');
const versionChanges = ref<WorkflowDifference[] | null>(null);
const comparisonError = ref('');
const comparisonBusy = ref(false);
const dirty = ref(false);
const busy = ref(false);
const notice = ref('');
const canvasOpen = ref(false);
const canvasLayout = ref<CanvasLayout>({ nodes: [] });
const canvasJson = ref('');
const selectedNodeId = ref('');
const hostId = (): string | null => props.client.status?.info?.hostId ?? null;
const restored = getUnsavedWorkflow(clientKey);
const editorHostId = ref(hostId() ?? restored?.hostId ?? null);
if (restored && (!restored.hostId || !hostId() || restored.hostId === hostId())) {
  draft.value = restored.draft;
  currentRecord.value = restored.record;
  canvasLayout.value = restored.layout;
  canvasJson.value = restored.canvasJson;
  canvasOpen.value = restored.canvasOpen;
  selectedNodeId.value = restored.selectedNodeId;
  dirty.value = true;
  notice.value = '未保存的更改已在当前窗口恢复；保存草稿后才会写入 Host。';
} else if (restored) {
  clearUnsavedWorkflow(clientKey);
  editorHostId.value = hostId();
  notice.value = 'Host 会话已变更，未载入先前会话的未保存草稿。';
}
function confirmSwitch(): boolean {
  if (!dirty.value) return true;
  return window.confirm('当前工作流有未保存的更改。切换流程会丢弃这些更改，确定继续吗？');
}
const agentRole = (node: WorkflowNode): 'planner' | 'developer' | 'reviewer' =>
  node.outputSchema === 'plan-result' ? 'planner'
    : node.boardColumn === 'review' ? 'reviewer' : 'developer';
const roleNames = { planner: '计划', developer: '开发', reviewer: '审查', refiner: '需求整理' };
const policyNames: Record<string, string> = {
  'workspace-write': '隔离工作区写入', 'read-only': '只读',
  'read-only-no-network': '只读 · 限制网络', 'approval-required': '操作需审批',
};
const capabilityReasons: Record<string, string> = {
  EXECUTOR_UNAVAILABLE: '执行器未就绪', EXECUTOR_MISMATCH: '执行器不匹配',
  MODEL_UNAVAILABLE: '模型不可用', READ_ONLY_UNENFORCED: '无法保证只读',
  NETWORK_POLICY_UNENFORCED: '无法限制网络', APPROVAL_UNSUPPORTED: '不支持操作审批',
  STRUCTURED_OUTPUT_UNSUPPORTED: '不支持结构化输出', WORKSPACE_UNSUPPORTED: '不支持隔离工作区',
  ROLE_UNSUPPORTED: '尚不支持此职责', PROFILE_POLICY_UNSUPPORTED: '不支持此权限',
};
const presetName = (preset: WorkflowTemplate): string => ({
  quick: '快速流程', standard: '标准流程', strict: '严格流程',
})[preset.id] ?? preset.name;
const stageName = (node: WorkflowNode): string => node.kind === 'agent'
  ? roleNames[agentRole(node)] : node.label;
const presetSummary = (preset: WorkflowTemplate): string => preset.nodes.map(stageName).join(' → ');
const executorName = (id: string): string => ({
  'executor.codex': 'Codex', 'executor.claude': 'Claude',
})[id] ?? id;
const team = computed(() => (draft.value?.nodes ?? []).map((node) => {
  const profile = profiles.value?.profiles.find((item) => item.id === node.binding);
  const executor = profiles.value?.executors.find((item) => item.executorId === profile?.executorId);
  const available = profiles.value?.availability.find((item) => item.profileId === profile?.id &&
    item.revision === profile?.revision && item.executorId === profile?.executorId &&
    item.modelId === profile?.modelId);
  let status = node.kind === 'approval' ? '人工决定' : '运行时检查';
  let reason = '';
  let tone: 'neutral' | 'info' | 'warning' = 'neutral';
  if (node.kind === 'agent') {
    if (!profile) { status = '未配置'; reason = '选择此阶段的角色配置'; }
    else if (profile.role !== agentRole(node)) { status = '职责不匹配'; reason = '请选择匹配此阶段的角色'; }
    else if (!executor?.available) { status = '执行器未就绪'; reason = executor?.reason ?? '未安装或尚未配置'; }
    else if (!profile.modelId || !executor.modelIds.includes(profile.modelId)) { status = '模型不可用'; }
    else if (node.readOnly && !executor.readOnlyEnforced) { status = '无法保证只读'; }
    else if (!available?.runnable) {
      status = capabilityReasons[available?.reason ?? ''] ?? '能力未确认';
      reason = available?.reason ?? '需要重新检查能力';
    } else { status = '能力可用'; tone = 'info'; }
    if (tone !== 'info') tone = 'warning';
  }
  return { node, profile, status, reason, tone,
    role: node.kind === 'agent' ? roleNames[agentRole(node)] : node.kind === 'approval' ? '人工' : '验证',
    owner: profile?.name ?? (node.kind === 'approval' ? '项目负责人'
      : node.kind === 'verifier' ? '项目命令预设' : node.kind === 'agent' ? '选择角色配置' : node.binding),
    engine: profile ? `${executorName(profile.executorId)} · ${profile.modelId ?? '未选择模型'}`
      : node.kind === 'agent' ? '尚未配置执行器与模型' : '',
    permission: profile ? policyNames[profile.policyProfile] ?? '权限未配置'
      : node.kind === 'approval' ? '手动确认' : node.kind === 'agent'
        ? node.readOnly ? '要求只读' : '需要工作区写入' : '按项目命令权限执行',
  };
}));
const mixedExecutors = computed(() => new Set(team.value.flatMap((item) =>
  item.profile ? [item.profile.executorId] : [])).size > 1);
const profileOptions = (node: WorkflowNode): { value: string; label: string }[] => {
  const role = agentRole(node);
  const options = (profiles.value?.profiles ?? []).filter((item) => item.role === role).map((item) => ({
    value: item.id,
    label: `${item.name} · ${executorName(item.executorId)} · ${item.modelId ?? '未选模型'} · v${item.revision}${profiles.value?.availability.find(
      (value) => value.profileId === item.id,
    )?.runnable ? '' : ' · 当前不可启动'}`,
  }));
  if (node.binding !== 'profile.unbound' && !options.some((item) => item.value === node.binding)) {
    options.unshift({ value: node.binding, label: `${node.binding} · 当前未安装` });
  }
  return options;
};

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) {
    presets.value = []; records.value = []; profiles.value = null; return;
  }
  const activeHostId = hostId();
  if (activeHostId && editorHostId.value && activeHostId !== editorHostId.value) {
    draft.value = null; currentRecord.value = null; dirty.value = false;
    clearUnsavedWorkflow(clientKey);
    notice.value = 'Host 会话已变更，未载入先前会话的未保存草稿。';
  }
  if (activeHostId) editorHostId.value = activeHostId;
  busy.value = true;
  try {
    [presets.value, records.value, profiles.value] = await Promise.all([
      props.client.workflowPresets(), props.client.listWorkflows(), props.client.agentProfileCatalog(),
    ]);
  } catch { notice.value = '无法读取 Host 的 Workflow 定义。'; }
  finally { busy.value = false; }
}
function selectRecord(id: string): void {
  if (currentRecord.value?.workflowId === id || !confirmSwitch()) return;
  const record = records.value.find((item) => item.workflowId === id);
  if (!record) return;
  clearUnsavedWorkflow(clientKey);
  currentRecord.value = record;
  draft.value = workflowTemplateSchema.parse(record.draft);
  restoreLayout(draft.value);
  compiled.value = null; dirty.value = false; notice.value = '';
  void refreshImpact(id);
}
async function refreshImpact(workflowId: string): Promise<void> {
  impact.value = null;
  try {
    const result = await props.client.workflowImpact(workflowId);
    if (currentRecord.value?.workflowId === workflowId) {
      impact.value = result;
      compareRevision.value = String(result.publishedRevisions.at(-2) ?? '');
      await loadComparison();
    }
  } catch { /* A draft remains editable while read-only impact diagnostics are unavailable. */ }
}
async function loadComparison(): Promise<void> {
  const workflowId = currentRecord.value?.workflowId;
  const latest = impact.value?.publishedRevision;
  const older = Number(compareRevision.value);
  versionChanges.value = null;
  comparisonError.value = '';
  if (!workflowId || !latest || !older || older >= latest) return;
  comparisonBusy.value = true;
  try {
    const [before, after] = await Promise.all([
      props.client.getPublishedWorkflow(workflowId, older),
      props.client.getPublishedWorkflow(workflowId, latest),
    ]);
    if (currentRecord.value?.workflowId !== workflowId || impact.value?.publishedRevision !== latest ||
      Number(compareRevision.value) !== older) return;
    if (before.workflowId !== workflowId || after.workflowId !== workflowId ||
      before.revision !== older || after.revision !== latest) throw new Error('WORKFLOW_VERSION_MISMATCH');
    versionChanges.value = diffWorkflowDefinitions(before.definition, after.definition);
  } catch { comparisonError.value = '无法读取已发布版本差异；旧 Run 的冻结配置不会更改。'; }
  finally { comparisonBusy.value = false; }
}
function fromPreset(preset: WorkflowTemplate): void {
  if (!confirmSwitch()) return;
  clearUnsavedWorkflow(clientKey);
  const copy = workflowTemplateSchema.parse(preset);
  copy.id = `workflow.${crypto.randomUUID()}`;
  copy.revision = 1;
  draft.value = copy; currentRecord.value = null; compiled.value = null;
  impact.value = null;
  versionChanges.value = null;
  canvasLayout.value = defaultCanvasLayout(copy); canvasJson.value = '';
  dirty.value = true; notice.value = '选择各阶段的角色配置，然后保存。';
}
function normalize(): void {
  if (!draft.value) return;
  const nodes = draft.value.nodes;
  draft.value.start = nodes[0]?.id ?? '';
  draft.value.edges = nodes.slice(0, -1).map((node, index) => ({
    from: node.id, to: nodes[index + 1]!.id,
    on: node.kind === 'verifier' || node.kind === 'command' ? 'passed'
      : node.kind === 'approval' ? 'approved'
        : node.boardColumn === 'review' ? 'approved' : 'ready',
  }));
  const ids = new Set(nodes.map((node) => node.id));
  draft.value.rework = draft.value.rework.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  draft.value.maxTotalAttempts = Math.max(draft.value.maxTotalAttempts, nodes.length + 1);
  const positions = new Map(canvasLayout.value.nodes.map((item) => [item.id, item]));
  canvasLayout.value = { nodes: defaultCanvasLayout(draft.value).nodes.map((item) =>
    positions.get(item.id) ?? item) };
  dirty.value = true; compiled.value = null;
}
function restoreLayout(value: WorkflowTemplate): void {
  const stored = localStorage.getItem(`forge.workflow.layout.${value.id}`);
  if (stored) {
    try {
      canvasLayout.value = validateCanvasLayout(value, JSON.parse(stored) as CanvasLayout);
      return;
    } catch { /* Discard only malformed visual positions, not the Host definition. */ }
  }
  canvasLayout.value = defaultCanvasLayout(value);
}
function updateLayout(value: CanvasLayout): void {
  if (!draft.value) return;
  canvasLayout.value = validateCanvasLayout(draft.value, value);
  try { localStorage.setItem(`forge.workflow.layout.${draft.value.id}`,
    JSON.stringify(canvasLayout.value)); }
  catch { notice.value = '画布布局仅保留在当前窗口；Workflow 语义草稿未受影响。'; }
}
function exportCanvas(): void {
  if (!draft.value) return;
  canvasJson.value = exportCanvasDocument(draft.value, canvasLayout.value);
  notice.value = '已生成包含语义与独立布局的 JSON。可复制到文件；没有上传或执行。';
}
function importCanvas(): void {
  try {
    const imported = importCanvasDocument(canvasJson.value);
    if (!imported.definition.id.startsWith('workflow.')) throw new Error('CANVAS_WORKFLOW_ID_INVALID');
    if (currentRecord.value && currentRecord.value.workflowId !== imported.definition.id) {
      throw new Error('CANVAS_OPEN_MATCHING_DRAFT_FIRST');
    }
    if (!currentRecord.value && records.value.some((record) =>
      record.workflowId === imported.definition.id)) {
      throw new Error('CANVAS_OPEN_MATCHING_DRAFT_FIRST');
    }
    draft.value = imported.definition;
    canvasLayout.value = imported.layout;
    compiled.value = null; dirty.value = true;
    notice.value = '已导入到未保存草稿；请检查结构与能力后再保存或发布。';
  } catch (caught) {
    notice.value = caught instanceof Error && caught.message === 'WORKFLOW_DSL_VERSION_UNSUPPORTED'
      ? '导入失败：此 Workflow DSL 版本与当前 Forge 不兼容；请使用 schemaVersion 1.0。'
      : '导入失败：JSON 格式、Workflow ID、节点布局或当前草稿不匹配。';
  }
}
function move(index: number, direction: number): void {
  if (!draft.value || index + direction < 0 || index + direction >= draft.value.nodes.length - 1) return;
  const nodes = draft.value.nodes;
  [nodes[index], nodes[index + direction]] = [nodes[index + direction]!, nodes[index]!];
  normalize();
}
function remove(index: number): void {
  if (!draft.value || index === draft.value.nodes.length - 1) return;
  draft.value.nodes.splice(index, 1); normalize();
}
function add(kind: 'agent' | 'verifier'): void {
  if (!draft.value || draft.value.nodes.length >= 64) return;
  const id = `step-${crypto.randomUUID().slice(0, 8)}`;
  const node: WorkflowNode = kind === 'agent' ? {
    id, kind, label: '新开发步骤', boardColumn: 'development', binding: 'profile.unbound',
    requiredCapabilities: ['structuredOutput'], inputs: ['task'], outputSchema: 'step-result',
    timeoutSeconds: 1800, retryLimit: 1, readOnly: false,
  } : {
    id, kind, label: '项目验证', boardColumn: 'verify',
    binding: 'verifier.project-checks', requiredCapabilities: [],
    inputs: ['task', 'snapshot'], outputSchema: 'step-result',
    timeoutSeconds: 600, retryLimit: 1, readOnly: true,
  };
  draft.value.nodes.splice(draft.value.nodes.length - 1, 0, node); normalize();
}
function setRole(node: WorkflowNode, role: string): void {
  node.boardColumn = role === 'reviewer' ? 'review' : 'development';
  node.readOnly = role !== 'developer';
  node.inputs = role === 'reviewer' ? ['task', 'snapshot', 'diff']
    : role === 'planner' ? ['task', 'repo'] : ['task'];
  node.outputSchema = role === 'planner' ? 'plan-result' : 'step-result';
  node.binding = 'profile.unbound'; dirty.value = true; compiled.value = null;
  normalize();
}
function setFailure(node: WorkflowNode, target: string): void {
  if (!draft.value) return;
  draft.value.rework = draft.value.rework.filter((edge) => edge.from !== node.id);
  if (target) draft.value.rework.push({
    from: node.id, on: node.kind === 'verifier' ? 'failed'
      : node.boardColumn === 'review' ? 'needs_changes' : 'failed',
    to: target, maxCycles: 2, invalidateDescendants: true,
  });
  dirty.value = true; compiled.value = null;
}
async function preflight(): Promise<void> {
  if (!draft.value) return;
  busy.value = true;
  try { compiled.value = await props.client.compileWorkflow(
    draft.value, currentRecord.value?.draftRevision ?? 0,
  ); notice.value = compiled.value.launchable ? '能力检查通过，可以发布。' : '请处理检查结果中的问题；草稿仍可保存。'; }
  catch { notice.value = '预检失败：Host 不可用或定义格式无效。'; }
  finally { busy.value = false; }
}
async function save(): Promise<void> {
  if (!draft.value) return;
  busy.value = true;
  try {
    const expected = currentRecord.value?.draftRevision ?? 0;
    const candidate = workflowTemplateSchema.parse(draft.value);
    candidate.revision = expected + 1;
    const result = await props.client.saveWorkflow(candidate, expected);
    currentRecord.value = result.record; draft.value = workflowTemplateSchema.parse(result.record.draft);
    compiled.value = result.compiled; dirty.value = false;
    clearUnsavedWorkflow(clientKey);
    records.value = await props.client.listWorkflows();
    await refreshImpact(result.record.workflowId);
    notice.value = '草稿已保存，可检查后发布。';
  } catch { notice.value = '草稿保存失败：版本冲突、字段无效或 Host 不可用。'; }
  finally { busy.value = false; }
}
async function publish(): Promise<void> {
  if (!currentRecord.value || dirty.value) return;
  busy.value = true;
  try {
    const result = await props.client.publishWorkflow(
      currentRecord.value.workflowId, currentRecord.value.draftRevision,
    );
    currentRecord.value = result.record; compiled.value = result.compiled;
    records.value = await props.client.listWorkflows();
    await refreshImpact(result.record.workflowId);
    notice.value = result.compiled.launchable
      ? '版本已发布，新任务可以选择此流程。'
      : '发布未通过，请处理检查结果中的问题。';
  } catch { notice.value = '发布失败：Host 不可用或草稿版本已变更。'; }
  finally { busy.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
onUnmounted(() => {
  if (!dirty.value || !draft.value) {
    clearUnsavedWorkflow(clientKey);
    return;
  }
  setUnsavedWorkflow(clientKey, {
    hostId: editorHostId.value, draft: copyJson(draft.value),
    record: currentRecord.value ? copyJson(currentRecord.value) : null,
    layout: copyJson(canvasLayout.value), canvasJson: canvasJson.value,
    canvasOpen: canvasOpen.value, selectedNodeId: selectedNodeId.value,
  });
});
</script>

<template>
  <section class="workflows-view" aria-labelledby="workflows-title">
    <header class="workflow-page-header">
      <div><h1 id="workflows-title">工作流</h1><p>安排每个阶段由谁负责，以及如何交接。</p></div>
      <span v-if="busy" role="status" class="workflow-loading">正在读取或检查…</span>
    </header>
    <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="请在桌面应用中配置工作流。" />
    <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接恢复后即可继续编辑。" />
    <div v-else class="workflow-workbench">
      <aside class="workflow-library" aria-label="工作流列表">
        <section class="workflow-library-group">
          <h2>我的工作流 <span>{{ records.length }}</span></h2>
          <p v-if="!records.length" class="library-empty">在右侧选择模板，保存后会出现在这里。</p>
          <button v-for="record in records" :key="record.workflowId" type="button"
            class="workflow-library-item workflow-record" :aria-current="currentRecord?.workflowId === record.workflowId ? 'true' : undefined"
            @click="selectRecord(record.workflowId)">
            <strong>{{ record.draft.name }}</strong>
            <span>{{ record.publishedRevision ? `已发布 v${record.publishedRevision}` : '草稿' }} · {{ record.draft.nodes.length }} 个阶段</span>
          </button>
        </section>
        <section v-if="!readOnly && (records.length > 0 || draft)" class="workflow-library-group">
          <h2>从模板新建</h2>
          <button v-for="preset in presets" :key="preset.id" type="button" class="workflow-library-item workflow-preset"
            :aria-label="`从${presetName(preset)}新建`" @click="fromPreset(preset)">
            <strong>{{ presetName(preset) }} <span aria-hidden="true">＋</span></strong>
            <span>{{ presetSummary(preset) }}</span>
          </button>
        </section>
      </aside>
      <main class="workflow-main" aria-label="工作流配置">
        <template v-if="draft">
          <header class="workflow-definition-header">
            <div><h2>{{ draft.name }}</h2><p>{{ draft.nodes.length }} 个阶段 · {{ draft.nodes.filter((node) => node.kind === 'agent').length }} 个 Agent 角色</p></div>
            <div class="workflow-version-status">
              <StatusTag v-if="readOnly" tone="neutral" label="历史只读" />
              <StatusTag :tone="dirty ? 'warning' : currentRecord?.publishedRevision ? 'info' : 'neutral'"
                :label="dirty ? '未保存' : currentRecord?.publishedRevision ? `已发布 v${currentRecord.publishedRevision}` : '未发布草稿'" />
              <span v-if="currentRecord">草稿 v{{ currentRecord.draftRevision }}</span>
            </div>
          </header>
          <div class="workflow-scroll">
            <section class="workflow-team" aria-label="阶段与执行团队">
              <div class="section-heading"><h3>执行阶段</h3><span>点击阶段调整配置</span></div>
              <p v-if="mixedExecutors" role="alert" class="workflow-compatibility">当前 Host 尚不支持在同一流程中混用执行器。各阶段配置可保留，运行前仍需通过能力检查。</p>
              <ol class="workflow-nodes">
                <li v-for="(member, index) in team" :key="member.node.id" class="workflow-node">
                  <details :open="selectedNodeId === member.node.id" @toggle="selectedNodeId === member.node.id && !($event.target as HTMLDetailsElement).open ? selectedNodeId = '' : undefined">
                    <summary class="stage-summary">
                      <span class="stage-number">{{ index + 1 }}</span>
                      <span class="stage-heading"><strong>{{ member.node.label }}</strong><span>{{ member.role }} · {{ member.permission }}</span></span>
                      <span class="stage-assignment"><strong>{{ member.owner }}<small v-if="member.profile"> v{{ member.profile.revision }}</small></strong><span v-if="member.engine">{{ member.engine }}</span></span>
                      <StatusTag :tone="readOnly ? 'neutral' : member.tone" :label="readOnly ? '当前配置' : member.status" />
                      <span class="stage-chevron" aria-hidden="true">⌄</span>
                    </summary>
                    <div v-if="readOnly" class="stage-editor"><p>此流程当前只读。</p></div>
                    <div v-else class="stage-editor">
                      <p v-if="member.reason" class="stage-reason">{{ member.reason }}</p>
                      <ForgeInput v-model="member.node.label" :label="`步骤 ${index + 1} 名称`" @update:model-value="dirty = true" />
                      <div v-if="member.node.kind === 'agent'" class="stage-fields">
                        <ForgeSelect :model-value="agentRole(member.node)" label="职责"
                          :options="[{ value: 'planner', label: '计划（只读）' }, { value: 'developer', label: '开发' }, { value: 'reviewer', label: '审查（只读）' }]"
                          @update:model-value="setRole(member.node, $event)" />
                        <ForgeSelect v-model="member.node.binding" label="角色配置"
                          :options="[{ value: 'profile.unbound', label: '选择角色配置' }, ...profileOptions(member.node)]"
                          @update:model-value="dirty = true; compiled = null" />
                      </div>
                      <p v-else class="stage-explanation">{{ member.node.kind === 'approval' ? '由项目负责人确认结果。' : '使用项目已配置的验证命令。' }}</p>
                      <ForgeSelect v-if="member.node.kind === 'agent' || member.node.kind === 'verifier'"
                        :model-value="draft.rework.find((edge) => edge.from === member.node.id)?.to ?? ''" label="失败后"
                        :options="[{ value: '', label: '交给我处理' }, ...draft.nodes.slice(0, index)
                          .filter((target) => target.kind === 'agent' && target.boardColumn === 'development')
                          .map((target) => ({ value: target.id, label: `返工至 ${target.label}（最多 2 次）` }))]"
                        @update:model-value="setFailure(member.node, $event)" />
                      <div v-if="index < draft.nodes.length - 1" class="node-actions">
                        <ForgeButton size="sm" variant="ghost" :disabled="index === 0" @click="move(index, -1)">上移</ForgeButton>
                        <ForgeButton size="sm" variant="ghost" :disabled="index >= draft.nodes.length - 2" @click="move(index, 1)">下移</ForgeButton>
                        <ForgeButton size="sm" variant="ghost" @click="remove(index)">删除步骤</ForgeButton>
                      </div>
                    </div>
                  </details>
                </li>
              </ol>
              <div v-if="!readOnly" class="workflow-actions add-stage-actions">
                <ForgeButton size="sm" variant="ghost" @click="add('agent')">＋ Agent 阶段</ForgeButton>
                <ForgeButton size="sm" variant="ghost" @click="add('verifier')">＋ 验证阶段</ForgeButton>
                <span>最终验收由你确认</span>
              </div>
            </section>
            <details v-if="!readOnly" class="workflow-detail-section">
              <summary>流程设置</summary>
              <div class="workflow-detail-body"><ForgeInput v-model="draft.name" label="流程名称" @update:model-value="dirty = true" /><p class="workflow-note">末尾人工验收门禁不可删除。各角色独立使用自己的职责、上下文与权限。</p></div>
            </details>
            <details v-if="impact" class="workflow-detail-section workflow-impact" aria-label="版本影响预览">
              <summary>版本记录 <span>{{ impact.publishedRevision ? `已发布 v${impact.publishedRevision}` : '尚未发布' }}</span></summary>
              <div class="workflow-detail-body">
                <p v-if="dirty">未保存的更改尚未计入版本记录。</p>
                <p>{{ impact.draftChangedSincePublish ? '草稿包含未发布的更改。' : '已保存草稿与已发布版本一致。' }}</p>
                <p>新 Run 必须明确选择已发布版本；正在运行的任务保留原版本。</p>
                <p>已有冻结 Run：{{ Object.entries(impact.frozenRunCounts).length ? Object.entries(impact.frozenRunCounts).map(([revision, count]) => `v${revision}：${count}`).join('、') : '无' }}。</p>
                <section v-if="impact.publishedRevisions.length > 1" class="workflow-version-diff" aria-label="已发布版本差异">
                  <strong>已发布版本差异</strong>
                  <ForgeSelect v-model="compareRevision" label="比较旧版" :options="impact.publishedRevisions.slice(0, -1).map((revision) => ({ value: String(revision), label: `v${revision}` }))" @update:model-value="loadComparison" />
                  <p v-if="comparisonBusy" role="status">正在读取已发布版本…</p>
                  <p v-if="comparisonError" role="alert">{{ comparisonError }}</p>
                  <p v-else-if="versionChanges && !versionChanges.length">两个版本的可见定义相同。</p>
                  <dl v-else-if="versionChanges" class="workflow-diff-list"><template v-for="change in versionChanges" :key="change.field"><dt>{{ change.field }}</dt><dd><span>v{{ compareRevision }}：{{ change.before }}</span><span>v{{ impact.publishedRevision }}：{{ change.after }}</span></dd></template></dl>
                </section>
                <p class="workflow-note">ID：{{ draft.id }}</p>
              </div>
            </details>
            <details v-if="!readOnly" class="workflow-detail-section">
              <summary>高级：画布与导入导出</summary>
              <div class="workflow-detail-body">
                <ForgeButton size="sm" variant="secondary" @click="canvasOpen = !canvasOpen">{{ canvasOpen ? '收起高级画布' : '打开高级画布' }}</ForgeButton>
                <section v-if="canvasOpen" aria-label="高级画布编辑" class="canvas-panel">
                  <p>画布显示同一份 Workflow 定义；拖动调整布局，点击节点后可在执行阶段中编辑。</p>
                  <WorkflowCanvas v-model:selected-id="selectedNodeId" :definition="draft" :layout="canvasLayout" :compiled="compiled" @update:layout="updateLayout" />
                  <div class="workflow-actions"><ForgeButton size="sm" variant="secondary" @click="exportCanvas">导出画布 JSON</ForgeButton><ForgeButton size="sm" variant="secondary" @click="importCanvas">导入画布 JSON 到草稿</ForgeButton></div>
                  <ForgeTextarea v-model="canvasJson" label="画布 JSON（最多 256 KB）" :rows="4" :max-height="240" />
                </section>
              </div>
            </details>
            <section v-if="compiled" class="workflow-compile-result" aria-label="Workflow 编译诊断">
              <StatusTag :tone="compiled.launchable ? 'info' : 'warning'" :label="compiled.launchable ? '发布预检通过' : '需要调整后发布'" />
              <ul v-if="compiled.issues.length" class="workflow-issues"><li v-for="(issue, index) in compiled.issues" :key="index"><strong>{{ issue.message }}</strong><small>{{ issue.code }} · {{ issue.path }}</small></li></ul>
            </section>
          </div>
          <footer v-if="!readOnly" class="workflow-footer">
            <p v-if="notice" role="status">{{ notice }}</p><p v-else>保存配置后检查能力，再发布供新任务使用。</p>
            <div class="workflow-actions"><ForgeButton size="sm" variant="ghost" :disabled="busy" @click="preflight">检查能力</ForgeButton><ForgeButton size="sm" variant="secondary" :disabled="busy || !dirty" @click="save">保存草稿</ForgeButton><ForgeButton size="sm" variant="primary" :disabled="busy || !currentRecord || dirty" @click="publish">发布版本</ForgeButton></div>
          </footer>
        </template>
        <div v-else class="workflow-welcome">
          <span class="workflow-welcome-eyebrow">{{ records.length ? '我的工作流' : '从模板开始' }}</span>
          <h2>{{ busy ? '正在读取工作流…' : records.length ? '选择一个工作流' : readOnly ? '暂无可查看的工作流' : '创建第一个工作流' }}</h2>
          <p v-if="records.length">从左侧打开已保存的流程，查看阶段配置和已发布版本。</p>
          <p v-else-if="readOnly">当前没有已保存的工作流。</p>
          <p v-else>选择一个模板，调整阶段和角色。保存草稿并检查能力后，再决定是否发布。</p>
          <div v-if="!readOnly && !records.length && presets.length" class="workflow-starters" aria-label="可用工作流模板">
            <button v-for="preset in presets" :key="preset.id" type="button" class="workflow-starter"
              :aria-label="`使用${presetName(preset)}模板`" @click="fromPreset(preset)">
              <span class="workflow-starter-count">{{ preset.nodes.length }} 个阶段</span>
              <strong>{{ presetName(preset) }}</strong>
              <span class="workflow-starter-path">{{ presetSummary(preset) }}</span>
              <span class="workflow-starter-action">使用此模板 <span aria-hidden="true">→</span></span>
            </button>
          </div>
          <p v-else-if="!busy && !records.length && !readOnly">当前没有可用模板，请稍后重试。</p>
          <p v-if="notice" role="status">{{ notice }}</p>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.workflows-view { width: 100%; height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; color: var(--forge-color-text); background: transparent; }
.workflow-page-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-16); padding: var(--forge-space-16) var(--forge-space-24); border-bottom: var(--forge-border-subtle); background: var(--forge-surface-topbar); }
.workflow-page-header h1 { margin: 0; font-size: var(--forge-font-body); font-weight: var(--forge-font-weight-semibold); }
.workflow-page-header p { margin: var(--forge-space-4) 0 0; font-size: var(--forge-font-small); color: var(--forge-color-text-secondary); }
.workflow-loading { font-size: var(--forge-font-small); color: var(--forge-color-text-secondary); }
.workflow-workbench { display: grid; grid-template-columns: 232px minmax(0, 1fr); flex: 1; min-height: 0; min-width: 0; }
.workflow-library { overflow-y: auto; border-right: var(--forge-border-subtle); padding: var(--forge-space-20) var(--forge-space-12); background: var(--forge-surface-panel); box-shadow: var(--forge-glass-inner-highlight); backdrop-filter: blur(var(--forge-blur-glass)) saturate(var(--forge-glass-saturation)); }
.workflow-library-group + .workflow-library-group { margin-top: var(--forge-space-24); }
.workflow-library-group h2 { display: flex; align-items: center; justify-content: space-between; margin: 0 var(--forge-space-8) var(--forge-space-8); color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); font-weight: var(--forge-font-weight-medium); }
.workflow-library-group h2 span { font-variant-numeric: tabular-nums; }
.workflow-library-item { width: 100%; display: grid; gap: var(--forge-space-6); border: 1px solid transparent; border-radius: var(--forge-radius-sm); padding: var(--forge-space-12); color: var(--forge-color-text); background: transparent; text-align: left; cursor: pointer; font: inherit; font-size: var(--forge-font-small); }
.workflow-library-item + .workflow-library-item { margin-top: var(--forge-space-4); }
.workflow-library-item strong { display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-8); font-weight: var(--forge-font-weight-medium); }
.workflow-library-item > span { font-size: var(--forge-font-caption); line-height: 1.6; color: var(--forge-color-text-secondary); }
.workflow-library-item:hover { background: var(--forge-surface-control); }
.workflow-library-item[aria-current=true] { background: var(--forge-surface-control); border-color: var(--forge-color-line); }
.workflow-library-item:focus-visible, summary:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 2px; }
.library-empty { margin: var(--forge-space-12) var(--forge-space-8); font-size: var(--forge-font-small); line-height: 1.6; color: var(--forge-color-text-secondary); }
.workflow-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: radial-gradient(ellipse 70% 55% at 100% 0%, var(--forge-surface-glow-blue), transparent 82%); }
.workflow-definition-header { padding: var(--forge-space-20) var(--forge-space-24); display: flex; justify-content: space-between; gap: var(--forge-space-16); align-items: center; border-bottom: var(--forge-border-subtle); background: var(--forge-surface-panel); box-shadow: var(--forge-glass-inner-highlight); }
.workflow-definition-header h2 { font-size: 17px; font-weight: var(--forge-font-weight-semibold); margin: 0; overflow-wrap: anywhere; }
.workflow-definition-header p, .workflow-version-status > span { margin: var(--forge-space-6) 0 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.workflow-version-status { display: grid; justify-items: end; gap: var(--forge-space-4); flex: 0 0 auto; }
.workflow-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--forge-space-20) var(--forge-space-24); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-12); margin-bottom: var(--forge-space-12); }
.section-heading h3 { font-size: var(--forge-font-body); margin: 0; }
.section-heading > span { color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.workflow-nodes { display: grid; gap: var(--forge-space-8); padding: 0; margin: 0; list-style: none; }
.workflow-node { min-width: 0; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-panel); box-shadow: var(--forge-shadow-surface), var(--forge-glass-inner-highlight); }
.stage-summary { display: grid; grid-template-columns: var(--forge-space-24) minmax(120px, 1fr) minmax(160px, 1.6fr) auto var(--forge-space-12); gap: var(--forge-space-12); align-items: center; padding: var(--forge-space-16); cursor: pointer; list-style: none; }
.stage-summary::-webkit-details-marker { display: none; }
.stage-number { display: grid; place-items: center; width: var(--forge-space-24); height: var(--forge-space-24); border: var(--forge-border-subtle); border-radius: var(--forge-radius-sm); font-size: var(--forge-font-caption); color: var(--forge-color-text-secondary); font-variant-numeric: tabular-nums; }
.stage-heading, .stage-assignment { display: grid; gap: var(--forge-space-4); min-width: 0; }
.stage-heading strong, .stage-assignment strong { font-size: var(--forge-font-body); font-weight: var(--forge-font-weight-medium); overflow-wrap: anywhere; }
.stage-heading > span, .stage-assignment > span, .stage-assignment small { color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); overflow-wrap: anywhere; font-weight: var(--forge-font-weight-normal); }
.stage-chevron { color: var(--forge-color-text-secondary); }
.workflow-node details[open] .stage-chevron { transform: rotate(180deg); }
.stage-editor { display: grid; gap: var(--forge-space-12); border-top: var(--forge-border-subtle); padding: var(--forge-space-16); }
.stage-fields { display: grid; grid-template-columns: minmax(120px, .7fr) minmax(0, 1.5fr); gap: var(--forge-space-12); }
.stage-explanation, .stage-reason { margin: 0; font-size: var(--forge-font-small); color: var(--forge-color-text-secondary); }
.stage-reason { color: var(--forge-color-warning); }
.workflow-actions, .node-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--forge-space-8); }
.node-actions { justify-content: flex-end; }
.add-stage-actions { margin: var(--forge-space-8) 0 var(--forge-space-24); }
.add-stage-actions > span { margin-left: auto; font-size: var(--forge-font-caption); color: var(--forge-color-text-secondary); }
.workflow-detail-section { border-top: var(--forge-border-subtle); font-size: var(--forge-font-small); }
.workflow-detail-section > summary { padding: var(--forge-space-12) 0; color: var(--forge-color-text-secondary); cursor: pointer; }
.workflow-detail-section > summary > span { margin-left: var(--forge-space-12); color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.workflow-detail-body { display: grid; gap: var(--forge-space-12); padding-bottom: var(--forge-space-16); }
.workflow-detail-body p { margin: 0; color: var(--forge-color-text-secondary); font-size: var(--forge-font-small); }
.workflow-note { overflow-wrap: anywhere; }
.workflow-version-diff { display: grid; gap: var(--forge-space-8); }
.workflow-version-diff .forge-field { max-width: 240px; }
.workflow-diff-list { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr); gap: var(--forge-space-8); margin: 0; }
.workflow-diff-list dt { color: var(--forge-color-text-secondary); }
.workflow-diff-list dd { display: grid; gap: var(--forge-space-8); margin: 0; overflow-wrap: anywhere; }
.canvas-panel { display: grid; gap: var(--forge-space-12); }
.workflow-compile-result { margin-top: var(--forge-space-16); }
.workflow-issues { list-style: none; padding: 0; margin: var(--forge-space-12) 0 0; display: grid; gap: var(--forge-space-12); }
.workflow-issues li { display: grid; gap: var(--forge-space-4); font-size: var(--forge-font-small); color: var(--forge-color-warning); overflow-wrap: anywhere; }
.workflow-issues small { color: var(--forge-color-text-secondary); font-family: var(--forge-font-mono); font-size: var(--forge-font-caption); }
.workflow-compatibility { margin: 0 0 var(--forge-space-12); color: var(--forge-color-warning); font-size: var(--forge-font-small); }
.workflow-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--forge-space-16); padding: var(--forge-space-12) var(--forge-space-24); border-top: var(--forge-border-subtle); background: var(--forge-surface-panel); }
.workflow-footer > p { margin: 0; max-width: 52ch; font-size: var(--forge-font-caption); color: var(--forge-color-text-secondary); }
.workflow-footer .workflow-actions { flex-shrink: 0; }
.workflow-welcome { box-sizing: border-box; width: min(100%, 980px); max-height: 100%; margin: 0 auto; padding: clamp(var(--forge-space-40), 6vh, 72px) var(--forge-space-40) var(--forge-space-48); overflow-y: auto; }
.workflow-welcome-eyebrow { display: block; margin-bottom: var(--forge-space-12); color: var(--forge-color-accent-text); font-size: var(--forge-font-caption); font-weight: var(--forge-font-weight-semibold); letter-spacing: .04em; }
.workflow-welcome h2 { margin: 0; font-size: clamp(22px, 2.1vw, var(--forge-font-heading)); line-height: 1.25; letter-spacing: -.025em; }
.workflow-welcome > p { max-width: 60ch; margin: var(--forge-space-12) 0 0; font-size: var(--forge-font-small); color: var(--forge-color-text-secondary); line-height: var(--forge-line-body); }
.workflow-starters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--forge-space-16); margin-top: var(--forge-space-32); }
.workflow-starter { min-width: 0; min-height: 184px; display: flex; flex-direction: column; align-items: stretch; gap: var(--forge-space-12); border: var(--forge-border-highlight); border-radius: var(--forge-radius-card); padding: var(--forge-space-20); background: var(--forge-surface-panel); box-shadow: var(--forge-shadow-surface), var(--forge-glass-inner-highlight); backdrop-filter: blur(var(--forge-blur-glass)) saturate(var(--forge-glass-saturation)); color: var(--forge-color-text); font: inherit; text-align: left; cursor: pointer; transition: transform var(--forge-motion-hover) var(--forge-ease), border-color var(--forge-motion-hover) var(--forge-ease), box-shadow var(--forge-motion-hover) var(--forge-ease); }
.workflow-starter:hover { transform: translateY(-2px); border-color: var(--forge-color-accent); box-shadow: var(--forge-shadow-elevated), var(--forge-glass-inner-highlight); }
.workflow-starter:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 2px; }
.workflow-starter-count { color: var(--forge-color-text-secondary); font-size: var(--forge-font-caption); }
.workflow-starter strong { font-size: 18px; font-weight: var(--forge-font-weight-semibold); }
.workflow-starter-path { color: var(--forge-color-text-secondary); font-size: var(--forge-font-small); line-height: var(--forge-line-body); overflow-wrap: anywhere; }
.workflow-starter-action { margin-top: auto; color: var(--forge-color-accent-text); font-size: var(--forge-font-small); font-weight: var(--forge-font-weight-semibold); }
:global([data-reduce-transparency='true']) .workflow-library,
:global([data-reduce-transparency='true']) .workflow-starter { backdrop-filter: none; }
@media (prefers-reduced-transparency: reduce) { .workflow-library, .workflow-starter { backdrop-filter: none; } }
@media (prefers-reduced-motion: reduce) { .workflow-starter { transition: none; } .workflow-starter:hover { transform: none; } }
@media (max-width: 1100px) { .workflow-workbench { grid-template-columns: 200px minmax(0, 1fr); } .workflow-starters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .stage-summary { grid-template-columns: var(--forge-space-24) minmax(100px, 1fr) minmax(120px, 1.3fr) var(--forge-space-12); } .stage-summary > .forge-status-tag { grid-column: 2 / 4; justify-self: start; } .stage-chevron { grid-column: 4; grid-row: 1; } .workflow-footer { flex-wrap: wrap; } }
@media (max-width: 760px) { .workflow-workbench { grid-template-columns: 176px minmax(0, 1fr); } .workflow-welcome { padding: var(--forge-space-32) var(--forge-space-16); } .workflow-starters { grid-template-columns: minmax(0, 1fr); margin-top: var(--forge-space-24); } .workflow-starter { min-height: 0; } .workflow-scroll, .workflow-definition-header { padding: var(--forge-space-16); } .stage-summary { grid-template-columns: var(--forge-space-24) minmax(0, 1fr) var(--forge-space-12); } .stage-assignment { grid-column: 2; } .stage-summary > .forge-status-tag { grid-column: 2; } .stage-chevron { grid-column: 3; } .stage-fields { grid-template-columns: minmax(0, 1fr); } .workflow-footer { padding: var(--forge-space-12); } .add-stage-actions > span { width: 100%; margin-left: var(--forge-space-8); } }
</style>
