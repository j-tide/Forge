import { remoteEventSchema, type RemoteEvent } from '@forge/contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR = /^p:(0|[1-9][0-9]{0,17})$/;
const MAX_FRAME_BYTES = 8192;
const DEFAULT_TIMINGS = { connectMs: 10_000, idleMs: 15_000 };

export interface RemoteStreamTimings {
  /** Maximum wait for the gateway to start an SSE response. */
  connectMs: number;
  /** Maximum wait between stream chunks; the Host sends a heartbeat every five seconds. */
  idleMs: number;
}

export type RemoteStreamState = 'connecting' | 'connected' | 'reconnecting' |
  'unauthorized' | 'unavailable' | 'stopped';
export interface RemoteStreamListener {
  /** Reload authoritative Host projections. A stream event is only an invalidation. */
  onInvalidation(event: RemoteEvent): Promise<void>;
  /** Fetch a fresh snapshot and return its committed event cursor. */
  onResync(): Promise<string>;
  onState(state: RemoteStreamState): void;
  onIssue?(code: string): void;
}

class ResyncRequested extends Error {}
class Unauthorized extends Error {}

/** Fixed same-origin, cookie-bound SSE over fetch so the security header is retained. */
export class RemoteStreamTransport {
  private running = false;
  private epoch = 0;
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeRetry: (() => void) | null = null;
  private cursor: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly projectId: string, cursor: string,
              private readonly listener: RemoteStreamListener,
              fetcher: typeof fetch = (...args) => fetch(...args),
              private readonly timings: RemoteStreamTimings = DEFAULT_TIMINGS,
              private readonly policyRevision?: number) {
    if (!UUID.test(projectId) || !CURSOR.test(cursor)) {
      throw new Error('REMOTE_STREAM_INPUT_INVALID');
    }
    if (policyRevision !== undefined &&
        (!Number.isSafeInteger(policyRevision) || policyRevision < 1)) {
      throw new Error('REMOTE_STREAM_POLICY_INVALID');
    }
    if (![timings.connectMs, timings.idleMs].every((ms) =>
      Number.isSafeInteger(ms) && ms > 0 && ms <= 60_000)) {
      throw new Error('REMOTE_STREAM_TIMING_INVALID');
    }
    this.cursor = cursor;
    this.fetcher = fetcher;
  }

  get lastCursor(): string { return this.cursor; }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.run(++this.epoch);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.wakeRetry?.(); this.wakeRetry = null;
    this.listener.onState('stopped');
  }

  private current(epoch: number): boolean { return this.running && this.epoch === epoch; }

  private async bounded<T>(work: Promise<T>, controller: AbortController,
                           timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', aborted);
        return true;
      };
      const aborted = (): void => { if (finish()) reject(new Error('REMOTE_STREAM_ABORTED')); };
      const timer = setTimeout(() => {
        if (finish()) reject(new Error('REMOTE_STREAM_TIMEOUT'));
        controller.abort();
      }, timeoutMs);
      controller.signal.addEventListener('abort', aborted, { once: true });
      if (controller.signal.aborted) { aborted(); return; }
      work.then((value) => { if (finish()) resolve(value); },
        (error: unknown) => { if (finish()) reject(error); });
    });
  }

  private async run(epoch: number): Promise<void> {
    let retries = 0;
    this.listener.onState('connecting');
    while (this.current(epoch)) {
      const controller = new AbortController();
      this.controller = controller;
      try {
        await this.consume(controller, epoch);
        // A clean EOF is still a disconnect. Never spin on an immediately
        // closing gateway stream and starve timers or the mobile UI.
        if (this.current(epoch)) {
          this.listener.onState('reconnecting');
          retries += 1;
        }
      } catch (error) {
        if (!this.current(epoch)) return;
        if (error instanceof Unauthorized || error instanceof Error && [
          'REMOTE_SESSION_UNAVAILABLE', 'REMOTE_AUTH_REVOKED',
        ].includes(error.message)) {
          this.running = false;
          this.listener.onState('unauthorized');
          return;
        }
        if (!(error instanceof ResyncRequested)) {
          this.listener.onIssue?.(error instanceof Error && /^REMOTE_[A-Z_]+$/.test(error.message)
            ? error.message : 'REMOTE_STREAM_INVALID_RESPONSE');
          this.listener.onState('reconnecting');
          retries += 1;
        }
      } finally { if (this.controller === controller) this.controller = null; }
      if (!this.current(epoch)) return;
      if (retries > 0) await this.delay(Math.min(5000, 500 * 2 ** Math.min(retries, 4)));
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.wakeRetry = resolve;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.wakeRetry = null;
        resolve();
      }, ms);
    });
  }

  private async consume(controller: AbortController, epoch: number): Promise<void> {
    const signal = controller.signal;
    const response = await this.bounded(this.fetcher(
      `/v1/events?projectId=${encodeURIComponent(this.projectId)}`, {
        method: 'GET', credentials: 'same-origin', mode: 'same-origin',
        cache: 'no-store', redirect: 'error',
        headers: { 'X-Forge-Session': '1', 'Last-Event-ID': this.cursor,
          ...(this.policyRevision === undefined ? {} :
            { 'X-Forge-Policy-Revision': String(this.policyRevision) }) }, signal,
      }), controller, this.timings.connectMs);
    if (!this.current(epoch) || signal.aborted) return;
    if (response.status === 401 || response.status === 403) throw new Unauthorized();
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') ||
        !response.body) throw new Error('REMOTE_STREAM_UNAVAILABLE');
    const reader = response.body.getReader();
    this.listener.onState('connected');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const encoder = new TextEncoder();
    let buffer = '';
    try {
      while (this.current(epoch) && !signal.aborted) {
        const result = await this.bounded(reader.read(), controller, this.timings.idleMs);
        if (result.done) {
          buffer += decoder.decode();
          if (buffer.trim()) throw new Error('REMOTE_STREAM_FRAME_INVALID');
          break;
        }
        buffer += decoder.decode(result.value, { stream: true });
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          if (!this.current(epoch) || signal.aborted) return;
          if (encoder.encode(buffer.slice(0, boundary.index)).byteLength > MAX_FRAME_BYTES) {
            throw new Error('REMOTE_STREAM_FRAME_TOO_LARGE');
          }
          const frame = buffer.slice(0, boundary.index).replaceAll('\r\n', '\n');
          buffer = buffer.slice(boundary.index + boundary[0].length);
          if (frame && !frame.startsWith(':')) await this.frame(frame, epoch, signal);
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
        if (encoder.encode(buffer).byteLength > MAX_FRAME_BYTES + 3) {
          throw new Error('REMOTE_STREAM_FRAME_TOO_LARGE');
        }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }

  private async frame(frame: string, epoch: number, signal: AbortSignal): Promise<void> {
    if (!this.current(epoch) || signal.aborted) return;
    const fields = new Map<string, string>();
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const separator = line.indexOf(':');
      if (separator < 1) throw new Error('REMOTE_STREAM_FRAME_INVALID');
      const key = line.slice(0, separator);
      if (!['id', 'event', 'data'].includes(key) || fields.has(key)) {
        throw new Error('REMOTE_STREAM_FRAME_INVALID');
      }
      fields.set(key, line.slice(separator + 1).trimStart());
    }
    if (!fields.size) return;
    if (fields.get('event') === 'resync_required' && !fields.has('id')) {
      const body = JSON.parse(fields.get('data') ?? 'null') as { cursor?: unknown };
      if (!CURSOR.test(String(body?.cursor))) throw new Error('REMOTE_STREAM_FRAME_INVALID');
      const next = await this.listener.onResync();
      if (!this.current(epoch) || signal.aborted) return;
      if (!CURSOR.test(next) || BigInt(next.slice(2)) < BigInt(String(body.cursor).slice(2))) {
        throw new Error('REMOTE_SNAPSHOT_STALE');
      }
      this.cursor = next;
      throw new ResyncRequested();
    }
    const data = remoteEventSchema.parse(JSON.parse(fields.get('data') ?? 'null') as unknown);
    if (fields.get('id') !== data.id || fields.get('event') !== data.type ||
        data.projectId !== this.projectId) throw new Error('REMOTE_STREAM_FRAME_INVALID');
    if (BigInt(data.id.slice(2)) <= BigInt(this.cursor.slice(2))) return;
    await this.listener.onInvalidation(data);
    if (this.current(epoch) && !signal.aborted) this.cursor = data.id;
  }
}
