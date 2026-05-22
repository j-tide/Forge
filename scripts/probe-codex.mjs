import { HostExecutorRegistry } from '../apps/host/dist/executors.js';

const registry = new HostExecutorRegistry();
try { console.log(JSON.stringify(await registry.resolve('executor.codex').probe(), null, 2)); }
finally { await registry.dispose(); }
