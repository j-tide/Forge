import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = process.argv[2] ?? `${root}docs/forge-codex-execution-playbook.md`;
const playbook = readFileSync(file, 'utf8');
const tasks = JSON.parse(readFileSync(`${root}forge_spec_v1.0/planning/tasks.json`, 'utf8'));
const phases = JSON.parse(readFileSync(`${root}forge_spec_v1.0/planning/phases.json`, 'utf8'));
const cases = JSON.parse(readFileSync(`${root}forge_spec_v1.0/tests/acceptance-cases.json`, 'utf8'));
const deferredFile = process.argv[3] ?? `${root}docs/deferred-verification.json`;
const deferred = JSON.parse(readFileSync(deferredFile, 'utf8'));
const issues = [];
const taskById = new Map(tasks.map((task) => [task.id, task]));
const caseIds = new Set(cases.map((entry) => entry.id));
const officialPhases = phases.filter((phase) => phase.id !== 'P0');
const phaseIndex = new Map(phases.map((phase, index) => [phase.id, index]));
const expectedIds = officialPhases.flatMap((phase) => phase.taskIds);
const taskOrder = new Map(tasks.map((task, index) => [task.id, index]));
const mapEnd = playbook.indexOf('# Detailed Implementation Notes');
if (mapEnd < 0) issues.push('Missing mapped implementation detail section');
const map = mapEnd < 0 ? playbook : playbook.slice(0, mapEnd);
const phaseHeaders = [...map.matchAll(/^# (P\d+) — ([^\n]+)$/gm)];
const taskHeaders = [...map.matchAll(/^## (P\d+-\d\d) ([^\n]+)$/gm)];

function check(actual, expected, where) {
  if (actual !== expected) issues.push(`${where}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function field(body, key) {
  return body.match(new RegExp(`^\\*\\*${key}:\\*\\* ([^\\n]*)$`, 'm'))?.[1] ?? null;
}
function acceptanceIds(task) {
  const ids = new Set(task.testIds);
  for (const match of task.acceptance.matchAll(/T(\d{3})[–-]T(\d{3})/g)) {
    for (let number = Number(match[1]); number <= Number(match[2]); number += 1) {
      ids.add(`T${String(number).padStart(3, '0')}`);
    }
  }
  for (const match of task.acceptance.matchAll(/T\d{3}/g)) ids.add(match[0]);
  return ids;
}

check(phaseHeaders.map((match) => match[1]).join(','), officialPhases.map((phase) => phase.id).join(','), 'Phase order');
check(taskHeaders.map((match) => match[1]).join(','), expectedIds.join(','), 'Task order and IDs');
for (let index = 0; index < phaseHeaders.length; index += 1) {
  const header = phaseHeaders[index];
  const phase = officialPhases.find((entry) => entry.id === header[1]);
  if (!phase) { issues.push(`Unknown phase ${header[1]}`); continue; }
  check(header[2], phase.name, `${phase.id} name`);
  const end = phaseHeaders[index + 1]?.index ?? map.length;
  const body = map.slice(header.index, end);
  check(field(body, 'Phase Gate'), phase.exit, `${phase.id} gate`);
  const actualIds = [...body.matchAll(/^## (P\d+-\d\d) /gm)].map((entry) => entry[1]);
  check(actualIds.join(','), phase.taskIds.join(','), `${phase.id} task references`);
}

const referencedDetails = new Map();
for (let index = 0; index < taskHeaders.length; index += 1) {
  const header = taskHeaders[index];
  const task = taskById.get(header[1]);
  if (!task) { issues.push(`Unknown task ${header[1]}`); continue; }
  check(header[2], task.title, `${task.id} title`);
  const end = taskHeaders[index + 1]?.index ?? map.length;
  const body = map.slice(header.index, end);
  check(field(body, 'Depends on'), task.dependsOn.join(', ') || 'None', `${task.id} dependencies`);
  check(field(body, 'Module'), task.module, `${task.id} module`);
  check(field(body, 'Acceptance cases'), task.testIds.join(', ') || 'None', `${task.id} acceptance references`);
  check(field(body, 'Paths'), task.paths.map((path) => `\`${path}\``).join(', ') || 'No path prescribed', `${task.id} paths`);
  check(body.match(/^### Authoritative implementation\n\n([^\n]*)$/m)?.[1] ?? null,
    task.implementation, `${task.id} implementation`);
  check(body.match(/^### Authoritative acceptance\n\n([^\n]*)$/m)?.[1] ?? null,
    task.acceptance, `${task.id} acceptance`);
  const status = field(body, 'Status');
  if (!['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'DEFERRED'].includes(status) &&
    !(task.id === 'P2-10' && status === 'PAUSED_FOR_PYTHON_CORE_MIGRATION')) {
    issues.push(`${task.id} invalid status ${status}`);
  }
  for (const id of task.testIds) if (!caseIds.has(id)) issues.push(`${task.id} references missing acceptance case ${id}`);
  const note = body.match(/^### Existing detailed guidance\n\n([^\n]*)$/m)?.[1] ?? '';
  for (const id of note.match(/D-\d{3}/g) ?? []) {
    const owners = referencedDetails.get(id) ?? [];
    owners.push(task.id);
    referencedDetails.set(id, owners);
  }
}

const detailArea = mapEnd < 0 ? '' : playbook.slice(mapEnd);
const details = [...detailArea.matchAll(/^### (D-\d{3}) ([^\n]+)$/gm)];
check(new Set(details.map((entry) => entry[1])).size, details.length, 'Unique detailed note IDs');
for (let index = 0; index < details.length; index += 1) {
  const detail = details[index];
  const body = detailArea.slice(detail.index, details[index + 1]?.index ?? detailArea.indexOf('\n# C. Milestones'));
  const owners = field(body, 'Applies to')?.split(', ').filter(Boolean) ?? [];
  check((referencedDetails.get(detail[1]) ?? []).join(','), owners.join(','), `${detail[1]} mapping`);
  for (const id of owners) if (!taskById.has(id)) issues.push(`${detail[1]} references unknown task ${id}`);
}
for (const id of referencedDetails.keys()) if (!details.some((entry) => entry[1] === id)) issues.push(`Missing detail ${id}`);

if (deferred.schemaVersion !== '1.0' || !Array.isArray(deferred.entries)) {
  issues.push('Deferred verification manifest requires schemaVersion 1.0 and entries array');
} else {
  const seen = new Set();
  for (const entry of deferred.entries) {
    const source = taskById.get(entry.sourceTaskId);
    const owner = taskById.get(entry.ownerTaskId);
    const key = `${entry.sourceTaskId}:${entry.testId}`;
    if (seen.has(key)) issues.push(`Duplicate deferred verification ${key}`);
    seen.add(key);
    if (!caseIds.has(entry.testId)) issues.push(`Deferred verification ${key} references missing case`);
    if (!source) issues.push(`Deferred verification ${key} references missing source task`);
    else if (!acceptanceIds(source).has(entry.testId)) issues.push(`Deferred verification ${key} is not referenced by source task`);
    if (!owner) issues.push(`Deferred verification ${key} references missing owner task ${entry.ownerTaskId}`);
    else if (source && ((phaseIndex.get(owner.phase) ?? -1) < (phaseIndex.get(source.phase) ?? -1) ||
      (phaseIndex.get(owner.phase) === phaseIndex.get(source.phase) &&
        (taskOrder.get(owner.id) ?? -1) <= (taskOrder.get(source.id) ?? -1)))) {
      issues.push(`Deferred verification ${key} owner ${owner.id} is not a later task`);
    }
    if (entry.status !== 'DEFERRED_VERIFICATION') issues.push(`Deferred verification ${key} has invalid status ${entry.status}`);
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) issues.push(`Deferred verification ${key} lacks a reason`);
  }
}

if (issues.length) {
  for (const issue of issues) console.error(`TASK_MAP_ERROR ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Task map valid: ${officialPhases.length} phases, ${expectedIds.length} tasks, ${details.length} mapped detail blocks, ${caseIds.size} acceptance cases, ${deferred.entries.length} deferred verifications`);
}
