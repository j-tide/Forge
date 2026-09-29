/**
 * Insights Runner
 * ===============
 *
 * AI chat for codebase insights using Vercel AI SDK.
 * See apps/desktop/src/main/ai/runners/insights.ts for the TypeScript implementation.
 *
 * Provides an AI-powered chat interface for asking questions about a codebase.
 * Can also suggest tasks based on the conversation.
 *
 * Uses `createSimpleClient()` with read-only tools (Read, Glob, Grep) and streaming.
 */

import { streamText, stepCountIs } from 'ai';
import type { ImagePart, ModelMessage, Tool as AITool } from 'ai';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createSimpleClient } from '../client/factory';
import type { SimpleClientResult } from '../client/types';
import { buildToolRegistry } from '../tools/build-registry';
import type { ToolContext } from '../tools/types';
import type { ModelShorthand, ThinkingLevel } from '../config/types';
import { buildThinkingProviderOptions, MODEL_PROVIDER_MAP } from '../config/types';
import {
  ALL_AVAILABLE_MODELS, getReasoningConfigForModel, MODEL_ID_MAP, resolveModelEquivalent,
} from '../../../shared/constants/models';
import type { BuiltinProvider } from '../../../shared/types/provider-account';
import type { ImageAttachment } from '../../../shared/types/task';
import type { SecurityProfile } from '../security/bash-validator';
import { safeParseJson } from '../../utils/json-repair';
import { parseLLMJson } from '../schema/structured-output';
import { TaskSuggestionSchema } from '../schema/insight-extractor';

// =============================================================================
// Types
// =============================================================================

/** A message in the insights conversation history */
export interface InsightsMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Configuration for running an insights query */
export interface InsightsConfig {
  /** Project directory path */
  projectDir: string;
  /** User message to process */
  message: string;
  /** Previous conversation history */
  history?: InsightsMessage[];
  /** Model shorthand or full provider model ID (defaults to 'sonnet') */
  modelShorthand?: ModelShorthand | string;
  /** Thinking level (defaults to 'medium') */
  thinkingLevel?: ThinkingLevel;
  /** Current user message's image attachments, including their original data. */
  images?: ImageAttachment[];
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result of an insights query */
export interface InsightsResult {
  /** Full response text */
  text: string;
  /** Task suggestion if detected, or null */
  taskSuggestion: TaskSuggestion | null;
  /** Tool calls made during the session */
  toolCalls: ToolCallInfo[];
}

/** A task suggestion extracted from the response */
export interface TaskSuggestion {
  title: string;
  description: string;
  metadata: {
    category: string;
    complexity: string;
    impact: string;
  };
}

/** Info about a tool call made during the session */
export interface ToolCallInfo {
  name: string;
  input: string;
}

/** Callback for streaming events from the insights runner */
export type InsightsStreamCallback = (event: InsightsStreamEvent) => void;

/** Events emitted during insights streaming */
export type InsightsStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-start'; name: string; input: string }
  | { type: 'tool-end'; name: string }
  | { type: 'error'; error: string };

// =============================================================================
// Project Context Loading
// =============================================================================

/**
 * Load project context for the AI.
 * Mirrors Python's `load_project_context()`.
 */
function loadProjectContext(projectDir: string): string {
  const contextParts: string[] = [];

  // Load project index if available
  const indexPath = join(projectDir, '.forge-glass-preview', 'project_index.json');
  if (existsSync(indexPath)) {
    const index = safeParseJson<Record<string, unknown>>(readFileSync(indexPath, 'utf-8'));
    if (index) {
      const summary = {
        project_root: index.project_root ?? '',
        project_type: index.project_type ?? 'unknown',
        services: Object.keys((index.services as Record<string, unknown>) ?? {}),
        infrastructure: index.infrastructure ?? {},
      };
      contextParts.push(
        `## Project Structure\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
      );
    }
  }

  // Load roadmap if available
  const roadmapPath = join(projectDir, '.forge-glass-preview', 'roadmap', 'roadmap.json');
  if (existsSync(roadmapPath)) {
    const roadmap = safeParseJson<Record<string, unknown>>(readFileSync(roadmapPath, 'utf-8'));
    if (roadmap) {
      const features = ((roadmap.features as Record<string, unknown>[]) ?? []).slice(0, 10);
      const featureSummary = features.map((f: Record<string, unknown>) => ({
        title: f.title ?? '',
        status: f.status ?? '',
      }));
      contextParts.push(
        `## Roadmap Features\n\`\`\`json\n${JSON.stringify(featureSummary, null, 2)}\n\`\`\``,
      );
    }
  }

  // Load existing tasks
  const tasksPath = join(projectDir, '.forge-glass-preview', 'specs');
  if (existsSync(tasksPath)) {
    try {
      const taskDirs = readdirSync(tasksPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .slice(0, 10);
      if (taskDirs.length > 0) {
        contextParts.push(`## Existing Tasks/Specs\n- ${taskDirs.join('\n- ')}`);
      }
    } catch {
      // Ignore read errors
    }
  }

  return contextParts.length > 0
    ? contextParts.join('\n\n')
    : 'No project context available yet.';
}

/**
 * Build the system prompt for the insights agent.
 * Mirrors Python's `build_system_prompt()`.
 */
function buildSystemPrompt(projectDir: string): string {
  const context = loadProjectContext(projectDir);

  return `You are an AI assistant helping developers understand and work with their codebase.
You have access to the following project context:

${context}

Your capabilities:
1. Answer questions about the codebase structure, patterns, and architecture
2. Suggest improvements, features, or bug fixes based on the code
3. Help plan implementation of new features
4. Provide code examples and explanations

When the user asks you to create a task, wants to turn the conversation into a task, or when you believe creating a task would be helpful, output a task suggestion in this exact format on a SINGLE LINE:
__TASK_SUGGESTION__:{"title": "Task title here", "description": "Detailed description of what the task involves", "metadata": {"category": "feature", "complexity": "medium", "impact": "medium"}}

Valid categories: feature, bug_fix, refactoring, documentation, security, performance, ui_ux, infrastructure, testing
Valid complexity: trivial, small, medium, large, complex
Valid impact: low, medium, high, critical

Be conversational and helpful. Focus on providing actionable insights and clear explanations.
Keep responses concise but informative.`;
}

// =============================================================================
// Task Suggestion Extraction
// =============================================================================

const TASK_SUGGESTION_PREFIX = '__TASK_SUGGESTION__:';

/**
 * Extract a task suggestion from the response text if present.
 */
function extractTaskSuggestion(text: string): TaskSuggestion | null {
  const idx = text.indexOf(TASK_SUGGESTION_PREFIX);
  if (idx === -1) return null;

  // Find the JSON on the same line
  const afterPrefix = text.substring(idx + TASK_SUGGESTION_PREFIX.length);
  const lineEnd = afterPrefix.indexOf('\n');
  const jsonStr = lineEnd === -1 ? afterPrefix.trim() : afterPrefix.substring(0, lineEnd).trim();

  const validated = parseLLMJson(jsonStr, TaskSuggestionSchema);
  if (validated && validated.title && validated.description) {
    return validated as TaskSuggestion;
  }

  return null;
}

// =============================================================================
// Insights Runner
// =============================================================================

/**
 * Run an insights chat query with streaming.
 *
 * @param config - Insights query configuration
 * @param onStream - Optional callback for streaming events
 * @returns Insights result with text, task suggestion, and tool call info
 */
export async function runInsightsQuery(
  config: InsightsConfig,
  onStream?: InsightsStreamCallback,
): Promise<InsightsResult> {
  const {
    projectDir,
    message,
    history = [],
    modelShorthand = 'sonnet',
    thinkingLevel = 'medium',
    images,
    abortSignal,
  } = config;

  throwIfInsightsAborted(abortSignal);

  const systemPrompt = buildSystemPrompt(projectDir);

  // Build conversation context from history
  let fullPrompt = message;
  if (history.length > 0) {
    const conversationContext = history
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    fullPrompt = `Previous conversation:\n${conversationContext}\n\nCurrent question: ${message}`;
  }

  // Create tool context for read-only tools
  const toolContext: ToolContext = {
    cwd: projectDir,
    projectDir,
    specDir: join(projectDir, '.forge-glass-preview', 'specs'),
    securityProfile: null as unknown as SecurityProfile,
    abortSignal,
  };

  // Bind tools via registry (insights agent gets Read, Glob, Grep)
  const registry = buildToolRegistry();
  const tools = registry.getToolsForAgent('insights', toolContext);

  // Create simple client with tools
  const client = await createSimpleClient({
    systemPrompt,
    modelShorthand,
    thinkingLevel,
    requireAuth: true,
    maxSteps: 30, // Allow sufficient turns for codebase exploration
    tools,
  });

  const toolCalls: ToolCallInfo[] = [];
  let responseText = '';

  // Detect Codex models — they require instructions via providerOptions, not system
  const insightsModelId = client.resolvedModelId ??
    (typeof client.model === 'string' ? client.model : client.model.modelId);
  const isCodexInsights = insightsModelId?.includes('codex') || client.queueAuth?.source === 'codex-oauth';
  const thinkingOptions = buildInsightsThinkingOptions(client, insightsModelId, thinkingLevel);
  const imageParts = buildInsightsImageParts(client, insightsModelId, images);
  const messages: ModelMessage[] | undefined = imageParts.length > 0
    ? [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, ...imageParts] }]
    : undefined;
  const toolExecutions = new Set<Promise<unknown>>();
  let acceptingToolExecutions = true;
  // The SDK can close fullStream on abort before its running tools settle.
  // Insights' Read/Glob/Grep tools return promises; retain them until they finish.
  const executionTools: Record<string, AITool> = Object.fromEntries(
    Object.entries(client.tools).map(([name, tool]) => {
      const execute = tool.execute;
      if (!execute) return [name, tool];
      return [name, {
        ...tool,
        execute: async (...args: Parameters<typeof execute>) => {
          if (!acceptingToolExecutions) throw insightsAbortError();
          throwIfInsightsAborted(abortSignal);
          const execution = Promise.resolve().then(() => {
            if (!acceptingToolExecutions) throw insightsAbortError();
            throwIfInsightsAborted(abortSignal);
            return execute(...args);
          });
          toolExecutions.add(execution);
          try {
            return await execution;
          } finally {
            toolExecutions.delete(execution);
          }
        },
      }];
    }),
  );

  try {
    throwIfInsightsAborted(abortSignal);
    const result = streamText({
      model: client.model,
      system: isCodexInsights ? undefined : client.systemPrompt,
      ...(messages ? { messages } : { prompt: fullPrompt }),
      tools: executionTools,
      stopWhen: stepCountIs(client.maxSteps),
      abortSignal,
      // SDK defaults to console.error(error), including raw provider response
      // bodies. Error stream parts below propagate to the sanitized service path.
      onError: () => undefined,
      ...((thinkingOptions || isCodexInsights) ? {
        providerOptions: {
          ...(thinkingOptions ?? {}),
          ...(isCodexInsights ? {
            openai: {
              ...(thinkingOptions?.openai ?? {}),
              instructions: client.systemPrompt,
              store: false,
            },
          } : {}),
        },
      } : {}),
    });

    for await (const part of result.fullStream) {
      throwIfInsightsAborted(abortSignal);
      switch (part.type) {
        case 'text-delta': {
          responseText += part.text;
          onStream?.({ type: 'text-delta', text: part.text });
          break;
        }
        case 'tool-call': {
          const args = 'input' in part ? (part.input as Record<string, unknown>) : {};
          const input = extractToolInput(args);
          toolCalls.push({ name: part.toolName, input });
          onStream?.({ type: 'tool-start', name: part.toolName, input });
          break;
        }
        case 'tool-result': {
          onStream?.({ type: 'tool-end', name: part.toolName });
          break;
        }
        case 'error': {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
        case 'abort': {
          throw insightsAbortError();
        }
      }
    }
    throwIfInsightsAborted(abortSignal);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onStream?.({ type: 'error', error: errorMsg });
    throw error;
  } finally {
    acceptingToolExecutions = false;
    await Promise.allSettled(toolExecutions);
  }

  throwIfInsightsAborted(abortSignal);

  const taskSuggestion = extractTaskSuggestion(responseText);

  return {
    text: responseText,
    taskSuggestion,
    toolCalls,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** Use the resolved provider's capabilities, with the level selected for this query. */
function buildInsightsThinkingOptions(
  client: SimpleClientResult,
  modelId: string,
  thinkingLevel: ThinkingLevel,
): Record<string, Record<string, unknown>> | undefined {
  const adapter = typeof client.model === 'string' ? '' : client.model.provider;
  const modelProvider = adapter?.split('.')[0] ||
    Object.entries(MODEL_PROVIDER_MAP).find(([prefix]) => modelId.startsWith(prefix))?.[1];
  const provider = client.queueAuth?.resolvedProvider ?? modelProvider;
  if (!provider) return undefined;

  const catalogProvider = (provider === 'bedrock' ? 'amazon-bedrock' : provider) as BuiltinProvider;
  const reasoning = client.queueAuth?.reasoningConfig ??
    resolveModelEquivalent(modelId, catalogProvider)?.reasoning ??
    getReasoningConfigForModel(modelId, catalogProvider);
  if (reasoning.type === 'none') return undefined;

  const sharedOptions = buildThinkingProviderOptions(modelId, thinkingLevel);
  switch (provider) {
    case 'anthropic':
      if (reasoning.type === 'adaptive_effort') {
        return {
          anthropic: {
            thinking: { type: 'adaptive' },
            effort: thinkingLevel === 'xhigh' ? 'max' : thinkingLevel,
          },
        };
      }
      return sharedOptions?.anthropic ? sharedOptions : undefined;
    case 'google':
      if (reasoning.type === 'thinking_toggle' && thinkingLevel === 'low') {
        return { google: { thinkingConfig: { thinkingBudget: 0 } } };
      }
      return sharedOptions?.google ? sharedOptions : undefined;
    case 'openai':
      return {
        openai: {
          reasoningEffort: /^o[134](?:-|$)/.test(modelId) && thinkingLevel === 'xhigh'
            ? 'high' : thinkingLevel,
        },
      };
    case 'xai':
      return { xai: { reasoningEffort: thinkingLevel === 'low' ? 'low' : 'high' } };
    case 'zai':
      // The Anthropic adapter injects a Claude token budget. Current ZAI models do
      // not advertise thinking, so never invent Claude budgets for that endpoint.
      if (adapter?.includes('.anthropic')) return undefined;
      // Custom fields must use the SDK provider name; canonical openaiCompatible
      // options only preserve fields declared by the SDK schema.
      return { zai: { thinking: {
        type: reasoning.type === 'thinking_toggle' && thinkingLevel === 'low' ? 'disabled' : 'enabled',
        clear_thinking: false,
      } } };
    default:
      return undefined;
  }
}

function buildInsightsImageParts(
  client: SimpleClientResult,
  modelId: string,
  images: ImageAttachment[] | undefined,
): ImagePart[] {
  if (!images?.length) return [];
  const provider = client.queueAuth?.resolvedProvider ??
    (typeof client.model === 'string' ? '' : client.model.provider?.split('.')[0]);
  const catalogModel = ALL_AVAILABLE_MODELS.find(model => model.provider === provider &&
    (model.value === modelId || MODEL_ID_MAP[model.value] === modelId));
  if (catalogModel?.capabilities?.vision === false) {
    throw Object.assign(new Error('The selected model does not support image attachments.'), {
      code: 'INSIGHTS_IMAGES_UNSUPPORTED',
    });
  }

  return images.map(image => {
    if (!image.data?.trim() || !image.mimeType.startsWith('image/')) {
      throw Object.assign(new Error('Reattach the original image before sending this message.'), {
        code: 'INSIGHTS_IMAGE_DATA_UNAVAILABLE',
      });
    }
    return { type: 'image', image: image.data, mediaType: image.mimeType };
  });
}

function insightsAbortError(): Error {
  return Object.assign(new Error('Insights request was cancelled.'), { name: 'AbortError' });
}

function throwIfInsightsAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw insightsAbortError();
}

/**
 * Extract a brief description from tool call args for UI display.
 */
function extractToolInput(args: Record<string, unknown>): string {
  if (args.pattern) return `pattern: ${args.pattern}`;
  if (args.file_path) {
    const fp = String(args.file_path);
    return fp.length > 50 ? `...${fp.slice(-47)}` : fp;
  }
  if (args.path) return String(args.path);
  return '';
}
