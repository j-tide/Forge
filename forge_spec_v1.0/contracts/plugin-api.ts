/** Forge public contract draft. No implementation; implement against the accompanying tests. */
export type RunId = string;
export type ArtifactId = string;
export type Enforcement = 'native-sandbox' | 'trusted-local' | 'unavailable';
export interface Capabilities {
  structuredOutput: boolean; streamEvents: boolean; cancel: boolean;
  nativeResume: boolean; interactiveApproval: boolean;
  readOnlyEnforced: boolean; networkPolicyEnforced: boolean;
  enforcement: Enforcement; modelIds: string[]; authModes: string[];
}
export interface ExecutionRequest {
  runId: RunId; attemptId: string; leaseEpoch: number;
  contractRevision: number; workspaceLeaseId: string;
  contextBundleId: string; profileRevision: number;
  outputSchemaId: string; credentialRef?: string;
  nativeSessionRef?: string;
}
export type ExecutorEvent =
 | { type: 'activity'; text: string }
 | { type: 'usage'; inputTokens?: number; outputTokens?: number; cost?: number; currency?: string }
 | { type: 'approval-request'; upstreamRequestId: string; request: unknown }
 | { type: 'artifact'; artifactId: ArtifactId }
 | { type: 'result'; result: unknown }
 | { type: 'error'; code: string; retryable: boolean; message: string };
export interface ExecutionHandle {
  events: AsyncIterable<ExecutorEvent>;
  completion: Promise<unknown>;
  cancel(reason: string): Promise<void>;
  respondToApproval?(upstreamRequestId: string, decision: unknown): Promise<void>;
}
export interface ExecutorAdapter {
  readonly id: string;
  probe(): Promise<Capabilities>;
  start(request: ExecutionRequest, signal: AbortSignal): Promise<ExecutionHandle>;
  resume?(request: ExecutionRequest, signal: AbortSignal): Promise<ExecutionHandle>;
  dispose(): Promise<void>;
}
export interface ContextItem { id: string; text: string; sourceUri: string; sourceRevision: string;
  projectId: string; trust: 'confirmed'|'candidate'|'untrusted'; contentHash: string; }
export interface ContextProvider {
  retrieve(query: { projectId: string; text: string; budgetTokens: number; }): Promise<ContextItem[]>;
}
export interface Verifier {
  verify(input: { runId: string; snapshotId: string; criterionIds: string[]; }, signal: AbortSignal): Promise<unknown>;
}
export interface Disposable { dispose(): void | Promise<void>; }
export interface PluginContext {
  registerExecutor(adapter: ExecutorAdapter): Disposable;
  registerContextProvider(id: string, provider: ContextProvider): Disposable;
  registerVerifier(id: string, verifier: Verifier): Disposable;
  log(level: 'info'|'warn'|'error', message: string, fields?: Record<string, unknown>): void;
  // All capability methods resolve server-side, never expose DB handles or unrestricted ipc.
}
export interface ForgePlugin { activate(ctx: PluginContext): Promise<Disposable>; }

/** Additional v1 extension points. Host injects immutable grants and project scope. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = Readonly<Record<string, JsonValue>>;
export interface CallScope {
  readonly projectId: string;
  readonly runId: string | null;
  readonly attemptId: string | null;
  readonly grantId: string;
}
export interface ModelRequest {
  messages: ReadonlyArray<{role:'system'|'user'|'assistant'|'tool'; content:string}>;
  modelRef:string; outputSchema?:JsonSchema; maxOutputTokens:number;
  credentialRef:string;
}
export interface ModelProvider {
  readonly id:string;
  generate(request:ModelRequest, signal:AbortSignal): Promise<{
    content:string; structured?:JsonValue; usage?:{inputTokens?:number;outputTokens?:number};
  }>;
}
export interface ToolDefinition {
  readonly id:string; readonly description:string;
  readonly inputSchema:JsonSchema; readonly outputSchema:JsonSchema;
  readonly requiredGrant:string;
  execute(input:JsonValue, scope:CallScope, signal:AbortSignal):Promise<JsonValue>;
}
export interface ViewContribution {
  readonly id:string;
  readonly slot:'task-tab'|'artifact-card'|'settings-section';
  readonly label:string;
  readonly dataSchema:JsonSchema;
  // v1 declarative form/card descriptors only; no arbitrary renderer JS.
  readonly layout:JsonValue;
}
export interface WorkspaceService {
  readText(leaseId:string, relativePath:string, maxBytes:number):Promise<string>;
  list(leaseId:string, relativeDirectory:string):Promise<ReadonlyArray<string>>;
  // Native executors need a physical path. The host checks grant/lease before resolving it.
  resolveLaunchContext(request:ExecutionRequest):Promise<{
    workspaceRoot:string; executableRef:string; approvedEnv:Readonly<Record<string,string>>;
    policyRef:string; artifactDirectory:string;
  }>;
}
export interface ArtifactService {
  put(input:{scope:CallScope;kind:string;mime:string;bytes:Uint8Array; snapshotId?:string}):Promise<{id:string;hash:string}>;
  read(id:string, scope:CallScope):Promise<Uint8Array>;
}
export interface CredentialService {
  // Does not return secret bytes to Renderer. Only a granted trusted adapter receives them.
  resolveForAdapter(credentialRef:string, grantId:string):Promise<string>;
}
export interface MemoryService {
  retrieve(scope:CallScope,query:string):Promise<ReadonlyArray<ContextItem>>;
  propose(scope:CallScope, candidate:{text:string;sourceIds:string[];applicability:string}):Promise<{candidateId:string}>;
  // No validate()/approve() here: candidate promotion is a Core/human decision.
}
export interface ServiceMap {
  'workspace.v1':WorkspaceService;
  'artifact.v1':ArtifactService;
  'credential.v1':CredentialService;
  'memory.v1':MemoryService;
}
export interface PluginContext {
  requireService<K extends keyof ServiceMap>(id:K):ServiceMap[K];
  registerModelProvider(provider:ModelProvider):Disposable;
  registerTool(tool:ToolDefinition):Disposable;
  registerViewContribution(view:ViewContribution):Disposable;
  // Generic custom executable step types and untrusted third-party UI are P9, not v1.
}
