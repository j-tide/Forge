<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { BundledPluginInspection } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeSchemaForm, StatusTag } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean;
  readOnly?: boolean }>();
const emit = defineEmits<{ openSettings: [] }>();
const inspection = ref<BundledPluginInspection | null>(null);
const executorAvailable = ref<boolean | null>(null);
const canStartCodex = computed(() => Boolean(!props.readOnly && inspection.value?.compatible && inspection.value.active &&
  inspection.value.enabled && inspection.value.configApplied && !inspection.value.restartRequired && executorAvailable.value));
const probePending = computed(() => Boolean(!props.readOnly && inspection.value?.compatible && inspection.value.active &&
  inspection.value.enabled && inspection.value.configApplied && !inspection.value.restartRequired && executorAvailable.value === null));
const executorStateLabel = computed(() => {
  if (canStartCodex.value) return '可启动';
  if (probePending.value) return '待核验';
  return '不可启动';
});
const pluginState = computed(() => {
  if (props.readOnly) return { label: '历史只读', tone: 'warning' as const };
  if (!inspection.value?.enabled) return { label: '已停用', tone: 'warning' as const };
  if (inspection.value.restartRequired) return { label: '配置待重启', tone: 'warning' as const };
  if (!inspection.value.compatible || !inspection.value.active || !inspection.value.configApplied) {
    return { label: '不可用', tone: 'danger' as const };
  }
  return { label: '已装配', tone: 'success' as const };
});
const availabilityNote = computed(() => {
  if (props.readOnly) return '历史数据只读；不能从此窗口启动或配置执行器。';
  if (!inspection.value?.enabled) return '插件已停用。新的 Codex Run 与模型整理不可用。';
  if (inspection.value.restartRequired) return '配置已保存。请重启 Forge，变更才会应用到新 Run。';
  if (!inspection.value.compatible || !inspection.value.active || !inspection.value.configApplied) {
    return '插件尚未成功装配。请展开诊断查看原因。';
  }
  if (executorAvailable.value === null) return '执行能力尚未核验；请刷新诊断。';
  if (!executorAvailable.value) return '当前执行器不可启动。请到「设置 → 本机依赖」查看 CLI、版本与登录结果。';
  return '插件和本机 Codex 能力探测均已通过；启动具体任务时仍会重新检查。';
});
const hasConfigFields = computed(() => Boolean(inspection.value?.configSchema &&
  Object.keys(inspection.value.configSchema.properties).length));
const pluginKinds = computed(() => {
  const contributes = inspection.value?.manifest?.contributes;
  if (!contributes) return '声明不可用';
  const kinds = [
    contributes.executors.length ? 'Executor' : '',
    contributes.modelProviders.length ? 'Model Provider' : '',
  ].filter(Boolean);
  return kinds.join(' · ') || '无执行贡献';
});
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
    <header class="plugins-page-header">
      <div><h1 id="plugins-title">插件与集成</h1>
        <p>管理已装配的插件，确认它们能否在当前设备运行。</p></div>
      <ForgeButton v-if="desktop && connected" variant="secondary" size="sm" :disabled="loading || actionPending" @click="load">刷新状态</ForgeButton>
    </header>
    <ForgeCard v-if="!desktop" tone="reading" class="plugins-empty"><ForgeEmptyState title="本地插件需要 Forge Desktop" description="Web 当前没有 Remote Host，也不会读取本机插件。" /></ForgeCard>
    <ForgeCard v-else-if="!connected" tone="reading" class="plugins-empty"><ForgeEmptyState title="Host unavailable" description="连接到 Python Host 后查看真实插件状态。" /></ForgeCard>
    <p v-else-if="loading" class="plugins-loading" role="status">正在读取插件状态…</p>
    <div v-else-if="inspection" class="plugins-workspace">
      <aside class="plugins-list" aria-label="已安装插件">
        <div class="plugins-list-heading"><strong>当前插件</strong><span>1</span></div>
        <div class="plugin-list-item" aria-current="true">
          <span class="plugin-mark" aria-hidden="true">C</span>
          <span class="plugin-list-copy"><strong>Codex</strong><small>{{ pluginKinds }}</small></span>
          <span class="plugin-list-state" :data-ready="canStartCodex">{{ executorStateLabel }}</span>
        </div>
      </aside>
      <div class="plugins-detail">
        <div class="plugins-heading">
          <div class="plugin-title-row"><span class="plugin-mark plugin-mark-large" aria-hidden="true">C</span><div>
            <h2>Codex</h2>
            <p :title="inspection.pluginId">{{ inspection.pluginId }} · v{{ inspection.version ?? '未知' }}</p>
          </div></div>
          <div class="plugin-actions">
            <StatusTag :tone="pluginState.tone" :label="pluginState.label" />
            <ForgeButton v-if="!readOnly && inspection.enabled" variant="secondary" size="sm" :disabled="actionPending" @click="setEnabled(false)">停用 Codex 插件</ForgeButton>
            <ForgeButton v-else-if="!readOnly" variant="secondary" size="sm" :disabled="actionPending" @click="setEnabled(true)">启用并在重启后生效</ForgeButton>
          </div>
        </div>
        <p v-if="error" class="plugin-alert" role="alert">{{ error }}</p>
        <section class="plugin-readiness" aria-label="Codex 执行能力" :data-ready="canStartCodex">
          <div><p class="plugin-section-label">本机执行能力</p>
            <strong>{{ canStartCodex ? '可用于新的 Run' : probePending ? '执行能力尚未核验' : '当前不可启动' }}</strong>
            <p>{{ availabilityNote }}</p>
          </div>
          <StatusTag :tone="canStartCodex ? 'success' : 'warning'" :label="executorStateLabel" />
          <button v-if="!readOnly && executorAvailable === false && inspection.enabled && !inspection.restartRequired"
            type="button" class="plugin-settings-link" @click="emit('openSettings')">检查本机依赖 <span aria-hidden="true">↗</span></button>
        </section>
        <p v-if="inspection.restartRequired" class="plugin-notice" role="status">插件设置已保存。退出并重开 Forge 后，Host 将重新装配插件；在此之前不可启动新 Run。</p>
        <section class="plugin-config" aria-labelledby="plugin-config-title">
          <div class="plugin-section-heading"><div><p class="plugin-section-label">PLUGIN SETTINGS</p><h3 id="plugin-config-title">运行配置</h3><p>保存后重启 Forge，变更才会用于新的 Run。</p></div>
            <small>配置版本 {{ inspection.configRevision }}</small></div>
          <p v-if="!inspection.configSchema" class="plugins-warning">配置 Schema 未通过校验，不显示配置表单。</p>
          <p v-else-if="!hasConfigFields">当前插件没有可编辑配置项。模型、认证和权限由各自的正式边界管理。</p>
          <p v-else-if="readOnly">历史数据只读；插件配置不可编辑。</p>
          <template v-else>
            <ForgeSchemaForm :schema="inspection.configSchema" :initial-values="inspection.configValues"
              :unset-value-hints="{ appServerInitializationTimeoutSeconds: '留空使用默认值 15 秒；保存时不写入覆盖值。' }"
              :disabled="!inspection.manifest || actionPending" submit-label="保存配置" @submit="saveConfig" />
            <p class="plugin-config-note">此处只接收 Schema 声明的字段，不接收原始密钥。</p>
            <p v-if="formNotice" role="status">{{ formNotice }}</p>
          </template>
        </section>
        <details class="plugin-diagnostics" :open="inspection.issues.length > 0 || inspection.faults.length > 0 || undefined">
          <summary>声明与诊断 <span>{{ inspection.issues.length + inspection.faults.length }} 个问题</span></summary>
          <div class="plugin-diagnostics-body">
            <p v-if="inspection.issues.some((issue) => issue.code === 'PLUGIN_CONFIG_STALE' || issue.code === 'PLUGIN_CONFIG_INVALID') && inspection.manifest"
              role="status">已保存的配置与当前插件不匹配。请检查当前版本字段，重新保存后重启 Forge。</p>
            <ul v-if="inspection.issues.length" class="plugins-issues" aria-label="插件兼容性问题"><li v-for="issue in inspection.issues" :key="`${issue.code}:${issue.path}`"><strong>{{ issue.code }}</strong> · {{ issue.message }}</li></ul>
            <section v-if="inspection.faults.length" aria-label="插件故障诊断"><h3>故障诊断</h3>
              <ul class="plugins-issues"><li v-for="(fault, index) in inspection.faults" :key="`${fault.code}:${index}`">
                <strong>{{ fault.code }}</strong> · {{ fault.phase }}<span v-if="fault.runId"> · Run {{ fault.runId }}</span> · {{ fault.recordedAt }}
              </li></ul></section>
            <section v-if="inspection.manifest" class="plugin-manifest" aria-label="插件声明与权限">
              <h3>插件声明</h3>
              <p>清单声明不代表当前可执行；实际能力以 Host 探测与任务权限为准。</p>
              <dl class="plugin-facts">
                <div><dt>来源</dt><dd>{{ inspection.manifest.source }}</dd></div>
                <div><dt>内容摘要</dt><dd :title="inspection.manifest.contentHash"><code>{{ inspection.manifest.contentHash.slice(0, 16) }}…</code></dd></div>
                <div><dt>Forge API</dt><dd>{{ inspection.forgeApiRange ?? '未知' }}</dd></div>
                <div><dt>适用平台声明</dt><dd>{{ inspection.manifest.supportedPlatforms.join('、') }}</dd></div>
                <div><dt>依赖服务</dt><dd>{{ inspection.manifest.requires.join('、') || '无' }}</dd></div>
                <div><dt>运行引用</dt><dd>{{ inspection.activeRunRefs.length }} 个<span v-if="inspection.draining"> · 正在等待运行释放</span></dd></div>
              </dl>
              <h3>贡献点</h3>
              <ul class="plugin-declarations"><li v-for="group in contributionGroups" :key="group.label"><strong>{{ group.label }}</strong><span>{{ group.ids.join('、') || '未声明' }}</span></li></ul>
              <h3>权限范围</h3>
              <p>请求：{{ inspection.manifest.requestedPermissions.join('、') || '无' }}</p>
              <p>当前授予：{{ inspection.manifest.grantedPermissions.join('、') || '无' }}。项目可信不代表自动批准具体操作。</p>
            </section>
          </div>
        </details>
      </div>
    </div>
    <p v-else-if="error" class="plugin-alert" role="alert">{{ error }}</p>
    <ForgeCard v-else tone="reading" class="plugins-empty"><ForgeEmptyState title="没有可查看的插件" description="Host 未返回打包插件的检查结果。" /></ForgeCard>
  </section>
</template>

<style scoped>
.plugins-view { width: 100%; max-width: 1480px; min-width: 0; margin: 0 auto; padding: 34px 38px 64px; color: var(--forge-color-text); }
.plugins-page-header { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
.plugins-page-header h1 { margin: 0 0 8px; font-size: clamp(26px, 2.4vw, 32px); line-height: 1.15; letter-spacing: -.035em; }
.plugins-page-header p:last-child { margin: 0; color: var(--forge-color-text-secondary); font-size: 14px; line-height: 1.5; }
.plugins-workspace { display: grid; grid-template-columns: minmax(212px, 240px) minmax(0, 1fr); gap: 20px; align-items: start; min-width: 0; }
.plugins-list, .plugins-detail, .plugins-empty { border: var(--forge-border-subtle); border-radius: var(--forge-radius-card); background: var(--forge-surface-panel); box-shadow: var(--forge-shadow-surface); }
.plugins-list { padding: 13px; }
.plugins-list-heading { display: flex; justify-content: space-between; padding: 7px 8px 15px; color: var(--forge-color-text-secondary); font-size: 12px; }
.plugins-list-heading span { font-variant-numeric: tabular-nums; }
.plugin-list-item { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 11px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); background: var(--forge-surface-control); }
.plugin-mark { display: grid; flex: none; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: var(--forge-surface-active-rail); color: var(--forge-color-accent-text); font-size: 19px; font-weight: 770; }
.plugin-list-copy { display: grid; gap: 3px; min-width: 0; }
.plugin-list-copy strong { font-size: 14px; }
.plugin-list-copy small { color: var(--forge-color-text-secondary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plugin-list-state { flex: none; margin-left: auto; color: var(--forge-color-warning); font-size: 11px; font-weight: 650; white-space: nowrap; }
.plugin-list-state[data-ready='true'] { color: var(--forge-color-success); }
.plugins-detail { min-width: 0; overflow: hidden; }
.plugins-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 27px 30px; border-bottom: var(--forge-border-subtle); }
.plugin-title-row { display: flex; align-items: center; gap: 17px; min-width: 0; }
.plugin-mark-large { width: 52px; height: 52px; border-radius: 15px; font-size: 25px; }
.plugin-title-row > div { min-width: 0; }
.plugin-title-row h2 { margin: 0 0 5px; font-size: 22px; line-height: 1.15; }
.plugin-title-row p:last-child { margin: 0; color: var(--forge-color-text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.plugin-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; }
.plugin-readiness { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; margin: 24px 30px 4px; padding: 22px 24px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-lg); background: var(--forge-surface-reading); }
.plugin-readiness[data-ready='true'] { border-color: color-mix(in srgb, var(--forge-color-success) 34%, transparent); }
.plugin-section-label { margin: 0 0 8px; color: var(--forge-color-text-secondary); font-size: 11px; font-weight: 680; letter-spacing: .11em; }
.plugin-readiness strong { font-size: 17px; line-height: 1.3; }
.plugin-readiness p:not(.plugin-section-label) { max-width: 66ch; margin: 8px 0 0; color: var(--forge-color-text-secondary); font-size: 13px; line-height: 1.6; }
.plugin-settings-link { justify-self: start; grid-column: 1 / -1; border: 0; padding: 2px 0; background: transparent; color: var(--forge-color-accent); font-size: 13px; font-weight: 650; cursor: pointer; }
.plugin-settings-link:hover { text-decoration: underline; }
.plugin-settings-link:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 3px; }
.plugin-notice, .plugin-alert { margin: 20px 30px 0; padding: 13px 15px; border: var(--forge-border-subtle); border-radius: var(--forge-radius-md); color: var(--forge-color-warning); background: var(--forge-surface-reading); font-size: 13px; line-height: 1.5; }
.plugin-alert { color: var(--forge-color-danger); }
.plugin-config { padding: 31px 30px 35px; }
.plugin-section-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
.plugin-section-heading h3 { margin: 0 0 5px; font-size: 19px; line-height: 1.25; }
.plugin-section-heading p:not(.plugin-section-label), .plugin-config > p { margin: 0; color: var(--forge-color-text-secondary); font-size: 13px; line-height: 1.55; }
.plugin-section-heading small { padding-top: 18px; color: var(--forge-color-text-secondary); font-size: 12px; white-space: nowrap; }
.plugin-config :deep(.forge-schema-form) { max-width: 580px; }
.plugin-config :deep(.forge-schema-form > button) { justify-self: start; min-width: 132px; }
.plugin-config .plugin-config-note { margin-top: 18px; }
.plugins-warning { color: var(--forge-color-danger) !important; }
.plugin-diagnostics { border-top: var(--forge-border-subtle); }
.plugin-diagnostics summary { display: flex; justify-content: space-between; gap: 10px; padding: 20px 30px; color: var(--forge-color-text-secondary); font-size: 13px; font-weight: 650; cursor: pointer; list-style-position: inside; }
.plugin-diagnostics summary:hover { color: var(--forge-color-text); }
.plugin-diagnostics summary:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: -3px; }
.plugin-diagnostics summary span { margin-left: auto; font-weight: 450; }
.plugin-diagnostics-body { display: grid; gap: 16px; padding: 0 30px 30px; color: var(--forge-color-text-secondary); font-size: 13px; line-height: 1.5; }
.plugin-diagnostics-body h3 { margin: 10px 0 8px; color: var(--forge-color-text); font-size: 14px; }
.plugin-diagnostics-body p { margin: 0; }
.plugin-facts, .plugin-declarations { display: grid; gap: 10px; margin: 0; padding: 0; }
.plugin-facts > div, .plugin-declarations li { display: grid; grid-template-columns: minmax(105px, .28fr) minmax(0, 1fr); gap: 12px; }
.plugin-facts dt, .plugin-declarations strong { color: var(--forge-color-text-secondary); font-weight: 550; }
.plugin-facts dd, .plugin-declarations span { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.plugin-declarations { list-style: none; }
.plugins-issues { margin: 0; padding-left: 18px; color: var(--forge-color-danger); overflow-wrap: anywhere; }
.plugins-loading { padding: 30px; color: var(--forge-color-text-secondary); }
.plugins-empty { min-height: 240px; padding: 24px; }
@media (max-width: 850px) { .plugins-workspace { grid-template-columns: 1fr; } .plugins-heading { flex-wrap: wrap; } }
@media (max-width: 560px) { .plugins-view { padding: 20px; } .plugins-page-header { flex-wrap: wrap; } .plugin-readiness { margin: 16px 16px 0; } .plugins-heading, .plugin-config, .plugin-diagnostics summary { padding-left: 18px; padding-right: 18px; } .plugin-diagnostics-body { padding-left: 18px; padding-right: 18px; } }
</style>
