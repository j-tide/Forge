import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PythonHostController } from '../dist/main/python-host-controller.js';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const interpreter = join(repository, 'python', '.venv', 'bin', 'python');

test('real Python Host rejects new commands during a data switch and resumes safely',
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'forge-data-switch-')));
    const controller = new PythonHostController(interpreter, '0.0.1',
      join(root, 'Forge', 'production'), () => undefined);
    let resume;
    try {
      await controller.start();
      assert.equal(controller.status.state, 'connected');
      assert.equal((await controller.health()).ok, true);
      assert.equal((await controller.profileSwitchSafety()).safe, true);
      resume = await controller.quiesceForDataSwitch();
      assert.equal((await controller.activity()).activityCount, 0);
      assert.equal((await controller.profileSwitchSafety()).safe, true);
      const rejected = await controller.health();
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error?.code, 'RESTORE_IN_PROGRESS');
      await assert.rejects(controller.quiesceForDataSwitch(), /RESTORE_HOST_UNAVAILABLE/);
      resume();
      resume();
      assert.equal((await controller.health()).ok, true);
    } finally {
      resume?.();
      await controller.stop();
      assert.equal(controller.ownedProcessStopped, true);
      await rm(root, { recursive: true, force: true });
    }
  });

test('Plan approval bridge allows the same bounded startup window as Run start', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'forge-plan-bridge-')));
  const controller = new PythonHostController(interpreter, '0.0.1',
    join(root, 'Forge', 'production'), () => undefined);
  try {
    await controller.start();
    assert.equal(controller.status.state, 'connected');
    const invoke = controller.call.bind(controller);
    let deadline;
    controller.call = (method, params, timeout) => {
      if (method === 'run.planAct') deadline = timeout;
      return invoke(method, params, timeout);
    };
    const id = 'e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
    const result = await controller.invokeRun({ schemaVersion:'1.0', commandId:id,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5',
      type:'run.planAct', payload:{ projectId:id, taskId:id, runId:id,
        expectedArtifactHash:'a'.repeat(64), expectedTaskRevision:1,
        action:'continue', confirmed:true } });
    assert.equal(result.ok, false);
    assert.equal(deadline, 25_000);
  } finally {
    await controller.stop();
    await rm(root, { recursive:true, force:true });
  }
});
