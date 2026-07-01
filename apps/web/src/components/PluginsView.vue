<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { BundledPluginInspection } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, ForgeSchemaForm, StatusTag } from '@forge/ui';

const props = defineProps<{ client: ForgeClient; desktop: boolean; connected: boolean }>();
const inspection = ref<BundledPluginInspection | null>(null);
const loading = ref(false);
const actionPending = ref(false);
const error = ref('');
const formNotice = ref('');

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) { inspection.value = null; return; }
  loading.value = true; error.value = '';
  try { inspection.value = await props.client.inspectBundledPlugin(); }
  catch { inspection.value = null; error.value = '无法读取 Host 的插件诊断。'; }
  finally { loading.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
function validateDraft(): void {
  formNotice.value = '格式检查通过。插件配置保存和凭据管理尚未启用；此页面没有提交到 Host。';
}
async function setEnabled(enabled: boolean): Promise<void> {
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
          <StatusTag :tone="inspection.compatible && inspection.active && inspection.enabled ? 'success' : 'warning'" :label="!inspection.enabled ? '已停用' : inspection.compatible && inspection.active ? '已装配' : '不可用'" /></div>
        <p v-if="inspection.restartRequired" role="status">启用偏好已保存。退出并重开 Forge 后，Host 将重新装配插件；在此之前不可启动新 Run。</p>
        <p v-if="!inspection.enabled">此插件已停用。新的 Codex Run 与模型整理不可用；现有项目和看板仍可查看。</p>
        <ul v-if="inspection.issues.length" class="plugins-issues" aria-label="插件兼容性问题"><li v-for="issue in inspection.issues" :key="`${issue.code}:${issue.path}`"><strong>{{ issue.code }}</strong> · {{ issue.message }}</li></ul>
        <section v-if="inspection.faults.length" aria-label="插件故障诊断"><h3>故障诊断</h3>
          <ul class="plugins-issues"><li v-for="(fault, index) in inspection.faults" :key="`${fault.code}:${index}`">
            <strong>{{ fault.code }}</strong> · {{ fault.phase }}<span v-if="fault.runId"> · Run {{ fault.runId }}</span> · {{ fault.recordedAt }}
          </li></ul></section>
        <p v-if="!inspection.configSchema" class="plugins-warning">配置 Schema 未通过校验，不显示配置表单。</p>
        <template v-else>
          <h3>配置</h3>
          <p v-if="Object.keys(inspection.configSchema.properties).length === 0">当前插件没有可编辑配置项。模型、认证和权限由各自的正式边界管理。</p>
          <template v-else><p>Secret 字段只接受凭据引用，密钥原文不会回显或发送。</p>
            <ForgeSchemaForm :schema="inspection.configSchema" :disabled="!inspection.compatible" submit-label="检查配置" @submit="validateDraft" />
            <p v-if="formNotice" role="status">{{ formNotice }}</p>
          </template>
        </template>
        <div class="plugin-actions">
          <ForgeButton v-if="inspection.enabled" variant="danger" :disabled="actionPending" @click="setEnabled(false)">停用 Codex 插件</ForgeButton>
          <ForgeButton v-else variant="secondary" :disabled="actionPending" @click="setEnabled(true)">启用并在重启后生效</ForgeButton>
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
.plugin-actions { display: flex; flex-wrap: wrap; gap: var(--forge-space-8); }
.plugins-issues { margin: 0; padding-left: var(--forge-space-20); color: var(--forge-color-danger); overflow-wrap: anywhere; }
@media (max-width: 720px) { .plugins-view { padding: var(--forge-space-16); } .plugins-heading { flex-wrap: wrap; } }
</style>
