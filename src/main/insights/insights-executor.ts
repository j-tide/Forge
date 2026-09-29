import { EventEmitter } from 'events';
import type {
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage,
  InsightsModelConfig,
  ImageAttachment
} from '../../shared/types';
import type { TaskCategory, TaskComplexity, TaskMetadata } from '../../shared/types/task';
import { InsightsConfig } from './config';
import { detectRateLimit, createSDKRateLimitInfo } from '../rate-limit-detector';
import { runInsightsQuery } from '../ai/runners/insights';
import type { ModelShorthand } from '../ai/config/types';
import { InsightsRequestError, insightsFailure } from './errors';

/**
 * Message processor result
 */
interface ProcessorResult {
  fullResponse: string;
  suggestedTasks?: InsightsChatMessage['suggestedTasks'];
  toolsUsed: InsightsToolUsage[];
  cancelled: boolean;
}

interface ActiveExecution {
  controller: AbortController;
  sessionId?: string;
  requestId?: string;
  finished: Promise<void>;
  finish: () => void;
}

/**
 * TypeScript executor for insights
 * Handles running the TypeScript insights runner via Vercel AI SDK
 */
export class InsightsExecutor extends EventEmitter {
  private executions: Map<string, ActiveExecution> = new Map();

  constructor(_config: InsightsConfig) {
    super();
  }

  /**
   * Check if a session is currently active
   */
  isSessionActive(projectId: string): boolean {
    return this.executions.has(projectId);
  }

  /**
   * Cancel an active session
   */
  async cancelSession(projectId: string, sessionId?: string, requestId?: string): Promise<boolean> {
    const execution = this.executions.get(projectId);
    if (!execution || (sessionId && execution.sessionId !== sessionId)
      || (requestId && execution.requestId !== requestId)) return false;

    execution.controller.abort();
    // Keep the execution reserved until the runner has actually settled.
    await execution.finished;
    return true;
  }

  /**
   * Execute insights query using TypeScript runner (Vercel AI SDK)
   */
  async execute(
    projectId: string,
    projectPath: string,
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    modelConfig?: InsightsModelConfig,
    images?: ImageAttachment[],
    sessionId?: string,
    requestId?: string
  ): Promise<ProcessorResult> {
    if (this.isSessionActive(projectId)) {
      throw new InsightsRequestError('request-busy');
    }

    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const execution: ActiveExecution = { controller, sessionId, requestId, finished, finish };
    this.executions.set(projectId, execution);
    const identity = {
      ...(sessionId ? { sessionId } : {}),
      ...(requestId ? { requestId } : {}),
    };

    // Capture the real session once for this execution. A later selection or
    // request must not relabel events from this pending response.
    const emitStatus = (status: InsightsChatStatus): void => {
      this.emit('status', projectId, { ...status, ...identity });
    };
    const emitChunk = (chunk: InsightsStreamChunk): void => {
      this.emit('stream-chunk', projectId, { ...chunk, ...identity });
    };

    // Emit thinking status
    emitStatus({
      phase: 'thinking',
      message: 'Processing your message...'
    });

    const fullResponse = '';
    const suggestedTasks: InsightsChatMessage['suggestedTasks'] = [];
    const toolsUsed: InsightsToolUsage[] = [];
    let accumulatedText = '';
    let allOutput = '';
    let streaming = false;

    // Map InsightsModelConfig to ModelShorthand/ThinkingLevel
    const modelShorthand: ModelShorthand = (modelConfig?.model as ModelShorthand) ?? 'sonnet';
    const thinkingLevel: 'low' | 'medium' | 'high' | 'xhigh' = modelConfig?.thinkingLevel ?? 'medium';

    // Map history to InsightsMessage format
    const history = conversationHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    try {
      if (controller.signal.aborted) {
        return { fullResponse: '', toolsUsed: [], cancelled: true };
      }
      const result = await runInsightsQuery(
        {
          projectDir: projectPath,
          message,
          history,
          modelShorthand,
          thinkingLevel,
          abortSignal: controller.signal,
          images,
        },
        (event) => {
          if (controller.signal.aborted) return;
          if (!streaming && event.type !== 'error') {
            streaming = true;
            emitStatus({ phase: 'streaming' });
          }
          if (controller.signal.aborted) return;
          switch (event.type) {
            case 'text-delta': {
              accumulatedText += event.text;
              allOutput = (allOutput + event.text).slice(-10000);
              emitChunk({
                type: 'text',
                content: event.text,
              } as InsightsStreamChunk);
              break;
            }
            case 'tool-start': {
              toolsUsed.push({
                name: event.name,
                input: event.input,
                timestamp: new Date(),
              });
              emitChunk({
                type: 'tool_start',
                tool: { name: event.name, input: event.input },
              } as InsightsStreamChunk);
              break;
            }
            case 'tool-end': {
              emitChunk({
                type: 'tool_end',
                tool: { name: event.name },
              } as InsightsStreamChunk);
              break;
            }
            case 'error': {
              allOutput = (allOutput + event.error).slice(-10000);
              break;
            }
          }
        },
      );

      if (controller.signal.aborted) {
        return { fullResponse: '', toolsUsed: [], cancelled: true };
      }

      // Extract task suggestion from the full result
      if (result.taskSuggestion) {
        const task: { title: string; description: string; metadata?: TaskMetadata } = {
          title: result.taskSuggestion.title,
          description: result.taskSuggestion.description,
          metadata: {
            category: result.taskSuggestion.metadata.category as TaskCategory,
            complexity: result.taskSuggestion.metadata.complexity as TaskComplexity,
          },
        };
        suggestedTasks.push(task);
        emitChunk({
          type: 'task_suggestion',
          suggestedTasks: [task],
        } as InsightsStreamChunk);
      }

      // The service emits scoped completion only after persistence succeeds.
      if (!requestId) {
        emitChunk({ type: 'done' });
        emitStatus({ phase: 'complete' });
      }

      if (controller.signal.aborted) {
        return { fullResponse: '', toolsUsed: [], cancelled: true };
      }

      return {
        fullResponse: result.text.trim() || accumulatedText.trim() || fullResponse,
        suggestedTasks: suggestedTasks.length > 0 ? suggestedTasks : undefined,
        toolsUsed,
        cancelled: false,
      };
    } catch (error) {
      // Don't emit error if aborted (user cancelled)
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return { fullResponse: '', toolsUsed: [], cancelled: true };
      }

      this.handleRateLimit(projectId, allOutput);
      const failure = insightsFailure(error);
      emitChunk({
        type: 'error',
        error: failure.message,
        code: failure.code,
      } as InsightsStreamChunk);

      this.emit('error', projectId, failure.message, sessionId, requestId, failure.code);
      throw failure;
    } finally {
      if (this.executions.get(projectId) === execution) {
        this.executions.delete(projectId);
      }
      execution.finish();
    }
  }

  /**
   * Handle rate limit detection
   */
  private handleRateLimit(projectId: string, output: string): void {
    const rateLimitDetection = detectRateLimit(output);
    if (rateLimitDetection.isRateLimited) {
      const rateLimitInfo = createSDKRateLimitInfo('other', { ...rateLimitDetection, originalError: undefined }, {
        projectId,
      });
      this.emit('sdk-rate-limit', rateLimitInfo);
    }
  }
}
