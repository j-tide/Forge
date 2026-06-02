<script setup lang="ts">
import { ref } from 'vue';
import { ForgeButton, ForgeCard, ForgeDialog } from '@forge/ui';
import type { RemoteApprovalDetail, RemoteApprovalPage } from '@forge/contracts';
import type { MobileSession } from './pairing';
import { approvalFingerprint, createApprovalCommand, readApprovalReceipt,
  submitApproval, type MobileApprovalCommand, type MobileApprovalReceipt } from './approval';
import { readApprovalDetail } from './read';

const props = defineProps<{
  summary: RemoteApprovalPage['items'][number];
  session: MobileSession | null;
  connected: boolean;
}>();
const emit = defineEmits<{
  approved: [receipt: MobileApprovalReceipt];
  stale: [];
  connectionLost: [error: unknown];
  sessionRefreshRequired: [];
}>();
const detail = ref<RemoteApprovalDetail | null>(null);
const busy = ref(false);
const confirming = ref(false);
const message = ref('');
const pendingCommand = ref<MobileApprovalCommand | null>(null);

function offline(): boolean {
  if (props.connected && props.session && navigator.onLine !== false) return false;
  message.value = '当前离线或会话已断开；审批不会排队，也不会在恢复后自动提交。';
  return true;
}
function handleFailure(error: unknown): void {
  if (error instanceof Error && error.message === 'REMOTE_CSRF_REJECTED') {
    // The Host explicitly rejected this write. Refresh the session token, but
    // never replay the decision without a new human review and confirmation.
    pendingCommand.value = null;
    detail.value = null;
    message.value = '会话校验令牌已更新，本次审批未提交。重新检查连接后请审阅当前版本并再次确认。';
    emit('sessionRefreshRequired');
    return;
  }
  if (error instanceof Error && (error.message === 'REMOTE_CURSOR_STALE' ||
      error.message === 'REMOTE_APPROVAL_STALE')) {
    detail.value = null;
    pendingCommand.value = null;
    message.value = '审批已过期、已处理或版本变化；请刷新列表并重新审阅。';
    emit('stale');
    return;
  }
  if (error instanceof TypeError || error instanceof Error &&
      (error.message === 'REMOTE_SESSION_UNAVAILABLE' ||
       error.name === 'AbortError' || error.message === 'REMOTE_GATEWAY_UNAVAILABLE')) {
    message.value = pendingCommand.value
      ? '结果尚未确认。恢复连接后先检查原命令回执；不会自动重试审批。'
      : 'Host 连接中断；审批没有排队。';
    emit('connectionLost', error);
    return;
  }
  message.value = '无法完成本次审批；请核对当前项目授权和合同版本。';
}
function receiptMatchesCurrent(receipt: MobileApprovalReceipt,
                               command: MobileApprovalCommand): boolean {
  return receipt.commandId === command.commandId &&
    receipt.result.approvalId === command.payload.approvalId &&
    receipt.resourceRevision === command.expectedRevision &&
    receipt.result.revision === command.expectedRevision &&
    receipt.result.taskId === detail.value?.taskId;
}
async function view(): Promise<void> {
  if (busy.value || offline()) return;
  busy.value = true; message.value = '';
  try {
    const current = await readApprovalDetail(props.summary.approvalId);
    if (!props.session?.projectIds.includes(current.projectId) ||
        current.projectId !== props.summary.projectId) {
      throw new Error('REMOTE_PROJECT_MISMATCH');
    }
    detail.value = current;
    if (current.expectedRevision !== props.summary.expectedRevision ||
        current.scopeHash !== props.summary.scopeHash ||
        current.expiresAt !== props.summary.expiresAt) {
      message.value = '列表与 Host 当前审批不同。下方是新版本；请重新审阅。';
    }
  } catch (error) { handleFailure(error); }
  finally { busy.value = false; }
}
async function freshDetail(): Promise<RemoteApprovalDetail | null> {
  if (!detail.value || offline()) return null;
  const current = await readApprovalDetail(detail.value.approvalId);
  if (approvalFingerprint(current) !== approvalFingerprint(detail.value)) {
    detail.value = current;
    pendingCommand.value = null;
    message.value = '审批范围、版本或权限说明已变化；请重新审阅后再确认。';
    return null;
  }
  if (Date.parse(current.expiresAt) <= Date.now()) {
    detail.value = null;
    message.value = '审批已过期；请重新读取 Host 的当前审批。';
    return null;
  }
  return current;
}
async function beginConfirm(): Promise<void> {
  if (busy.value || !detail.value || offline()) return;
  busy.value = true; message.value = '';
  try {
    if (await freshDetail()) confirming.value = true;
  } catch (error) { handleFailure(error); }
  finally { busy.value = false; }
}
async function confirm(): Promise<void> {
  if (busy.value || !confirming.value || !detail.value || offline()) return;
  confirming.value = false;
  busy.value = true;
  message.value = '';
  try {
    const current = await freshDetail();
    if (!current || !props.session) return;
    const command = pendingCommand.value ?? createApprovalCommand(current);
    pendingCommand.value = command;
    const receipt = await submitApproval(command, props.session.csrfToken);
    if (!receiptMatchesCurrent(receipt, command)) {
      throw new Error('REMOTE_APPROVAL_RECEIPT_MISMATCH');
    }
    pendingCommand.value = null;
    detail.value = null;
    emit('approved', receipt);
  } catch (error) { handleFailure(error); }
  finally { busy.value = false; }
}
async function checkReceipt(): Promise<void> {
  if (busy.value || !pendingCommand.value || offline()) return;
  busy.value = true;
  try {
    const receipt = await readApprovalReceipt(pendingCommand.value.commandId);
    if (receipt) {
      if (!receiptMatchesCurrent(receipt, pendingCommand.value)) {
        throw new Error('REMOTE_APPROVAL_RECEIPT_MISMATCH');
      }
      pendingCommand.value = null;
      detail.value = null;
      emit('approved', receipt);
    } else message.value = 'Host 尚无这条命令的回执。请重新审阅后人工重试；不会自动提交。';
  } catch (error) { handleFailure(error); }
  finally { busy.value = false; }
}
</script>

<template>
  <ForgeCard tone="reading" class="mobile-task-row mobile-approval">
    <span class="mobile-task-state">待批准 · 需人工确认</span>
    <h2>{{ summary.summary }}</h2>
    <p>合同版本 {{ summary.expectedRevision }} · 到期 {{ summary.expiresAt }}</p>
    <ForgeButton variant="secondary" size="sm" :disabled="busy || !connected"
      @click="view">查看当前范围</ForgeButton>
    <p v-if="message" class="mobile-read-warning" role="status">{{ message }}</p>
    <template v-if="detail">
      <div class="mobile-approval-review" aria-label="当前审批范围">
        <h3>{{ detail.contract.title }}</h3>
        <p>{{ detail.contract.goal }}</p>
        <p>版本 {{ detail.expectedRevision }} · {{ detail.contract.type }} · 优先级 {{ detail.contract.priority }} · 风险：中等</p>
        <p>流程 {{ detail.contract.workflowRef }} · 到期 {{ detail.expiresAt }}</p>
        <p>设备授权：批准当前任务草稿（{{ detail.deviceOperationScope }}）<br />
          本次动作：创建 TODO（{{ detail.requiredScope }}）</p>
        <p>范围摘要：{{ detail.scopeHash.slice(0, 16) }}…</p>
        <p>代码快照：{{ detail.snapshotId === null ? '尚无快照（当前为任务草稿）' : detail.snapshotId }}</p>
        <h4>范围</h4>
        <p>{{ detail.contract.scope.length ? detail.contract.scope.join('、') : '合同未指定文件范围' }}</p>
        <h4>排除范围</h4>
        <p>{{ detail.contract.outOfScope.length ? detail.contract.outOfScope.join('、') : '无' }}</p>
        <h4>约束</h4>
        <p>{{ detail.contract.constraints.length ? detail.contract.constraints.join('、') : '无' }}</p>
        <h4>依赖</h4>
        <p>{{ detail.contract.dependencies.length ? detail.contract.dependencies.join('、') : '无' }}</p>
        <h4>未解决问题</h4>
        <p>{{ detail.contract.openQuestions.length ? detail.contract.openQuestions.join('、') : '无' }}</p>
        <h4>假设</h4>
        <p>{{ detail.contract.assumptions.length ? detail.contract.assumptions.join('、') : '无' }}</p>
        <h4>验收条件</h4>
        <ol><li v-for="criterion in detail.contract.acceptance" :key="criterion.id">
          {{ criterion.id }} · {{ criterion.statement }}
        </li></ol>
        <p>来源引用 {{ detail.contract.sourceRefs.length }} 项；完整来源可在 Desktop 审阅。</p>
        <p class="mobile-read-note">批准只会将当前版本原子写入 TODO；不会自动启动 Agent、合并、推送或部署。后续危险操作仍各自需要授权。</p>
        <ForgeButton :disabled="busy || !connected" @click="beginConfirm">批准并进入 TODO…</ForgeButton>
      </div>
    </template>
    <ForgeButton v-if="pendingCommand" variant="secondary" size="sm"
      :disabled="busy || !connected" @click="checkReceipt">检查原命令回执</ForgeButton>
  </ForgeCard>
  <ForgeDialog v-model:open="confirming" title="确认批准当前任务草稿" :close-on-overlay="false">
    <div class="mobile-approval-dialog">
      <p>{{ detail?.contract.title }}</p>
      <p>合同版本 {{ detail?.expectedRevision }} · 范围摘要 {{ detail?.scopeHash.slice(0, 16) }}…</p>
      <p>这会进入 TODO，仍需以后明确 Start；不会自动运行。</p>
      <div class="mobile-approval-actions">
        <ForgeButton variant="secondary" @click="confirming = false">返回审阅</ForgeButton>
        <ForgeButton :disabled="busy || !connected" @click="confirm">最终确认批准</ForgeButton>
      </div>
    </div>
  </ForgeDialog>
</template>
