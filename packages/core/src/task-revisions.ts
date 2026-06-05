import { taskContractSchema, type DraftReviseInput, type TaskContract, type TaskDraft } from '@forge/contracts';

export class DraftRevisionError extends Error {
  constructor(readonly code: 'DRAFT_INVALID_REVISION' | 'DRAFT_UNRESOLVED_QUESTIONS' |
    'DRAFT_ACCEPTANCE_CONFIRMATION_REQUIRED' | 'DRAFT_SCOPE_CONFIRMATION_REQUIRED') {
    super(code);
  }
}

const fields = ['title', 'type', 'goal', 'acceptance', 'constraints', 'scope', 'outOfScope',
  'dependencies', 'openQuestions', 'assumptions', 'sourceRefs', 'workflowRef', 'priority'] as const;

export function draftChangedFields(before: TaskContract | null, after: TaskContract): string[] {
  return fields.filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after[field]));
}

export function approvalReadiness(draft: TaskDraft): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!draft.contract) reasons.push('结构化任务尚未完成');
  if (draft.contract?.openQuestions.length) reasons.push('仍有未回答的阻塞问题');
  if (draft.status === 'generating' || draft.status === 'invalid_output') reasons.push('草稿尚未有效生成');
  return { ready: reasons.length === 0, reasons };
}

/** Validates a human decision before a new immutable draft revision is stored. */
export function prepareDraftRevision(before: TaskDraft, input: DraftReviseInput):
  { contract: TaskContract; changedFields: string[] } {
  const candidate = taskContractSchema.parse(input.contract);
  if (before.projectId !== input.projectId || before.draftId !== input.draftId ||
    before.revision !== input.expectedRevision ||
    candidate.taskId !== before.draftId || candidate.projectId !== before.projectId ||
    candidate.revision !== before.revision + 1 || candidate.schemaVersion !== '1.0' ||
    before.status === 'generating') throw new DraftRevisionError('DRAFT_INVALID_REVISION');

  const previous = before.contract;
  const oldQuestions = previous?.openQuestions ?? [];
  const removedQuestions = oldQuestions.filter((question) => !candidate.openQuestions.includes(question));
  const answers = new Map(input.resolvedQuestions.map(({ question, answer }) => [question, answer]));
  if (answers.size !== input.resolvedQuestions.length ||
    removedQuestions.some((question) => !answers.has(question)) ||
    input.resolvedQuestions.some(({ question }) => !removedQuestions.includes(question))) {
    throw new DraftRevisionError('DRAFT_UNRESOLVED_QUESTIONS');
  }

  const oldAcceptance = previous?.acceptance ?? [];
  const oldIds = new Set(oldAcceptance.map((item) => item.id));
  const ids = candidate.acceptance.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  const removedIds = oldAcceptance.filter((item) => !ids.includes(item.id)).map((item) => item.id);
  if (JSON.stringify([...removedIds].sort()) !== JSON.stringify([...input.removedAcceptanceIds].sort())) {
    throw new DraftRevisionError('DRAFT_ACCEPTANCE_CONFIRMATION_REQUIRED');
  }
  const decisionRef = `decision:${input.decisionId}`;
  if (!candidate.sourceRefs.includes(decisionRef)) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  const allowedRefs = new Set([`message:${before.sourceMessageId}`, decisionRef,
    ...(previous?.sourceRefs ?? [])]);
  if (candidate.sourceRefs.some((ref) => !allowedRefs.has(ref))) {
    throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  }
  for (const item of candidate.acceptance) {
    const old = oldAcceptance.find((entry) => entry.id === item.id);
    if (old && item.id !== old.id) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
    const changed = !old || item.statement !== old.statement || item.method !== old.method ||
      item.required !== old.required;
    if (changed && !item.sourceRefs.includes(decisionRef)) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
    if (old && old.sourceRefs.some((ref) => !item.sourceRefs.includes(ref))) {
      throw new DraftRevisionError('DRAFT_INVALID_REVISION');
    }
    if (item.sourceRefs.some((ref) => !allowedRefs.has(ref))) {
      throw new DraftRevisionError('DRAFT_INVALID_REVISION');
    }
    if (!old && oldIds.has(item.id)) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  }
  if (previous && (JSON.stringify(previous.scope) !== JSON.stringify(candidate.scope) ||
    JSON.stringify(previous.outOfScope) !== JSON.stringify(candidate.outOfScope)) &&
    !input.confirmScopeChange) throw new DraftRevisionError('DRAFT_SCOPE_CONFIRMATION_REQUIRED');
  if (previous?.sourceRefs.some((ref) => !candidate.sourceRefs.includes(ref))) {
    throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  }
  const changedFields = draftChangedFields(previous, candidate);
  if (!changedFields.length) throw new DraftRevisionError('DRAFT_INVALID_REVISION');
  return { contract: candidate, changedFields };
}
