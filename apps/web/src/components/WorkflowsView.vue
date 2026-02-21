<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { AgentProfileCatalog, WorkflowCompile, WorkflowImpact, WorkflowNode, WorkflowRecord,
  WorkflowTemplate } from '@forge/contracts';
import { workflowTemplateSchema } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeInput, ForgeSelect, ForgeTextarea,
  StatusTag } from '@forge/ui';
import { defaultCanvasLayout, exportCanvasDocument, importCanvasDocument,
  validateCanvasLayout, type CanvasLayout } from '../workflow-canvas-document';
import { diffWorkflowDefinitions, type WorkflowDifference } from '../workflow-diff';

const WorkflowCanvas = defineAsyncComponent(() => import('./WorkflowCanvas.vue'));

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean }>();
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
const recordOptions = computed(() => records.value.map((item) => ({
  value: item.workflowId, label: `${item.draft.name} · 草稿 v${item.draftRevision}`,
})));
const profileOptions = (node: WorkflowNode): { value: string; label: string }[] => {
  const role = node.boardColumn === 'review' ? 'reviewer'
    : node.boardColumn === 'todo' ? 'planner' : 'developer';
  const options = (profiles.value?.profiles ?? []).filter((item) => item.role === role).map((item) => ({
    value: item.id,
    label: `${item.name} · v${item.revision}${profiles.value?.availability.find(
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
  busy.value = true;
  try {
    [presets.value, records.value, profiles.value] = await Promise.all([
      props.client.workflowPresets(), props.client.listWorkflows(), props.client.agentProfileCatalog(),
    ]);
  } catch { notice.value = '无法读取 Host 的 Workflow 定义。'; }
  finally { busy.value = false; }
}
function selectRecord(id: string): void {
  const record = records.value.find((item) => item.workflowId === id);
  if (!record) return;
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
  const copy = workflowTemplateSchema.parse(preset);
  copy.id = `workflow.${crypto.randomUUID()}`;
  copy.revision = 1;
  draft.value = copy; currentRecord.value = null; compiled.value = null;
  impact.value = null;
  versionChanges.value = null;
  canvasLayout.value = defaultCanvasLayout(copy); canvasJson.value = '';
  dirty.value = true; notice.value = '模板副本尚未保存；请绑定真实 Profile 并检查配置。';
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
  node.readOnly = role === 'reviewer';
  node.inputs = role === 'reviewer' ? ['task', 'snapshot', 'diff'] : ['task'];
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
  ); notice.value = compiled.value.launchable ? '当前已安装能力满足发布预检。' : '发布预检发现问题；草稿仍可保存。'; }
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
    records.value = await props.client.listWorkflows();
    await refreshImpact(result.record.workflowId);
    notice.value = '草稿已保存。保存不会执行 Workflow 或批准任何操作。';
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
      ? '版本已发布；只有当前 Host 支持的线性阶段链能启动，任务不会自动开工。'
      : '发布被 Host 阻止：请查看绑定、能力和结构诊断。';
  } catch { notice.value = '发布失败：Host 不可用或草稿版本已变更。'; }
  finally { busy.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
</script>

<template>
  <section class="workflows-view" aria-labelledby="workflows-title">
    <p class="eyebrow">FORGE / WORKFLOWS</p><h1 id="workflows-title">线性配置</h1>
    <p>按执行顺序调整节点，选择实际已保存的 Agent Profile。草稿可保留错误；发布前 Host 会重新检查实际能力。</p>
    <ForgeCard tone="reading" class="workflow-panel">
      <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 没有本地 Host；不会访问项目或运行流程。" />
      <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接 Python Host 后才能编辑本地 Workflow。" />
      <template v-else>
        <p v-if="busy" role="status">正在读取或校验 Workflow…</p>
        <div class="workflow-toolbar">
          <ForgeSelect :model-value="currentRecord?.workflowId ?? ''" label="已保存草稿"
            :options="[{ value: '', label: '选择草稿' }, ...recordOptions]"
            @update:model-value="selectRecord" />
          <div class="workflow-actions"><ForgeButton v-for="preset in presets" :key="preset.id"
            variant="secondary" @click="fromPreset(preset)">从{{ preset.id }}模板新建</ForgeButton></div>
        </div>
        <template v-if="draft">
          <div class="workflow-actions">
            <ForgeButton variant="secondary" @click="canvasOpen = !canvasOpen">
              {{ canvasOpen ? '收起高级画布' : '打开高级画布' }}
            </ForgeButton>
          </div>
          <section v-if="canvasOpen" aria-label="高级画布编辑" class="canvas-panel">
            <p>画布显示同一份 Workflow 定义；拖动只改变此设备的布局。节点语义和连接仍由线性配置与 Host 编译器控制，不能通过画布绕过审批或创建并行执行。</p>
            <WorkflowCanvas v-model:selected-id="selectedNodeId" :definition="draft"
              :layout="canvasLayout" :compiled="compiled" @update:layout="updateLayout" />
            <p v-if="selectedNodeId" role="status">选中节点 {{ selectedNodeId }}；在下方线性配置中编辑其语义。</p>
            <div class="workflow-actions">
              <ForgeButton variant="secondary" @click="exportCanvas">导出画布 JSON</ForgeButton>
              <ForgeButton variant="secondary" @click="importCanvas">导入画布 JSON 到草稿</ForgeButton>
            </div>
            <ForgeTextarea v-model="canvasJson" label="画布 JSON（最多 256 KB）"
              :rows="4" :max-height="240" />
          </section>
          <ForgeInput v-model="draft.name" label="流程名称" @update:model-value="dirty = true" />
          <p class="workflow-note">流程 ID {{ draft.id }} · {{ dirty ? '未保存更改' : `草稿 v${currentRecord?.draftRevision ?? 0}` }}
            · {{ currentRecord?.publishedRevision ? `已发布 v${currentRecord.publishedRevision}` : '尚未发布' }}</p>
          <section v-if="impact" aria-label="版本影响预览" class="workflow-impact">
            <strong>版本影响预览</strong>
            <p v-if="dirty">当前未保存编辑不计入以下预览；保存后会重新计算。</p>
            <p>已发布：{{ impact.publishedRevisions.length ? impact.publishedRevisions.map((revision) => `v${revision}`).join('、') : '无' }}。
              {{ impact.draftChangedSincePublish ? '已保存草稿与已发布版本不同。' : '已保存草稿与已发布版本一致。' }}
              新 Run 必须明确选择已发布版本；旧 Run 保留各自冻结的版本和内容哈希。</p>
            <p>已有冻结 Run：{{ Object.entries(impact.frozenRunCounts).length
              ? Object.entries(impact.frozenRunCounts).map(([revision, count]) => `v${revision}：${count}`).join('、')
              : '无' }}。此预览不启动或迁移 Run。</p>
            <section v-if="impact.publishedRevisions.length > 1" class="workflow-version-diff" aria-label="已发布版本差异">
              <strong>已发布版本差异</strong>
              <ForgeSelect v-model="compareRevision" label="比较旧版"
                :options="impact.publishedRevisions.slice(0, -1).map((revision) => ({ value: String(revision), label: `v${revision}` }))"
                @update:model-value="loadComparison" />
              <p>比较 v{{ compareRevision }} 与当前已发布 v{{ impact.publishedRevision }}；Run 仍保留启动时的版本和哈希。</p>
              <p v-if="comparisonBusy" role="status">正在读取已发布版本…</p>
              <p v-if="comparisonError" role="alert">{{ comparisonError }}</p>
              <p v-else-if="versionChanges && !versionChanges.length">两个版本的可见定义相同。</p>
              <dl v-else-if="versionChanges" class="workflow-diff-list">
                <template v-for="change in versionChanges" :key="change.field">
                  <dt>{{ change.field }}</dt><dd><span>v{{ compareRevision }}：{{ change.before }}</span><span>v{{ impact.publishedRevision }}：{{ change.after }}</span></dd>
                </template>
              </dl>
            </section>
          </section>
          <ol class="workflow-nodes">
            <li v-for="(node, index) in draft.nodes" :key="node.id" class="workflow-node">
              <div class="node-heading"><strong>{{ index + 1 }}. {{ node.label }}</strong>
                <StatusTag :label="node.kind === 'approval' ? '人工门禁' : node.kind === 'verifier' ? '验证' : 'Agent'"
                  :tone="node.kind === 'approval' ? 'warning' : 'info'" /></div>
              <ForgeInput v-model="node.label" :label="`步骤 ${index + 1} 名称`" @update:model-value="dirty = true" />
              <template v-if="node.kind === 'agent'">
                <ForgeSelect :model-value="node.boardColumn === 'review' ? 'reviewer' : 'developer'"
                  label="职责" :options="[{ value: 'developer', label: 'Developer' }, { value: 'reviewer', label: 'Reviewer（只读）' }]"
                  @update:model-value="setRole(node, $event)" />
                <ForgeSelect v-model="node.binding" label="Agent Profile"
                  :options="[{ value: 'profile.unbound', label: '未绑定（不能发布）' }, ...profileOptions(node)]"
                  @update:model-value="dirty = true" />
              </template>
              <p v-else>绑定：{{ node.binding }} · {{ node.readOnly ? '只读' : '需明确权限' }}</p>
              <ForgeSelect v-if="node.kind === 'agent' || node.kind === 'verifier'"
                :model-value="draft.rework.find((edge) => edge.from === node.id)?.to ?? ''"
                label="失败路径"
                :options="[{ value: '', label: '升级人工处理' }, ...draft.nodes.slice(0, index)
                  .filter((target) => target.kind === 'agent' && target.boardColumn === 'development')
                  .map((target) => ({ value: target.id, label: `返工至 ${target.label}（最多 2 次）` }))]"
                @update:model-value="setFailure(node, $event)" />
              <div v-if="index < draft.nodes.length - 1" class="node-actions">
                <ForgeButton variant="ghost" :disabled="index === 0" @click="move(index, -1)">上移</ForgeButton>
                <ForgeButton variant="ghost" :disabled="index >= draft.nodes.length - 2" @click="move(index, 1)">下移</ForgeButton>
                <ForgeButton variant="danger" @click="remove(index)">删除</ForgeButton>
              </div>
            </li>
          </ol>
          <div class="workflow-actions">
            <ForgeButton variant="secondary" @click="add('agent')">添加 Agent 步骤</ForgeButton>
            <ForgeButton variant="secondary" @click="add('verifier')">添加验证步骤</ForgeButton>
          </div>
          <p class="workflow-note">末尾人工验收门禁不可删除；项目脚本和 Agent 不会因编辑或发布而自动运行。</p>
          <div class="workflow-actions">
            <ForgeButton variant="secondary" :disabled="busy" @click="preflight">检查结构与能力</ForgeButton>
            <ForgeButton variant="secondary" :disabled="busy || !dirty" @click="save">保存草稿</ForgeButton>
            <ForgeButton variant="primary" :disabled="busy || !currentRecord || dirty" @click="publish">发布当前草稿</ForgeButton>
          </div>
          <section v-if="compiled" aria-label="Workflow 编译诊断">
            <StatusTag :tone="compiled.launchable ? 'success' : 'warning'"
              :label="compiled.launchable ? '可发布预检通过' : '不可发布'" />
            <ul v-if="compiled.issues.length" class="workflow-issues">
              <li v-for="(issue, index) in compiled.issues" :key="index">
                <strong>{{ issue.code }}</strong> · {{ issue.path }} · {{ issue.message }}
              </li>
            </ul>
          </section>
        </template>
        <ForgeEmptyState v-else title="尚无选中的流程" description="从版本化模板新建草稿，或打开已有草稿。" />
        <p v-if="notice" role="status">{{ notice }}</p>
      </template>
    </ForgeCard>
  </section>
</template>

<style scoped>
.workflows-view { width: 100%; min-width: 0; padding: var(--forge-space-32); }
.workflows-view > p { color: var(--forge-color-text-secondary); }
.workflow-panel { max-width: 980px; padding: var(--forge-space-24); display: grid; gap: var(--forge-space-20); }
.workflow-toolbar, .workflow-actions, .node-actions { display: flex; flex-wrap: wrap; align-items: end; gap: var(--forge-space-8); }
.workflow-toolbar > :first-child { min-width: 250px; }
.workflow-nodes { display: grid; gap: var(--forge-space-16); margin: 0; padding: 0; list-style: none; }
.workflow-node { display: grid; gap: var(--forge-space-12); padding: var(--forge-space-20); border: 1px solid var(--forge-color-line); border-radius: var(--forge-radius-lg); background: var(--forge-surface-reading); }
.node-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--forge-space-12); }
.workflow-note { color: var(--forge-color-text-secondary); overflow-wrap: anywhere; }
.workflow-impact { padding: var(--forge-space-16); border: 1px solid var(--forge-color-line);
  border-radius: var(--forge-radius-lg); background: var(--forge-surface-reading); }
.workflow-impact p { color: var(--forge-color-text-secondary); }
.workflow-version-diff { display: grid; gap: var(--forge-space-8); margin-top: var(--forge-space-16); }
.workflow-version-diff .forge-field { max-width: 240px; }
.workflow-diff-list { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr); gap: var(--forge-space-8); margin: 0; }
.workflow-diff-list dt { color: var(--forge-color-text-secondary); }
.workflow-diff-list dd { display: flex; flex-wrap: wrap; gap: var(--forge-space-16); margin: 0; overflow-wrap: anywhere; }
.canvas-panel { display: grid; gap: var(--forge-space-12); }
.canvas-panel > p { color: var(--forge-color-text-secondary); }
.workflow-issues { color: var(--forge-color-danger); overflow-wrap: anywhere; }
@media (max-width: 720px) { .workflows-view { padding: var(--forge-space-16); } }
</style>
