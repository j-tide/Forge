import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { packagedPythonInterpreter } from '../dist/main/python-runtime-path.js';

test('packaged Python path uses the target platform layout, not a development venv', () => {
  const resources = join('Forge QA', 'resources');
  assert.equal(packagedPythonInterpreter(resources, 'darwin'),
    join(resources, 'forge-python', 'runtime', 'bin', 'python3.12'));
  assert.equal(packagedPythonInterpreter(resources, 'win32'),
    join(resources, 'forge-python', 'runtime', 'python.exe'));
});
