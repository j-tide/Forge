import { type DraftGenerationRequest, type DraftRevision, type DraftReviseInput,
  type TaskDraft } from '@forge/contracts';
import { prepareDraftRevision } from '@forge/core/task-revisions';
import { DraftStorageError, ForgePersistence } from '@forge/persistence';
import { Refiner } from '@forge/refiner';
import type { RefinerModel } from '@forge/refiner';

export class DraftService {
  private readonly active = new Map<string, { abort: AbortController; done: Promise<void> }>();
  constructor(private readonly storage: ForgePersistence,
    private readonly model: RefinerModel & { dispose(): Promise<void> }) {}

  list(projectId: string, conversationId: string): TaskDraft[] {
    return this.storage.listTaskDrafts(projectId, conversationId);
  }
  get(projectId: string, draftId: string): TaskDraft | null {
    return this.storage.getTaskDraft(projectId, draftId);
  }
  manual(input: DraftGenerationRequest): TaskDraft {
    return this.storage.beginTaskDraft(input, 'manual', null);
  }
  updateText(projectId: string, draftId: string, expectedRevision: number, editableText: string): TaskDraft {
    if (this.storage.taskApprovalForDraft(projectId, draftId)?.status === 'approved') {
      throw new DraftStorageError('DRAFT_APPROVED');
    }
    return this.storage.updateTaskDraftText(projectId, draftId, expectedRevision, editableText);
  }
  history(projectId: string, draftId: string): DraftRevision[] {
    return this.storage.listTaskDraftRevisions(projectId, draftId);
  }
  revise(input: DraftReviseInput): TaskDraft {
    if (this.storage.taskApprovalForDraft(input.projectId, input.draftId)?.status === 'approved') {
      throw new DraftStorageError('DRAFT_APPROVED');
    }
    const before = this.storage.getTaskDraft(input.projectId, input.draftId);
    if (!before) throw new DraftStorageError('DRAFT_NOT_FOUND');
    if (before.revision !== input.expectedRevision) throw new DraftStorageError('REVISION_CONFLICT');
    const prepared = prepareDraftRevision(before, input);
    return this.storage.reviseTaskDraft({ ...input, contract: prepared.contract }, prepared.changedFields);
  }
  generate(input: DraftGenerationRequest): TaskDraft {
    const draft = this.storage.beginTaskDraft(input, 'generating', this.model.providerId);
    if (draft.status !== 'generating' || this.active.has(draft.draftId)) return draft;
    const abort = new AbortController();
    const done = this.run(draft, abort.signal).finally(() => this.active.delete(draft.draftId));
    void done.catch(() => {});
    this.active.set(draft.draftId, { abort, done });
    return draft;
  }

  private async run(draft: TaskDraft, signal: AbortSignal): Promise<void> {
    try {
      const project = this.storage.getProject(draft.projectId);
      const message = this.storage.listConversationMessages(draft.projectId, draft.conversationId)
        .find((item) => item.messageId === draft.sourceMessageId && item.role === 'user');
      if (!project || !message) throw new Error('Source unavailable');
      const summary = JSON.stringify({ name: project.name, projectType: project.probe.projectType,
        packageManager: project.probe.packageManager, branch: project.probe.currentBranch,
        workingTree: project.probe.workingTree, declaredScripts: Object.keys(project.probe.scripts) });
      const result = await new Refiner(this.model).refine({ projectId: project.projectId,
        taskId: draft.draftId, sourceMessageId: draft.sourceMessageId, text: message.content,
        projectSummary: summary, signal });
      this.storage.finishTaskDraft(draft.projectId, draft.draftId, result);
    } catch {
      this.storage.finishTaskDraft(draft.projectId, draft.draftId,
        { intent: 'new_task', contract: null, errorCode: 'REFINER_FAILED' });
    }
  }

  async dispose(): Promise<void> {
    for (const item of this.active.values()) item.abort.abort();
    await Promise.allSettled([...this.active.values()].map((item) => item.done));
    await this.model.dispose();
  }
}
