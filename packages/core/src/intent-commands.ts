import { controlProposalSchema, type ControlProposal } from '@forge/contracts';

/** Bounded interpretation of a persisted user message. Classification never authorizes a command. */
export function proposeControl(input: { projectId: string; conversationId: string;
  messageId: string; text: string; createdAt: string }): ControlProposal {
  const text = input.text.slice(0, 20_000);
  const restricted = /合并|推送|部署|发布|删除|跳过审批|忽略审批|\b(?:merge|push|deploy|publish|delete|skip approval|bypass approval)\b/i;
  const lowerPriority = /降.{0,8}优先级|优先级.{0,8}(?:降|低)|\b(?:lower\s+priority|deprioriti[sz]e)\b/i;
  const pause = /暂停|中断|\b(?:pause|interrupt)\b/i;
  const revise = /(?:修改|修订|编辑).{0,8}草稿|草稿.{0,8}(?:修改|修订|编辑)|\b(?:revise|edit)\s+(?:the\s+)?draft\b/i;
  let kind: ControlProposal['kind'] = 'unrecognized';
  let state: ControlProposal['state'] = 'unsupported';
  let targetKind: ControlProposal['targetKind'] = null;
  let summary = '未识别为受支持的控制指令；原始消息仍保留。';
  if (restricted.test(text)) {
    kind = 'restricted'; state = 'requires_confirmation';
    summary = '请求涉及合并、推送、部署、删除或跳过审批；聊天不能授权或执行。';
  } else if (lowerPriority.test(text)) {
    kind = 'lower_priority'; state = 'needs_target'; targetKind = 'task';
    summary = '建议降低指定任务优先级；需选择 Task、创建新修订并按规则批准。';
  } else if (pause.test(text)) {
    kind = 'pause_run'; state = 'unavailable'; targetKind = 'run';
    summary = '建议暂停指定 Run；当前尚无 Run 控制能力，不能从聊天直接停止进程。';
  } else if (revise.test(text)) {
    kind = 'revise_draft'; state = 'needs_target'; targetKind = 'draft';
    summary = '建议打开现有草稿编辑；保存新 revision 需要明确的用户决定。';
  }
  return controlProposalSchema.parse({ proposalId: input.messageId,
    projectId: input.projectId, conversationId: input.conversationId,
    sourceMessageId: input.messageId, kind, state, targetKind, summary,
    requiresHumanConfirmation: kind !== 'unrecognized', executionAllowed: false,
    createdAt: input.createdAt });
}
