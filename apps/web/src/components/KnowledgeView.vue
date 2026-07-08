<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { KnowledgeChunk, KnowledgeSource, KnowledgeSearchResult,
  ProjectMemory, MemorySearchResult } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeDialog, ForgeEmptyState, ForgeInput, ForgeTextarea, StatusTag } from '@forge/ui';

const props = defineProps<{
  client: ForgeClient; desktop: boolean; connected: boolean; projectId: string | null;
  environmentId?: string | null; readOnly?: boolean;
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
const activeTab = ref<'documents' | 'memories'>('documents');
const importOpen = ref(false);
const proposalOpen = ref(false);
const activeSources = computed(() => sources.value.filter((item) => item.status === 'active'));
const validatedMemories = computed(() => memories.value.filter((item) => item.status === 'validated'));

function sourceLabel(sourceRef: string): string {
  const source = sources.value.find((item) => sourceRef.includes(item.sourceId));
  return source?.relativePath ?? sourceRef;
}

async function refreshMemories(): Promise<void> {
  if (!props.projectId) return;
  memories.value = await props.client.listMemories(props.projectId);
}

async function load(): Promise<void> {
  notice.value = '';
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
  if (props.readOnly) return;
  if (!props.projectId || !relativePath.value.trim()) return;
  busy.value = true;
  try {
    const source = await props.client.importKnowledge(props.projectId, relativePath.value.trim());
    sources.value = await props.client.listKnowledge(props.projectId);
    await refreshMemories();
    searchResult.value = null;
    relativePath.value = '';
    importOpen.value = false;
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
  if (props.readOnly) return;
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
  if (props.readOnly) return;
  if (!selected.value) return;
  memorySubject.value = '';
  memoryText.value = selected.value.text.trim().slice(0, 2000);
  memoryExpiry.value = '';
  editing.value = null;
  activeTab.value = 'memories';
  proposalOpen.value = true;
}
function startEdit(item: ProjectMemory): void {
  if (props.readOnly) return;
  editing.value = item;
  memorySubject.value = item.subjectKey;
  memoryText.value = item.text;
  memoryExpiry.value = item.expiresAt?.slice(0, 10) ?? '';
  activeTab.value = 'memories';
  proposalOpen.value = true;
}
function expiryIso(): string | null {
  if (!memoryExpiry.value) return null;
  return new Date(`${memoryExpiry.value}T23:59:59.000Z`).toISOString();
}
async function saveMemory(): Promise<void> {
  if (props.readOnly) return;
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
    proposalOpen.value = false;
  } catch { notice.value = '记忆保存失败：检查来源是否仍有效、字段格式及修订版本。'; }
  finally { busy.value = false; }
}
function requestDecision(item: ProjectMemory, action: 'validate' | 'deprecate' | 'revoke'): void {
  if (props.readOnly) return;
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
  if (props.readOnly) return;
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
    <header class="knowledge-header">
      <div>
        <p class="knowledge-kicker">PROJECT KNOWLEDGE</p>
        <h1 id="knowledge-title">项目知识</h1>
        <p class="knowledge-lead">把项目文档和已确认的经验带入后续任务。</p>
      </div>
      <div v-if="desktop && connected && projectId" class="knowledge-totals" aria-label="项目知识概况">
        <span><strong>{{ activeSources.length }}</strong> 份资料</span>
        <span><strong>{{ validatedMemories.length }}</strong> 条已确认记忆</span>
      </div>
    </header>

    <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 不访问本机项目资料。" />
    <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接 Python Host 后才能查看项目资料。" />
    <ForgeEmptyState v-else-if="!projectId" title="请先选择项目" description="信任并激活一个真实项目后才能导入其文档。" />
    <template v-else>
      <div class="knowledge-toolbar">
        <nav class="knowledge-tabs" aria-label="项目知识视图">
          <button type="button" :aria-current="activeTab === 'documents' ? 'page' : undefined"
            @click="activeTab = 'documents'">资料 <span>{{ activeSources.length }}</span></button>
          <button type="button" :aria-current="activeTab === 'memories' ? 'page' : undefined"
            @click="activeTab = 'memories'">记忆 <span>{{ validatedMemories.length }}</span></button>
        </nav>
        <ForgeButton v-if="activeTab === 'documents' && !readOnly" variant="primary"
          @click="importOpen = !importOpen">{{ importOpen ? '收起导入' : '导入资料' }}</ForgeButton>
        <ForgeButton variant="ghost" :disabled="busy" @click="load">刷新</ForgeButton>
      </div>
      <p v-if="notice" class="knowledge-notice" role="status">{{ notice }}</p>

      <template v-if="activeTab === 'documents'">
        <ForgeCard v-if="importOpen && !readOnly" tone="reading" class="knowledge-import">
          <div class="knowledge-section-heading"><div><h2>导入项目文件</h2>
            <p>输入项目内的相对路径。仅读取受支持的文档，不运行项目命令。</p></div></div>
          <div class="knowledge-actions">
            <ForgeInput v-model="relativePath" label="文件路径" placeholder="docs/architecture.md"
              description="支持 README、docs / spec / specs / knowledge 中的 Markdown、文本与 OpenAPI；单文件不超过 1 MiB。" />
            <ForgeButton variant="primary" :disabled="busy || !relativePath.trim()" @click="importSource">只读导入</ForgeButton>
          </div>
        </ForgeCard>

        <form class="knowledge-search" @submit.prevent="search">
          <ForgeInput v-model="query" label="搜索项目资料" placeholder="搜索文档内容或术语" />
          <ForgeButton type="submit" variant="secondary" :disabled="busy || !query.trim() || !environmentId">检索</ForgeButton>
        </form>
        <p v-if="!environmentId" class="knowledge-hint">当前环境不可用，暂时无法检索；已导入的来源仍可查看。</p>
        <ForgeCard v-if="searchResult" tone="reading" class="knowledge-results">
          <div class="knowledge-section-heading"><h2>检索结果</h2><span>{{ searchResult.results.length }} 个片段</span></div>
          <ForgeEmptyState v-if="!searchResult.results.length" title="没有匹配的资料"
            description="试试文档中出现的词；Forge 不会编造检索结果。" />
          <ul v-else class="knowledge-result-list">
            <li v-for="result in searchResult.results" :key="result.sourceRef">
              <div class="knowledge-result-header"><strong>{{ result.heading || sourceLabel(result.sourceRef) }}</strong>
                <span>{{ sourceLabel(result.sourceRef) }} · 第 {{ result.startLine }}–{{ result.endLine }} 行</span></div>
              <p>{{ result.text }}</p>
              <code>{{ result.sourceRef }}</code>
            </li>
          </ul>
        </ForgeCard>

        <div class="knowledge-workspace">
          <ForgeCard tone="reading" class="knowledge-sources" aria-label="已导入资料">
            <div class="knowledge-section-heading"><div><h2>已导入资料</h2><p>当前项目的文件来源</p></div></div>
            <p v-if="busy" class="knowledge-hint" role="status">正在读取资料…</p>
            <ForgeEmptyState v-if="!sources.length && !busy" title="尚无资料来源"
              description="导入项目文档后，在这里查看原文和引用。" />
            <ul v-else class="knowledge-source-list">
              <li v-for="source in sources" :key="source.sourceId"
                :class="{ 'knowledge-source-selected': selected?.sourceId === source.sourceId }">
                <div class="knowledge-source-main">
                  <strong>{{ source.relativePath }}</strong>
                  <span>版本 {{ source.version }} · {{ source.chunkCount }} 个片段</span>
                </div>
                <StatusTag :tone="source.status === 'active' ? 'success' : 'neutral'"
                  :label="source.status === 'active' ? '可用' : '已撤销'" />
                <div v-if="source.status === 'active'" class="knowledge-source-actions">
                  <ForgeButton variant="ghost" :disabled="busy || source.chunkCount === 0"
                    @click="openSource(source)">查看原文定位</ForgeButton>
                  <ForgeButton v-if="!readOnly" variant="ghost" :disabled="busy"
                    @click="revokeTarget = source; revokeOpen = true">撤销来源</ForgeButton>
                </div>
              </li>
            </ul>
          </ForgeCard>
          <ForgeCard tone="reading" class="knowledge-preview" aria-label="原文定位">
            <template v-if="selected">
              <div class="knowledge-section-heading"><div><h2>{{ selected.heading || sourceLabel(selected.sourceRef) }}</h2>
                <p>{{ sourceLabel(selected.sourceRef) }} · 第 {{ selected.startLine }}–{{ selected.endLine }} 行</p></div>
                <ForgeButton v-if="!readOnly" variant="secondary" :disabled="!environmentId"
                  @click="startProposal">提议为项目记忆</ForgeButton></div>
              <pre>{{ selected.text }}</pre>
              <p class="knowledge-citation">原文引用 <code>{{ selected.sourceRef }}</code></p>
            </template>
            <div v-else class="knowledge-preview-empty">
              <strong>选择资料查看原文</strong>
              <p>从左侧打开文件片段。运行中实际使用的引用可在运行详情查看。</p>
            </div>
          </ForgeCard>
        </div>
      </template>

      <template v-else>
        <form class="knowledge-search" @submit.prevent="searchMemory">
          <ForgeInput v-model="query" label="搜索已确认记忆" placeholder="搜索项目约定或决策" />
          <ForgeButton type="submit" variant="secondary" :disabled="busy || !query.trim() || !environmentId">检索记忆</ForgeButton>
        </form>
        <p v-if="!environmentId" class="knowledge-hint">当前环境不可用，暂时无法检索记忆。</p>
        <div v-if="memoryResult" class="knowledge-memory-search" role="status">
          <strong>{{ memoryResult.items.length }} 条有效记忆</strong>
          <span v-if="memoryResult.conflicts.length">{{ memoryResult.conflicts.length }} 个待处理冲突</span>
          <span v-else>没有冲突</span>
        </div>
        <ul v-if="memoryResult?.conflicts.length" class="knowledge-conflicts">
          <li v-for="conflict in memoryResult.conflicts" :key="conflict.candidateMemoryId" role="alert">
            {{ conflict.question }} · {{ conflict.subjectKey }}
          </li>
        </ul>
        <ForgeCard v-if="!readOnly && proposalOpen" tone="reading" class="knowledge-proposal">
          <div class="knowledge-section-heading"><div><h2>{{ editing ? '编辑候选记忆' : '提议项目记忆' }}</h2>
            <p>来源：{{ editing ? editing.sources.map((item) => sourceLabel(item.sourceRef)).join('，') : selected ? sourceLabel(selected.sourceRef) : '' }}</p></div></div>
          <div class="knowledge-proposal-fields">
            <ForgeInput v-model="memorySubject" label="主题标识" placeholder="api.date_filter" :disabled="!!editing" />
            <ForgeTextarea v-model="memoryText" label="记忆内容" placeholder="根据原文写下可复用的项目约定" :rows="3" />
            <label class="memory-expiry">到期日（可选）<input v-model="memoryExpiry" type="date" /></label>
          </div>
          <div class="knowledge-actions">
            <ForgeButton variant="primary" :disabled="busy || !memoryText.trim() || (!editing && !memorySubject.trim())"
              @click="saveMemory">保存候选</ForgeButton>
            <ForgeButton variant="ghost" @click="proposalOpen = false; editing = null; memoryText = ''">取消</ForgeButton>
          </div>
          <p class="knowledge-hint">候选须经人工确认，才会进入后续检索。</p>
        </ForgeCard>
        <ForgeCard tone="reading" class="knowledge-memories" aria-label="项目记忆">
          <div class="knowledge-section-heading"><div><h2>项目记忆</h2>
            <p>经确认且来源仍有效的记忆，才会被后续运行检索。</p></div></div>
          <ForgeEmptyState v-if="!memories.length" title="尚无项目记忆"
            description="从资料原文提议一条候选，再确认是否适用于当前项目。" />
          <ul v-else class="knowledge-memory-list">
            <li v-for="item in memories" :key="item.memoryId">
              <div class="knowledge-memory-top"><div><strong>{{ item.subjectKey }}</strong>
                <p>{{ item.scope === 'environment' ? '当前环境' : '整个项目' }} · 修订 {{ item.revision }}
                  <template v-if="item.expiresAt"> · 到期 {{ item.expiresAt.slice(0, 10) }}</template></p></div>
                <StatusTag :tone="item.status === 'validated' ? 'success' : item.status === 'candidate' ? 'info' : 'neutral'"
                  :label="item.status === 'candidate' ? '待确认' : item.status === 'validated' ? '已确认' : item.status === 'stale' ? '已过时' : '已撤销'" /></div>
              <p class="knowledge-memory-text" v-if="item.text">{{ item.text }}</p><p v-else>正文已撤销</p>
              <p class="knowledge-memory-source">来源 {{ item.sources.map((source) => sourceLabel(source.sourceRef)).join('，') }}</p>
              <div v-if="!readOnly" class="knowledge-memory-actions">
                <ForgeButton v-if="item.status === 'candidate'" variant="ghost" @click="startEdit(item)">编辑</ForgeButton>
                <ForgeButton v-if="item.status === 'candidate'" variant="primary" @click="requestDecision(item, 'validate')">确认记忆</ForgeButton>
                <ForgeButton v-if="item.status === 'validated'" variant="secondary" @click="requestDecision(item, 'deprecate')">标记过时</ForgeButton>
                <ForgeButton v-if="item.status !== 'revoked'" variant="ghost" @click="requestDecision(item, 'revoke')">撤销记忆</ForgeButton>
              </div>
            </li>
          </ul>
        </ForgeCard>
      </template>
    </template>
    <ForgeDialog v-model:open="revokeOpen" title="从 Forge 撤销此资料来源？">
      <p>撤销会清除 Forge 中可检索的原文；项目文件不会删除。历史引用仍可审计。</p>
      <div class="knowledge-actions">
        <ForgeButton variant="secondary" @click="revokeOpen = false">取消</ForgeButton>
        <ForgeButton variant="danger" :disabled="busy" @click="revoke">确认撤销</ForgeButton>
      </div>
    </ForgeDialog>
    <ForgeDialog v-model:open="decisionOpen" title="确认项目记忆决定？">
      <p>{{ decisionAction === 'validate' ? '确认记忆' : decisionAction === 'deprecate' ? '标记过时' : '撤销记忆' }} · {{ decisionTarget?.subjectKey }}。这不会更改已有 Run。</p>
      <p v-if="replacement">将替换该主题的旧版已确认记忆。</p>
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
.knowledge-view { width: 100%; min-width: 0; padding: 28px clamp(20px, 3vw, 42px) 42px; display: grid; align-content: start; gap: 20px; color: var(--forge-color-text); }
.knowledge-view h1, .knowledge-view h2, .knowledge-view p { margin-top: 0; }
.knowledge-header, .knowledge-section-heading, .knowledge-toolbar, .knowledge-result-header, .knowledge-memory-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.knowledge-header { align-items: end; padding-bottom: 18px; border-bottom: var(--forge-border-subtle); }
.knowledge-kicker { margin-bottom: 6px; color: var(--forge-color-text-muted); font: 600 11px var(--forge-font-mono); letter-spacing: .12em; }
.knowledge-header h1 { margin-bottom: 6px; font-size: clamp(24px, 2.2vw, 32px); font-weight: 700; letter-spacing: -.035em; }
.knowledge-lead { margin-bottom: 0; color: var(--forge-color-text-secondary); font-size: 13px; }
.knowledge-totals { display: flex; gap: 14px; white-space: nowrap; color: var(--forge-color-text-muted); font-size: 12px; }
.knowledge-totals strong { color: var(--forge-color-text); font-size: 16px; }
.knowledge-toolbar { min-height: 36px; }
.knowledge-tabs { display: flex; gap: 4px; margin-right: auto; padding: 3px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-panel); }
.knowledge-tabs button { border: 0; border-radius: 6px; padding: 7px 14px; background: transparent; color: var(--forge-color-text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.knowledge-tabs button[aria-current='page'] { background: var(--forge-surface-elevated); color: var(--forge-color-text); box-shadow: var(--forge-shadow-surface); }
.knowledge-tabs button span { margin-left: 7px; color: var(--forge-color-text-muted); font-size: 11px; }
.knowledge-tabs button:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 2px; }
.knowledge-notice, .knowledge-hint { margin: 0; color: var(--forge-color-text-secondary); font-size: 12px; line-height: 1.5; }
.knowledge-notice { padding: 10px 12px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-panel); }
.knowledge-search, .knowledge-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.knowledge-search { max-width: 760px; }
.knowledge-search > :first-child, .knowledge-actions > :first-child { flex: 1; min-width: 220px; }
.knowledge-import, .knowledge-results, .knowledge-sources, .knowledge-preview, .knowledge-proposal, .knowledge-memories { min-width: 0; padding: 18px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-lg); background: var(--forge-surface-panel); }
.knowledge-section-heading { align-items: start; margin-bottom: 15px; }
.knowledge-section-heading h2 { margin: 0; font-size: 15px; font-weight: 650; }
.knowledge-section-heading p { margin: 5px 0 0; color: var(--forge-color-text-muted); font-size: 12px; line-height: 1.5; }
.knowledge-section-heading > span { color: var(--forge-color-text-muted); font-size: 12px; white-space: nowrap; }
.knowledge-workspace { display: grid; grid-template-columns: minmax(280px, 36%) minmax(0, 1fr); gap: 16px; min-height: 320px; }
.knowledge-source-list, .knowledge-result-list, .knowledge-memory-list, .knowledge-conflicts { list-style: none; padding: 0; margin: 0; }
.knowledge-source-list { display: grid; gap: 7px; }
.knowledge-source-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 11px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); }
.knowledge-source-list li.knowledge-source-selected { border-color: var(--forge-color-accent); }
.knowledge-source-main { display: grid; gap: 4px; flex: 1; min-width: 160px; overflow-wrap: anywhere; }
.knowledge-source-main strong { font-size: 13px; font-weight: 600; }
.knowledge-source-main span, .knowledge-memory-top p, .knowledge-memory-source { color: var(--forge-color-text-muted); font-size: 11px; }
.knowledge-source-actions { width: 100%; display: flex; gap: 6px; }
.knowledge-preview pre { max-height: min(48vh, 520px); min-height: 100px; margin: 0; padding: 16px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); overflow: auto; background: var(--forge-surface-reading); color: var(--forge-color-text); font: 12px/1.7 var(--forge-font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.knowledge-preview-empty { display: grid; place-content: center; min-height: 220px; text-align: center; }
.knowledge-preview-empty strong { font-size: 15px; }.knowledge-preview-empty p { max-width: 320px; margin: 8px auto 0; color: var(--forge-color-text-muted); font-size: 12px; line-height: 1.6; }
.knowledge-citation { margin: 10px 0 0; color: var(--forge-color-text-muted); font-size: 11px; overflow-wrap: anywhere; }.knowledge-citation code { color: var(--forge-color-text-secondary); }
.knowledge-result-list { display: grid; gap: 8px; }.knowledge-result-list li { padding: 12px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); }
.knowledge-result-header { align-items: baseline; }.knowledge-result-header strong { font-size: 13px; }.knowledge-result-header span { color: var(--forge-color-text-muted); font-size: 11px; text-align: right; }
.knowledge-result-list p { margin: 9px 0; color: var(--forge-color-text-secondary); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }.knowledge-result-list code { color: var(--forge-color-text-muted); font: 10px var(--forge-font-mono); overflow-wrap: anywhere; }
.knowledge-memory-search { display: flex; gap: 12px; color: var(--forge-color-text-secondary); font-size: 12px; }.knowledge-memory-search strong { color: var(--forge-color-text); }
.knowledge-conflicts { display: grid; gap: 8px; }.knowledge-conflicts li { padding: 12px; border-left: 2px solid var(--forge-color-warning); background: var(--forge-surface-panel); color: var(--forge-color-warning); }
.knowledge-memories { max-width: 1120px; }.knowledge-memory-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 10px; }
.knowledge-memory-list li { min-width: 0; padding: 14px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); }
.knowledge-memory-top { align-items: start; }.knowledge-memory-top strong { overflow-wrap: anywhere; font-size: 13px; }.knowledge-memory-top p { margin: 5px 0 0; }
.knowledge-memory-text { margin: 14px 0 10px; color: var(--forge-color-text); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.knowledge-memory-source { margin-bottom: 12px; overflow-wrap: anywhere; }.knowledge-memory-actions { display: flex; flex-wrap: wrap; gap: 7px; padding-top: 11px; border-top: var(--forge-border-subtle); }
.knowledge-proposal-fields { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(300px, 2fr) 180px; gap: 12px; align-items: start; }.knowledge-proposal > .knowledge-actions { margin: 14px 0 8px; }
.memory-expiry { display: grid; gap: 8px; color: var(--forge-color-text); font-size: 12px; }.memory-expiry input { min-height: 40px; padding: 8px 10px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-control); color: var(--forge-color-text); color-scheme: inherit; }
@media (max-width: 930px) { .knowledge-workspace { grid-template-columns: 1fr; }.knowledge-proposal-fields { grid-template-columns: 1fr 1fr; }.knowledge-proposal-fields > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; } }
@media (max-width: 640px) { .knowledge-view { padding: 18px; }.knowledge-header { align-items: start; flex-direction: column; }.knowledge-toolbar { flex-wrap: wrap; }.knowledge-totals { flex-wrap: wrap; }.knowledge-proposal-fields { grid-template-columns: 1fr; }.knowledge-proposal-fields > :nth-child(2) { grid-column: auto; grid-row: auto; }.knowledge-memory-list { grid-template-columns: 1fr; } }
</style>
