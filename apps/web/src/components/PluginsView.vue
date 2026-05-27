<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { BundledPluginInspection } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeSchemaForm, StatusTag } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean;
  readOnly?: boolean }>();
const inspection = ref<BundledPluginInspection | null>(null);
const executorAvailable = ref<boolean | null>(null);
const canStartCodex = computed(() => Boolean(!props.readOnly && inspection.value?.compatible && inspection.value.active &&
  inspection.value.enabled && inspection.value.configApplied && !inspection.value.restartRequired && executorAvailable.value));
const contributionGroups = computed(() => {
  const contributes = inspection.value?.manifest?.contributes;
  return [
    { label: 'Executor', ids: contributes?.executors ?? [] },
    { label: 'Model Provider', ids: contributes?.modelProviders ?? [] },
    { label: 'Context Provider', ids: contributes?.contextProviders ?? [] },
    { label: 'Verifier', ids: contributes?.verifiers ?? [] },
    { label: 'Tool', ids: contributes?.tools ?? [] },
    { label: 'View', ids: contributes?.viewTypes ?? [] },
  ];
});
const loading = ref(false);
const actionPending = ref(false);
const error = ref('');
const formNotice = ref('');

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) {
    inspection.value = null; executorAvailable.value = null; return;
  }
  loading.value = true; error.value = '';
  formNotice.value = '';
  try {
    inspection.value = await props.client.inspectBundledPlugin();
    try {
      const catalog = await props.client.agentProfileCatalog();
      executorAvailable.value = catalog?.executors.find((item) =>
        item.executorId === 'executor.codex')?.available ?? null;
    } catch { executorAvailable.value = null; }
  } catch {
    inspection.value = null; executorAvailable.value = null;
    error.value = '无法读取 Host 的插件诊断。';
  }
  finally { loading.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
async function saveConfig(config: Record<string, string | number | boolean>): Promise<void> {
  if (props.readOnly || !inspection.value) return;
  actionPending.value = true; error.value = ''; formNotice.value = '';
  try {
    inspection.value = await props.client.saveBundledPluginConfig({
      expectedRevision: inspection.value.configRevision, config,
    });
    formNotice.value = '配置已保存到 Host。重启 Forge 后应用于新 Run；现有 Run 不变。';
  } catch (cause) {
    error.value = cause instanceof Error && cause.message.includes('PLUGIN_CONFIG_REVISION_CONFLICT')
      ? '配置已在其他窗口更新；请刷新诊断后重新编辑。'
      : '配置未保存。请检查字段、插件兼容性与 Host 诊断。';
  } finally { actionPending.value = false; }
}
async function setEnabled(enabled: boolean): Promise<void> {
  if (props.readOnly) return;
  actionPending.value = true; error.value = '';
  try { inspection.value = await props.client.setBundledPluginEnabled(enabled); }
  catch (cause) {
    error.value = cause instanceof Error && cause.message.includes('PLUGIN_BUSY')
      ? '插件仍被正在运行的任务使用。请先完成或取消该任务，再停用插件。'
      : '插件状态未改变。请检查 Host 诊断后重试。';
  } finally { actionPending.value = false; }
}
</script>

<template>
  <section class="plugins-view" aria-labelledby="plugins-title">
    <p class="eyebrow">FORGE / PLUGINS</p>
    <h1 id="plugins-title">插件</h1>
    <p class="plugins-intro">仅显示当前 Python Host 中已打包的插件。配置表单由 Host 提供的受限 Schema 生成。</p>
    <ForgeCard tone="reading" class="plugins-panel">
      <ForgeEmptyState v-if="!desktop" title="本地插件需要 Forge Desktop" description="Web 当前没有 Remote Host，也不会读取本机插件。" />
      <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接到 Python Host 后查看真实插件状态。" />
      <p v-else-if="loading" role="status">正在读取插件诊断…</p>
      <template v-else-if="inspection">
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="plugins-heading"><div><h2 :title="inspection.pluginId">{{ inspection.pluginId }}</h2><p>版本 {{ inspection.version ?? '未知' }} · Forge API {{ inspection.forgeApiRange ?? '未知' }}</p></div>
          <StatusTag :tone="!readOnly && inspection.compatible && inspection.active && inspection.enabled && !inspection.restartRequired ? 'success' : 'warning'"
            :label="readOnly ? '历史只读' : !inspection.enabled ? '已停用' : inspection.restartRequired && inspection.active ? '配置待重启' : inspection.compatible && inspection.active ? '已装配' : '不可用'" /></div>
        <div class="plugins-heading" aria-label="Codex 执行能力"><div><strong>Codex 执行能力</strong>
          <p v-if="canStartCodex">插件和本机 Codex 能力探测均已通过；启动具体任务时仍会重新检查。</p>
          <p v-else-if="readOnly">历史数据只读；不能从此窗口启动或配置执行器。</p>
          <p v-else-if="!inspection.enabled || inspection.restartRequired">当前插件配置尚未应用于新 Run；请重启 Forge。</p>
          <p v-else-if="executorAvailable === null">执行能力尚未核验；请刷新诊断。</p>
          <p v-else>当前执行器不可启动。请到「设置 → 本机依赖」查看 CLI、版本与登录结果。</p>
        </div><StatusTag :tone="canStartCodex ? 'success' : 'warning'" :label="canStartCodex ? '可启动' : '不可启动'" /></div>
        <p v-if="inspection.restartRequired" role="status">插件设置已保存。退出并重开 Forge 后，Host 将重新装配插件；在此之前不可启动新 Run。</p>
        <p v-if="!inspection.enabled">此插件已停用。新的 Codex Run 与模型整理不可用；现有项目和看板仍可查看。</p>
        <section v-if="inspection.manifest" class="plugin-manifest" aria-label="插件声明与权限">
          <h3>插件声明</h3>
          <p>来自包内锁定清单；贡献点表示插件声明，实际启动仍取决于当前能力探测与任务权限。</p>
          <dl class="plugin-facts">
            <div><dt>来源</dt><dd>{{ inspection.manifest.source }}</dd></div>
            <div><dt>内容摘要</dt><dd :title="inspection.manifest.contentHash"><code>{{ inspection.manifest.contentHash.slice(0, 16) }}…</code></dd></div>
            <div><dt>适用平台声明</dt><dd>{{ inspection.manifest.supportedPlatforms.join('、') }}</dd></div>
            <div><dt>依赖服务</dt><dd>{{ inspection.manifest.requires.join('、') || '无' }}</dd></div>
            <div><dt>运行引用</dt><dd>{{ inspection.activeRunRefs.length }} 个<span v-if="inspection.draining"> · 正在等待运行释放</span></dd></div>
          </dl>
          <h3>贡献点</h3>
          <ul class="plugin-declarations">
            <li v-for="group in contributionGroups" :key="group.label">
              <strong>{{ group.label }}</strong><span>{{ group.ids.join('、') || '未声明' }}</span>
            </li>
          </ul>
          <h3>权限范围</h3>
          <p>请求：{{ inspection.manifest.requestedPermissions.join('、') || '无' }}</p>
          <p>当前授予：{{ inspection.manifest.grantedPermissions.join('、') || '无' }}。项目可信不代表自动批准具体操作。</p>
        </section>
        <ul v-if="inspection.issues.length" class="plugins-issues" aria-label="插件兼容性问题"><li v-for="issue in inspection.issues" :key="`${issue.code}:${issue.path}`"><strong>{{ issue.code }}</strong> · {{ issue.message }}</li></ul>
        <p v-if="inspection.issues.some((issue) => issue.code === 'PLUGIN_CONFIG_STALE' || issue.code === 'PLUGIN_CONFIG_INVALID') && inspection.manifest"
          role="status">已保存的配置与当前插件不匹配。请检查下面的当前版本字段，重新保存后重启 Forge。</p>
        <section v-if="inspection.faults.length" aria-label="插件故障诊断"><h3>故障诊断</h3>
          <ul class="plugins-issues"><li v-for="(fault, index) in inspection.faults" :key="`${fault.code}:${index}`">
            <strong>{{ fault.code }}</strong> · {{ fault.phase }}<span v-if="fault.runId"> · Run {{ fault.runId }}</span> · {{ fault.recordedAt }}
          </li></ul></section>
        <p v-if="!inspection.configSchema" class="plugins-warning">配置 Schema 未通过校验，不显示配置表单。</p>
        <template v-else>
          <h3>配置</h3>
          <p v-if="Object.keys(inspection.configSchema.properties).length === 0">当前插件没有可编辑配置项。模型、认证和权限由各自的正式边界管理。</p>
          <template v-else-if="!readOnly"><p>仅保存 Schema 声明的配置。模型、认证和权限仍由各自的正式边界管理；当前插件不接收密钥。</p>
            <ForgeSchemaForm :schema="inspection.configSchema" :initial-values="inspection.configValues"
              :disabled="!inspection.manifest || actionPending" submit-label="保存配置" @submit="saveConfig" />
            <p v-if="formNotice" role="status">{{ formNotice }}</p>
          </template>
        </template>
        <div class="plugin-actions">
          <ForgeButton v-if="!readOnly && inspection.enabled" variant="danger" :disabled="actionPending" @click="setEnabled(false)">停用 Codex 插件</ForgeButton>
          <ForgeButton v-else-if="!readOnly" variant="secondary" :disabled="actionPending" @click="setEnabled(true)">启用并在重启后生效</ForgeButton>
          <ForgeButton variant="ghost" :disabled="actionPending" @click="load">刷新诊断</ForgeButton>
        </div>
      </template>
      <p v-else-if="error" role="alert">{{ error }}</p>
    </ForgeCard>
  </section>
</template>

<style scoped>
.plugins-view { width: 100%; min-width: 0; padding: var(--forge-space-32); }
.plugins-view h1 { margin: 0 0 var(--forge-space-8); }
.plugins-intro { color: var(--forge-color-text-secondary); }
.plugins-panel { max-width: 780px; margin-top: var(--forge-space-24); padding: var(--forge-space-24); display: grid; gap: var(--forge-space-16); }
.plugins-heading { display: flex; justify-content: space-between; gap: var(--forge-space-16); align-items: start; min-width: 0; }
.plugins-heading > div { min-width: 0; }
.plugins-heading h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
.plugins-heading p, .plugins-panel > p { margin: var(--forge-space-6) 0; color: var(--forge-color-text-secondary); overflow-wrap: anywhere; }
.plugins-warning { color: var(--forge-color-danger) !important; }
.plugin-manifest { display: grid; gap: var(--forge-space-12); border-top: var(--forge-border-subtle); padding-top: var(--forge-space-20); }
.plugin-manifest h3, .plugin-manifest p { margin: 0; }
.plugin-facts { display: grid; gap: var(--forge-space-8); margin: 0; }
.plugin-facts > div { display: grid; grid-template-columns: minmax(105px, 0.3fr) minmax(0, 1fr); gap: var(--forge-space-8); }
.plugin-facts dt { color: var(--forge-color-text-secondary); }
.plugin-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.plugin-declarations { display: grid; gap: var(--forge-space-8); margin: 0; padding: 0; list-style: none; }
.plugin-declarations li { display: grid; grid-template-columns: minmax(105px, 0.3fr) minmax(0, 1fr); gap: var(--forge-space-8); }
.plugin-declarations span { min-width: 0; overflow-wrap: anywhere; }
.plugin-actions { display: flex; flex-wrap: wrap; gap: var(--forge-space-8); }
.plugins-issues { margin: 0; padding-left: var(--forge-space-20); color: var(--forge-color-danger); overflow-wrap: anywhere; }
@media (max-width: 720px) { .plugins-view { padding: var(--forge-space-16); } .plugins-heading { flex-wrap: wrap; } }
</style>
