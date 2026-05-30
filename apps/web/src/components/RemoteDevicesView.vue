<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { RemoteLoopbackState } from '@forge/contracts';
import { devicePolicyAuditSchema, pairedDeviceSchema,
  type DevicePolicyAudit, type PairedDevice } from '@forge/contracts';
import { ForgeButton, ForgeCard, ForgeEmptyState, StatusTag } from '@forge/ui';

const props = defineProps<{
  client: ForgeClient; desktop: boolean; connected: boolean; projectId: string | null;
  loopback?: RemoteLoopbackState | null;
}>();
const devices = ref<PairedDevice[]>([]);
const audit = ref<DevicePolicyAudit[]>([]);
const selectedDevice = ref<string | null>(null);
const busy = ref(false);
const notice = ref('');

async function load(): Promise<void> {
  if (!props.desktop || !props.connected) { devices.value = []; return; }
  busy.value = true; notice.value = '';
  try { devices.value = pairedDeviceSchema.array().parse(await props.client.devicePairing({
    type: 'list', payload: {},
  })); }
  catch { notice.value = '无法读取设备清单；请检查 Python Host。'; }
  finally { busy.value = false; }
}
async function showAudit(deviceId: string): Promise<void> {
  if (selectedDevice.value === deviceId) { selectedDevice.value = null; return; }
  busy.value = true; notice.value = '';
  try {
    audit.value = devicePolicyAuditSchema.array().parse(await props.client.devicePairing({
      type: 'audit', payload: { deviceId },
    }));
    selectedDevice.value = deviceId;
  } catch { notice.value = '无法读取该设备的授权审计。'; }
  finally { busy.value = false; }
}
async function changePolicy(device: PairedDevice, kind: 'read-only' | 'remove-project' | 'revoke'): Promise<void> {
  busy.value = true; notice.value = '';
  try {
    let success = '';
    if (kind === 'revoke') {
      await props.client.devicePairing({ type: 'revoke', payload: {
        deviceId: device.deviceId, expectedRevision: device.revision,
      } });
      success = '设备及其会话已撤销；已提交的操作不会回滚。';
    } else {
      const projectIds = kind === 'remove-project'
        ? device.projectIds.filter((id) => id !== props.projectId) : device.projectIds;
      await props.client.devicePairing({ type: 'narrow', payload: {
        deviceId: device.deviceId, expectedRevision: device.revision, projectIds,
        scopes: kind === 'read-only' || projectIds.length === 0 ? [] : device.scopes,
      } });
      success = kind === 'read-only' ? '设备已收窄为只读。' : '已移除当前项目授权。';
    }
    await load();
    notice.value = success;
    selectedDevice.value = null;
  } catch { notice.value = '授权没有更改。设备状态可能已更新，请刷新后重试。'; }
  finally { busy.value = false; }
}
onMounted(() => { void load(); });
watch(() => [props.desktop, props.connected], () => { void load(); });
</script>

<template>
  <section class="remote-devices" aria-labelledby="remote-devices-title">
    <p class="eyebrow">FORGE / REMOTE</p>
    <h2 id="remote-devices-title">远程连接与设备</h2>
    <p class="utility-intro">{{ loopback?.running ? '本机浏览器预览已开启，仅 127.0.0.1 可访问；' : '本机浏览器预览未开启；' }}私网 HTTPS 地址和证书仍未配置，手机尚不能连接。Host 已连接只表示本机业务进程可用，不表示执行器或远程设备在线。</p>
    <ForgeCard tone="reading" class="remote-gateway-facts">
      <div><strong>本机 Python Host</strong><p>{{ connected ? '已连接' : '不可用' }}</p></div>
      <div><strong>本机浏览器预览</strong><p>{{ loopback?.running ? '127.0.0.1 已开启' : '未开启' }}</p></div>
      <div><strong>Host 地址 / 证书</strong><p>未配置 · 不开放公网端口</p></div>
    </ForgeCard>
    <ForgeEmptyState v-if="!desktop" title="需要 Forge Desktop" description="普通 Web 没有本机设备管理能力。" />
    <ForgeEmptyState v-else-if="!connected" title="Host unavailable" description="连接本机 Python Host 后读取设备授权。" />
    <template v-else>
      <div class="remote-device-heading"><h3>已配对设备</h3><ForgeButton variant="secondary" size="sm" :disabled="busy" @click="load">刷新清单</ForgeButton></div>
      <p v-if="busy" role="status">正在读取设备授权…</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <ForgeEmptyState v-if="!busy && devices.length === 0" title="尚无已配对设备" description="先在上方创建一次性配对，并由本机明确批准。" />
      <ForgeCard v-for="device in devices" :key="device.deviceId" tone="reading" class="remote-device-card">
        <div class="remote-device-heading"><div><strong>{{ device.name }}</strong><p>{{ device.addressSummary }} · 设备自报指纹 {{ device.fingerprintSummary }}</p></div><StatusTag :tone="device.status === 'approved' ? 'info' : 'neutral'" :label="device.status === 'approved' ? '已批准' : '已撤销'" /></div>
        <p>Project：{{ device.projectIds.join('、') || '无' }} · 操作：{{ device.scopes.join('、') || '只读' }}</p>
        <p>授权修订 {{ device.revision }} · 批准 {{ device.approvedAt }}<template v-if="device.revokedAt"> · 撤销 {{ device.revokedAt }}</template></p>
        <p>未过期会话凭据 {{ device.validSessionCount }} 个；这不是设备在线状态。</p>
        <div class="diagnostics-actions">
          <ForgeButton variant="secondary" size="sm" :disabled="busy" @click="showAudit(device.deviceId)">{{ selectedDevice === device.deviceId ? '收起审计' : '查看审计' }}</ForgeButton>
          <ForgeButton v-if="device.status === 'approved' && device.scopes.length" variant="secondary" size="sm" :disabled="busy" @click="changePolicy(device, 'read-only')">收窄为只读</ForgeButton>
          <ForgeButton v-if="device.status === 'approved' && projectId && device.projectIds.includes(projectId)" variant="secondary" size="sm" :disabled="busy" @click="changePolicy(device, 'remove-project')">移除当前项目</ForgeButton>
          <ForgeButton v-if="device.status === 'approved'" variant="danger" size="sm" :disabled="busy" @click="changePolicy(device, 'revoke')">撤销设备</ForgeButton>
        </div>
        <div v-if="selectedDevice === device.deviceId" class="remote-audit">
          <p v-if="audit.length === 0">尚无缩权或撤销记录；首次批准时间见上方。</p>
          <p v-for="event in audit" :key="event.eventId">{{ event.decidedAt }} · {{ event.kind === 'narrow' ? '缩权' : '撤销' }} · {{ event.oldRevision }} → {{ event.newRevision }} · Project {{ event.oldProjectIds.length }} → {{ event.newProjectIds.length }} · 操作 {{ event.oldScopes.length }} → {{ event.newScopes.length }}</p>
        </div>
      </ForgeCard>
    </template>
  </section>
</template>
