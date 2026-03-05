import { join } from 'node:path';

/** The packaged CPython layout is platform-specific; never resolve a developer venv here. */
export function packagedPythonInterpreter(resourcesPath: string, platform: NodeJS.Platform): string {
  const runtime = join(resourcesPath, 'forge-python', 'runtime');
  return platform === 'win32' ? join(runtime, 'python.exe') :
    join(runtime, 'bin', 'python3.12');
}
