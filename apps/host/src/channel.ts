export interface ParentChannel {
  readonly kind: 'utility' | 'node';
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

interface UtilityParentPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

export function getParentChannel(): ParentChannel | null {
  const utilityPort = (process as NodeJS.Process & { parentPort?: UtilityParentPort | null }).parentPort;
  if (utilityPort) {
    return {
      kind: 'utility',
      send(message) { utilityPort.postMessage(message); },
      onMessage(listener) { utilityPort.on('message', (event) => listener(event.data)); },
    };
  }
  if (typeof process.send === 'function') {
    return {
      kind: 'node',
      send(message) { process.send?.(message); },
      onMessage(listener) { process.on('message', listener); },
    };
  }
  return null;
}
