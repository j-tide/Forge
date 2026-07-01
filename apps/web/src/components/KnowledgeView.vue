<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { KnowledgeChunk, KnowledgeSource, KnowledgeSearchResult,
  ProjectMemory, MemorySearchResult } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeDialog, ForgeEmptyState, ForgeInput, StatusTag } from '@forge/ui';

const props = defineProps<{
  client: ForgeClient; desktop: boolean; connected: boolean; projectId: string | null;
  environmentId?: string | null;
}>();
const sources = ref<KnowledgeSource[]>([]);
const relativePath = ref('');
const selected = ref<KnowledgeChunk | null>(null);
const busy = ref(false);
const notice = ref('');
const revokeTarget = ref<KnowledgeSource | null>(null);
const revokeOpen = ref(false);
const query = ref('');
const searchResult = ref<KnowledgeSearchResult | null>(null);
const memories = ref<ProjectMemory[]>([]);
const memoryResult = ref<MemorySearchResult | null>(null);
const memorySubject = ref('');
const memoryText = ref('');
const memoryExpiry = ref('');
const editing = ref<ProjectMemory | null>(null);
const decisionTarget = ref<ProjectMemory | null>(null);
const decisionAction = ref<'validate' | 'deprecate' | 'revoke'>('validate');
const decisionReason = ref('');
const decisionOpen = ref(false);
const replacement = ref<ProjectMemory | null>(null);

async function refreshMemories(): Promise<void> {
  if (!props.projectId) return;
  memories.value = await props.client.listMemories(props.projectId);
}

async function load(): Promise<void> {
  selected.value = null;
  searchResult.value = null;
  memoryResult.value = null;
  if (!props.desktop || !props.connected || !props.projectId) {
    sources.value = []; memories.value = []; return;
  }
  busy.value = true;
  try {
    sources.value = await props.client.listKnowledge(props.projectId);
    await refreshMemories();
  }
  catch { notice.value = '无法读取当前项目的资料来源。'; }
  finally { busy.value = false; }
}
async function importSource(): Promise<void> {
  if (!props.projectId || !relativePath.value.trim()) return;
  busy.value = true;
  try {
    const source = await props.client.importKnowledge(props.projectId, relativePath.value.trim());
    sources.value = await props.client.listKnowledge(props.projectId);
    await refreshMemories();
    searchResult.value = null;
    relativePath.value = '';
    notice.value = `已只读导入 ${source.relativePath} · v${source.version}。没有执行项目代码。`;
    if (source.chunkCount > 0) await openSource(source);
  } catch {
    notice.value = '导入失败：请检查路径白名单、文件大小、UTF-8 内容或 Host 状态；修复后可重试。';
  } finally { busy.value = false; }
}
async function openSource(source: KnowledgeSource): Promise<void> {
  if (!props.projectId || source.status !== 'active' || source.chunkCount === 0) return;
  try { selected.value = await props.client.knowledgeChunk(
    props.projectId, source.sourceId, source.version, 0,
  ); }
  catch { notice.value = '原文定位不可用；请重新读取来源。'; }
}
async function revoke(): Promise<void> {
  if (!props.projectId || !revokeTarget.value) return;
  busy.value = true;
  try {
    await props.client.revokeKnowledge(props.projectId, revokeTarget.value.sourceId);
    sources.value = await props.client.listKnowledge(props.projectId);
    await refreshMemories();
    selected.value = null;
    searchResult.value = null;
    notice.value = '来源已撤销并保留引用墓碑；项目原文件没有删除。';
  } catch { notice.value = '撤销失败；来源状态未确认，请刷新后重试。'; }
  finally { busy.value = false; revokeOpen.value = false; revokeTarget.value = null; }
}
async function search(): Promise<void> {
  if (!props.projectId || !props.environmentId || !query.value.trim()) return;
  busy.value = true;
  try {
    searchResult.value = await props.client.searchKnowledge(
      props.projectId, props.environmentId, query.value.trim(),
    );
  } catch { notice.value = '检索失败；请确认 Host、项目和环境仍然可用。'; searchResult.value = null; }
  finally { busy.value = false; }
}
async function searchMemory(): Promise<void> {
  if (!props.projectId || !props.environmentId || !query.value.trim()) return;
  busy.value = true;
  try {
    memoryResult.value = await props.client.retrieveMemory(
      props.projectId, props.environmentId, query.value.trim());
  } catch { memoryResult.value = null; notice.value = '记忆检索失败；请重新检查 Host 状态。'; }
  finally { busy.value = false; }
}
function startProposal(): void {
  if (!selected.value) return;
  memorySubject.value = '';
  memoryText.value = selected.value.text.trim().slice(0, 2000);
  memoryExpiry.value = '';
  editing.value = null;
}
function startEdit(item: ProjectMemory): void {
  editing.value = item;
  memorySubject.value = item.subjectKey;
  memoryText.value = item.text;
  memoryExpiry.value = item.expiresAt?.slice(0, 10) ?? '';
}
function expiryIso(): string | null {
  if (!memoryExpiry.value) return null;
  return new Date(`${memoryExpiry.value}T23:59:59.000Z`).toISOString();
}
async function saveMemory(): Promise<void> {
  if (!props.projectId || !props.environmentId || !memoryText.value.trim()) return;
  busy.value = true;
  try {
    if (editing.value) {
      await props.client.editMemory({ projectId: props.projectId,
        memoryId: editing.value.memoryId, expectedRevision: editing.value.revision,
        text: memoryText.value.trim(), expiresAt: expiryIso() });
      notice.value = '候选记忆已更新；仍未确认，不会成为验收依据。';
    } else if (selected.value && memorySubject.value.trim()) {
      await props.client.proposeMemory({ projectId: props.projectId,
        environmentId: props.environmentId, scope: 'environment',
        kind: 'project_convention', subjectKey: memorySubject.value.trim(),
        text: memoryText.value.trim(), sources: [{ sourceRef: selected.value.sourceRef,
          sourceHash: selected.value.contentHash }], expiresAt: expiryIso(),
        idempotencyKey: crypto.randomUUID() });
      notice.value = '已保存候选记忆；需要人工确认才可用于后续检索。';
    }
    await refreshMemories();
    editing.value = null; memoryText.value = ''; memorySubject.value = ''; memoryExpiry.value = '';
  } catch { notice.value = '记忆保存失败：检查来源是否仍有效、字段格式及修订版本。'; }
  finally { busy.value = false; }
}
function requestDecision(item: ProjectMemory, action: 'validate' | 'deprecate' | 'revoke'): void {
  decisionTarget.value = item;
  decisionAction.value = action;
  decisionReason.value = '';
  replacement.value = action === 'validate'
    ? memories.value.find((old) => old.status === 'validated' &&
      old.subjectKey === item.subjectKey && old.environmentId === item.environmentId) ?? null
    : null;
  decisionOpen.value = true;
}
async function decideMemory(): Promise<void> {
  if (!props.projectId || !decisionTarget.value || decisionReason.value.trim().length < 12) return;
  busy.value = true;
  try {
    await props.client.decideMemory({ projectId: props.projectId,
      memoryId: decisionTarget.value.memoryId,
      expectedRevision: decisionTarget.value.revision,
      decision: decisionAction.value, reason: decisionReason.value.trim(),
      confirmed: true, decisionId: crypto.randomUUID(),
      replaceMemoryId: replacement.value?.memoryId ?? null });
    await refreshMemories();
    memoryResult.value = null;
    notice.value = decisionAction.value === 'validate'
      ? '已确认该记忆；后续仍须按当前来源和期限校验。'
      : decisionAction.value === 'deprecate'
        ? '已标记过时，检索索引已清理；历史决定仍可审计。'
        : '已撤销并清空索引与记忆正文；来源文件未删除。';
    decisionOpen.value = false;
  } catch { notice.value = '决定未保存：可能是来源失效、版本变化或范围冲突；请刷新后重试。'; }
  finally { busy.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected, props.projectId], () => { void load(); });
</script>

<template>
  <section class="knowledge-view" aria-labelledby="knowledge-title">
    <p class="eyebrow">FORGE / KNOWLEDGE</p><h1 id="knowledge-title">项目资料</h1>
    <p>只读导入资料、检索原文，并由人确认或撤销项目记忆。记忆是指导信息，不是验收标准；当前运行的冻结输入不会自动改变。</p>
    <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 不访问本机项目资料。" />
    <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接 Python Host 后才能查看项目资料。" />
    <ForgeEmptyState v-else-if="!projectId" title="请先选择项目" description="信任并激活一个真实项目后才能导入其文档。" />
    <template v-else>
      <ForgeCard tone="reading" class="knowledge-panel">
        <h2>导入来源</h2>
        <p>仅接受项目根目录的 README/OpenAPI，或 docs、spec、specs、knowledge 目录下的 .md/.txt/OpenAPI。单文件最多 1 MiB；不会执行脚本。</p>
        <div class="knowledge-actions">
          <ForgeInput v-model="relativePath" label="项目内相对路径" placeholder="docs/architecture.md" />
          <ForgeButton variant="primary" :disabled="busy || !relativePath.trim()" @click="importSource">只读导入</ForgeButton>
          <ForgeButton variant="secondary" :disabled="busy" @click="load">刷新</ForgeButton>
        </div>
        <p v-if="notice" role="status">{{ notice }}</p>
      </ForgeCard>
      <ForgeCard tone="reading" class="knowledge-panel">
        <h2>检索已导入资料</h2>
        <p>关键词检索返回真实片段和引用；空结果不会生成答案。索引：forge-knowledge-search/v1。</p>
        <div class="knowledge-actions">
          <ForgeInput v-model="query" label="关键词" placeholder="日期筛选 start_date" />
          <ForgeButton variant="secondary" :disabled="busy || !query.trim() || !environmentId" @click="search">检索</ForgeButton>
          <ForgeButton variant="ghost" :disabled="busy || !query.trim() || !environmentId" @click="searchMemory">检索记忆</ForgeButton>
        </div>
        <p v-if="searchResult" role="status">{{ searchResult.results.length }} 个片段 · {{ searchResult.indexVersion }}</p>
        <ForgeEmptyState v-if="searchResult && !searchResult.results.length" title="没有匹配的资料" description="当前项目与环境中未找到匹配片段；不会生成答案。" />
        <ul v-else-if="searchResult?.results.length" class="knowledge-list">
          <li v-for="result in searchResult.results" :key="result.sourceRef">
            <div><strong>{{ result.sourceRef }}</strong><p>第 {{ result.startLine }}–{{ result.endLine }} 行 · SHA-256 {{ result.contentHash.slice(0, 12) }}…</p><pre>{{ result.text }}</pre></div>
          </li>
        </ul>
      </ForgeCard>
      <ForgeCard tone="reading" class="knowledge-panel">
        <h2>来源</h2>
        <p v-if="busy" role="status">正在读取资料…</p>
        <ForgeEmptyState v-if="!sources.length && !busy" title="尚无资料来源" description="导入不会修改项目文件。" />
        <ul v-else class="knowledge-list">
          <li v-for="source in sources" :key="source.sourceId">
            <div><strong>{{ source.relativePath }}</strong><p>v{{ source.version }} · {{ source.chunkCount }} 个片段 · SHA-256 {{ source.contentHash.slice(0, 12) }}…</p></div>
            <StatusTag :tone="source.status === 'active' ? 'success' : 'neutral'"
              :label="source.status === 'active' ? '已导入' : '已撤销'" />
            <ForgeButton v-if="source.status === 'active'" variant="secondary" @click="openSource(source)">查看原文定位</ForgeButton>
            <ForgeButton v-if="source.status === 'active'" variant="danger" @click="revokeTarget = source; revokeOpen = true">撤销来源</ForgeButton>
          </li>
        </ul>
      </ForgeCard>
      <ForgeCard v-if="selected" tone="reading" class="knowledge-panel" aria-label="原文定位">
        <h2>原文定位</h2>
        <p>{{ selected.sourceRef }} · 第 {{ selected.startLine }}–{{ selected.endLine }} 行 · {{ selected.status }}</p>
        <pre>{{ selected.text }}</pre>
        <p>此处显示 Host 保存的原文片段；不是模型生成结果，也未运行检索。</p>
        <ForgeButton variant="secondary" :disabled="!environmentId" @click="startProposal">从此来源提议记忆</ForgeButton>
      </ForgeCard>
      <ForgeCard v-if="editing || (selected && memoryText)" tone="reading" class="knowledge-panel">
        <h2>{{ editing ? '编辑候选记忆' : '提议候选记忆' }}</h2>
        <p>来源：{{ editing ? editing.sources.map((item) => item.sourceRef).join('，') : selected?.sourceRef }}。只有人工确认且来源有效的记忆才可检索。</p>
        <ForgeInput v-model="memorySubject" label="主题键（小写字母开头）" placeholder="api.date_filter" :disabled="!!editing" />
        <ForgeInput v-model="memoryText" label="记忆内容" placeholder="基于原文描述当前事实" />
        <label class="memory-expiry">到期日（可选）<input v-model="memoryExpiry" type="date" /></label>
        <div class="knowledge-actions">
          <ForgeButton variant="primary" :disabled="busy || !memoryText.trim() || (!editing && !memorySubject.trim())" @click="saveMemory">保存候选</ForgeButton>
          <ForgeButton variant="ghost" @click="editing = null; memoryText = ''">取消</ForgeButton>
        </div>
      </ForgeCard>
      <ForgeCard tone="reading" class="knowledge-panel" aria-label="项目记忆">
        <h2>项目记忆</h2>
        <p>候选仅供审阅；已确认记忆仍受来源、环境和到期时间约束。撤销会清空 Forge 的记忆正文与检索索引，保留审计墓碑。已有 Run 的来源引用不会被伪装为当前有效。</p>
        <p v-if="memoryResult" role="status">当前查询返回 {{ memoryResult.items.length }} 条有效记忆；{{ memoryResult.conflicts.length }} 个冲突。</p>
        <ul v-if="memoryResult?.conflicts.length" class="knowledge-list">
          <li v-for="conflict in memoryResult.conflicts" :key="conflict.candidateMemoryId" role="alert">{{ conflict.question }} · {{ conflict.subjectKey }}</li>
        </ul>
        <ForgeEmptyState v-if="!memories.length" title="尚无项目记忆" description="先从真实来源片段提议候选，再由人确认。" />
        <ul v-else class="knowledge-list">
          <li v-for="item in memories" :key="item.memoryId">
            <div>
              <strong>{{ item.subjectKey }}</strong>
              <p>v{{ item.revision }} · {{ item.scope }} · 来源 {{ item.sources.map((source) => source.sourceRef).join('，') }} · SHA-256 {{ item.contentHash.slice(0, 12) }}…</p>
              <p v-if="item.expiresAt">到期 {{ item.expiresAt.slice(0, 10) }}</p>
              <pre v-if="item.text">{{ item.text }}</pre><p v-else>正文已撤销</p>
            </div>
            <StatusTag :tone="item.status === 'validated' ? 'success' : item.status === 'candidate' ? 'info' : 'neutral'"
              :label="item.status === 'candidate' ? '候选' : item.status === 'validated' ? '已确认' : item.status === 'stale' ? '过时' : '已撤销'" />
            <ForgeButton v-if="item.status === 'candidate'" variant="secondary" @click="startEdit(item)">编辑</ForgeButton>
            <ForgeButton v-if="item.status === 'candidate'" variant="primary" @click="requestDecision(item, 'validate')">确认记忆</ForgeButton>
            <ForgeButton v-if="item.status === 'validated'" variant="secondary" @click="requestDecision(item, 'deprecate')">标记过时</ForgeButton>
            <ForgeButton v-if="item.status !== 'revoked'" variant="danger" @click="requestDecision(item, 'revoke')">撤销记忆</ForgeButton>
          </li>
        </ul>
      </ForgeCard>
    </template>
    <ForgeDialog v-model:open="revokeOpen" title="从 Forge 撤销此资料来源？">
      <p>撤销后原文索引内容清空，引用保留墓碑；项目文件不会删除。</p>
      <div class="knowledge-actions">
        <ForgeButton variant="secondary" @click="revokeOpen = false">取消</ForgeButton>
        <ForgeButton variant="danger" :disabled="busy" @click="revoke">确认撤销</ForgeButton>
      </div>
    </ForgeDialog>
    <ForgeDialog v-model:open="decisionOpen" title="确认项目记忆决定？">
      <p>操作：{{ decisionAction }} · {{ decisionTarget?.subjectKey }}。这只管理 Forge 记忆，不授权 Agent 执行或更改已有 Run。</p>
      <p v-if="replacement">将明确替换已确认记忆 {{ replacement.memoryId }}；旧版标为过时。</p>
      <ForgeInput v-model="decisionReason" label="人工决定理由（至少 12 字符）" placeholder="说明为何当前来源适用" />
      <div class="knowledge-actions">
        <ForgeButton variant="secondary" @click="decisionOpen = false">取消</ForgeButton>
        <ForgeButton :variant="decisionAction === 'revoke' ? 'danger' : 'primary'"
          :disabled="busy || decisionReason.trim().length < 12" @click="decideMemory">确认此决定</ForgeButton>
      </div>
    </ForgeDialog>
  </section>
</template>

<style scoped>
.knowledge-view { width: 100%; min-width: 0; padding: var(--forge-space-32); display: grid; gap: var(--forge-space-20); }
.knowledge-view > p, .knowledge-panel p { color: var(--forge-color-text-secondary); }
.knowledge-panel { max-width: 1000px; padding: var(--forge-space-24); }
.knowledge-actions { display: flex; flex-wrap: wrap; gap: var(--forge-space-8); align-items: end; }
.knowledge-actions > :first-child { flex: 1; min-width: 240px; }
.knowledge-list { list-style: none; padding: 0; display: grid; gap: var(--forge-space-12); }
.knowledge-list li { display: flex; flex-wrap: wrap; gap: var(--forge-space-12); align-items: center;
  padding: var(--forge-space-16); border: 1px solid var(--forge-color-line);
  border-radius: var(--forge-radius-lg); }
.knowledge-list li > div { flex: 1; min-width: 240px; overflow-wrap: anywhere; }
.knowledge-panel pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 400px;
  overflow: auto; padding: var(--forge-space-16); background: var(--forge-surface-reading); }
.memory-expiry { display: grid; gap: var(--forge-space-8); margin: var(--forge-space-12) 0; }
.memory-expiry input { padding: var(--forge-space-12); border: 1px solid var(--forge-color-line);
  border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); color: var(--forge-color-text); }
@media (max-width: 720px) { .knowledge-view { padding: var(--forge-space-16); } }
</style>
