import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectTrustVersion } from '@forge/contracts';
import { ForgePersistence, migrations } from '../packages/persistence/dist/index.js';
import { ProjectService } from '../apps/host/dist/projects.js';
import { contractDigest } from '../packages/core/dist/approvals.js';

const requirePersistence = createRequire(new URL('../packages/persistence/package.json', import.meta.url));
const Database = requirePersistence('better-sqlite3');
const root = await mkdtemp(join(tmpdir(), 'forge-python-db-parity-'));
const python = fileURLToPath(new URL('../python/.venv/bin/python', import.meta.url));

try {
  const frozen = JSON.parse(await readFile(new URL('../python/src/forge/legacy_migrations.json', import.meta.url), 'utf8'));
  assert.deepEqual(frozen.migrations, migrations, 'Python legacy SQL/checksums drifted from Node baseline');
  const source = join(root, 'source project 中文');
  const data = join(root, 'data');
  await mkdir(source);
  const nodeStore = new ForgePersistence(data);
  await nodeStore.open();
  assert.equal(nodeStore.migrate(), 15);
  const projects = new ProjectService(nodeStore);
  const probe = await projects.probe(source);
  const probeCheck = spawnSync(python, ['-c',
    'import json,sys; from forge.projects import probe_project; '
      + 'print(json.dumps(probe_project(sys.argv[1]).model_dump(mode="json")))', source],
  { encoding: 'utf8', timeout: 10_000 });
  assert.equal(probeCheck.status, 0, probeCheck.stderr);
  const pythonProbe = JSON.parse(probeCheck.stdout);
  assert.equal(pythonProbe.fingerprint, probe.fingerprint);
  assert.equal(pythonProbe.scriptsHash, probe.scriptsHash);
  const project = await projects.create(source, probe.fingerprint, projectTrustVersion, true, 0);
  const taskId = randomUUID();
  const runId = randomUUID();
  const draftId = randomUUID();
  const conversation = nodeStore.createConversation(project.projectId, 'Parity fixture', 0);
  const now = new Date().toISOString();
  const native = new Database(join(data, 'forge.sqlite'));
  native.pragma('foreign_keys = ON');
  native.prepare(`INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,created_at,updated_at)
    VALUES (?, ?, 1, 'user', ?, 'completed', ?, ?)`).run(randomUUID(), conversation.conversationId,
    JSON.stringify({ text: 'parity source' }), now, now);
  const messageId = native.prepare('SELECT message_id FROM messages WHERE conversation_id=?')
    .get(conversation.conversationId).message_id;
  native.prepare(`INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,
    idempotency_key,revision,intent,status,editable_text,created_at,updated_at)
    VALUES(?,?,?,?,?,1,'new_task','manual','Parity task',?,?)`).run(draftId, project.projectId,
    conversation.conversationId, messageId, randomUUID(), now, now);
  const contract = { schemaVersion: '1.0', taskId, projectId: project.projectId, revision: 1,
    title: 'Parity task', type: 'feature', goal: 'Verify Python and Node SQLite agreement',
    acceptance: [{ id: 'ac1', statement: 'Same values persist', method: 'manual', required: true,
      sourceRefs: [`message:${messageId}`] }], constraints: [], scope: [], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [`message:${messageId}`],
    workflowRef: 'standard', priority: 'normal' };
  native.prepare(`INSERT INTO tasks(task_id,project_id,source_draft_id,current_revision,state,contract_json,
    approved_at,created_at,position,revision,updated_at) VALUES(?,?,?,1,'todo',?,?,?,0,1,?)`)
    .run(taskId, project.projectId, draftId, JSON.stringify(contract), now, now, now);
  native.prepare(`INSERT INTO task_revisions(task_id,revision,contract_json,content_hash,created_at)
    VALUES(?,1,?,?,?)`).run(taskId, JSON.stringify(contract), contractDigest(contract), now);
  native.prepare(`INSERT INTO run_config_snapshots(run_id,project_id,task_id,request_hash,snapshot_hash,
    snapshot_json,created_at) VALUES(?,?,?,?,?,?,?)`).run(runId, project.projectId, taskId,
    'a'.repeat(64), 'b'.repeat(64), JSON.stringify({ fixture: 'parity' }), now);
  native.prepare(`INSERT INTO runs(run_id,project_id,task_id,config_hash,state,revision,created_at,
    deadline_at,finished_at) VALUES(?,?,?,?,'succeeded',1,?,?,?)`)
    .run(runId, project.projectId, taskId, 'b'.repeat(64), now, now, now);
  native.close();
  nodeStore.close();

  const pyCode = `import json,sys
from pathlib import Path
from forge.persistence import ForgePersistence
db=ForgePersistence(Path(sys.argv[1])); db.open()
assert db.schema_version()==15 and db.health()['status']=='ready'
p=db.row('projects',sys.argv[2]); t=db.row('tasks',sys.argv[3]); r=db.row('runs',sys.argv[4])
assert p and t and r
assert p['project_id']==t['project_id']==r['project_id']
assert t['task_id']==r['task_id'] and json.loads(t['contract_json'])['taskId']==t['task_id']
with db.transaction() as tx:
  assert tx.execute('UPDATE projects SET name=?,revision=revision+1 WHERE project_id=? AND revision=1',
    ('Python-updated project',sys.argv[2])).rowcount==1
  assert tx.execute('UPDATE tasks SET position=1,revision=revision+1 WHERE task_id=? AND revision=1',
    (sys.argv[3],)).rowcount==1
  assert tx.execute('UPDATE runs SET revision=revision+1 WHERE run_id=? AND revision=1',
    (sys.argv[4],)).rowcount==1
db.set_metadata('python.parity','persisted'); db.close()
print(json.dumps({'schema':15,'project':True,'task':True,'run':True,'writes':True}))`;
  const result = spawnSync(python, ['-c', pyCode, data, project.projectId, taskId, runId],
    { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  const pythonResult = JSON.parse(result.stdout);
  assert.deepEqual(pythonResult, { schema: 15, project: true, task: true, run: true, writes: true });
  const reopened = new ForgePersistence(data);
  await reopened.open();
  assert.equal(reopened.migrate(), 15);
  assert.equal(reopened.getMetadata('python.parity'), 'persisted');
  assert.equal(reopened.getProject(project.projectId)?.name, 'Python-updated project');
  const detail = reopened.taskDetail(project.projectId, taskId);
  assert.equal(detail.detail.task.id, taskId);
  assert.equal(detail.detail.task.position, 1);
  const observed = new Database(join(data, 'forge.sqlite'), { readonly: true });
  assert.equal(observed.prepare('SELECT revision FROM runs WHERE run_id=?').get(runId).revision, 2);
  observed.close();
  reopened.close();
  console.log(JSON.stringify({ result: 'passed', ...pythonResult, nodeReadBack: true }));
} finally {
  await rm(root, { recursive: true, force: true });
}
