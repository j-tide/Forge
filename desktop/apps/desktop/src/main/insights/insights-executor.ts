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

/**
 * Message processor result
 */
interface ProcessorResult {
  fullResponse: string;
  suggestedTasks?: InsightsChatMessage['suggestedTasks'];
  toolsUsed: InsightsToolUsage[];
}

/**
 * TypeScript executor for insights
 * Handles running the TypeScript insights runner via Vercel AI SDK
 */
export class InsightsExecutor extends EventEmitter {
  private config: InsightsConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: InsightsConfig) {
    super();
    this.config = config;
  }

  /**
   * Check if a session is currently active
   */
  isSessionActive(projectId: string): boolean {
    return this.abortControllers.has(projectId);
  }

  /**
   * Cancel an active session
   */
  cancelSession(projectId: string): boolean {
    const controller = this.abortControllers.get(projectId);
    if (!controller) return false;

    controller.abort();
    this.abortControllers.delete(projectId);
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
    sessionId?: string
  ): Promise<ProcessorResult> {
    // Cancel any existing session
    this.cancelSession(projectId);

    // Capture the real session once for this execution. A later selection or
    // request must not relabel events from this pending response.
    const emitStatus = (status: InsightsChatStatus): void => {
      this.emit('status', projectId, { ...status, ...(sessionId ? { sessionId } : {}) });
    };
    const emitChunk = (chunk: InsightsStreamChunk): void => {
      this.emit('stream-chunk', projectId, { ...chunk, ...(sessionId ? { sessionId } : {}) });
    };

    // Emit thinking status
    emitStatus({
      phase: 'thinking',
      message: 'Processing your message...'
    });

    const controller = new AbortController();
    this.abortControllers.set(projectId, controller);
    const releaseController = (): void => {
      if (this.abortControllers.get(projectId) === controller) {
        this.abortControllers.delete(projectId);
      }
    };

    const fullResponse = '';
    const suggestedTasks: InsightsChatMessage['suggestedTasks'] = [];
    const toolsUsed: InsightsToolUsage[] = [];
    let accumulatedText = '';
    let allOutput = '';

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
      const result = await runInsightsQuery(
        {
          projectDir: projectPath,
          message,
          history,
          modelShorthand,
          thinkingLevel,
          abortSignal: controller.signal,
        },
        (event) => {
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
              emitChunk({
                type: 'error',
                error: event.error,
              } as InsightsStreamChunk);
              break;
            }
          }
        },
      );

      releaseController();

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

      emitChunk({
        type: 'done',
      } as InsightsStreamChunk);

      emitStatus({
        phase: 'complete',
      } as InsightsChatStatus);

      return {
        fullResponse: result.text.trim() || accumulatedText.trim() || fullResponse,
        suggestedTasks: suggestedTasks.length > 0 ? suggestedTasks : undefined,
        toolsUsed,
      };
    } catch (error) {
      releaseController();

      // Check for rate limit in accumulated output
      this.handleRateLimit(projectId, allOutput);

      const errorMsg = error instanceof Error ? error.message : String(error);

      // Don't emit error if aborted (user cancelled)
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          fullResponse: accumulatedText.trim(),
          suggestedTasks: suggestedTasks.length > 0 ? suggestedTasks : undefined,
          toolsUsed,
        };
      }

      emitChunk({
        type: 'error',
        error: errorMsg,
      } as InsightsStreamChunk);

      this.emit('error', projectId, errorMsg, sessionId);
      throw error;
    }
  }

  /**
   * Handle rate limit detection
   */
  private handleRateLimit(projectId: string, output: string): void {
    const rateLimitDetection = detectRateLimit(output);
    if (rateLimitDetection.isRateLimited) {
      const rateLimitInfo = createSDKRateLimitInfo('other', rateLimitDetection, {
        projectId,
      });
      this.emit('sdk-rate-limit', rateLimitInfo);
    }
  }
}
