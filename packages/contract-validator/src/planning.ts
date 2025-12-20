import { ReferenceIndex, ValidationContext, items, record, string } from './shared.js';

const base = 'forge_spec_v1.0/';
const allowedTaskStatus = new Set(['not_started', 'in_progress', 'blocked', 'completed']);
const allowedTestStatus = new Set(['specified_not_executed', 'implemented_not_executed', 'passed', 'failed', 'blocked', 'skipped']);

export function validatePlanning(context: ValidationContext, refs: ReferenceIndex): void {
  const modulesFile = `${base}planning/modules.json`;
  const phasesFile = `${base}planning/phases.json`;
  const tasksFile = `${base}planning/tasks.json`;
  const testsFile = `${base}tests/acceptance-cases.json`;
  const modules = items(context.json(modulesFile)).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const phases = items(context.json(phasesFile)).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const tasks = items(context.json(tasksFile)).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const tests = items(context.json(testsFile)).map(record).filter((value): value is Record<string, unknown> => value !== null);
  if (!modules.length) context.issue('FGV-PLAN-001', modulesFile, '', 'Module list must be nonempty');
  if (!phases.length) context.issue('FGV-PLAN-001', phasesFile, '', 'Phase list must be nonempty');
  if (!tasks.length) context.issue('FGV-PLAN-001', tasksFile, '', 'Task list must be nonempty');
  if (!tests.length) context.issue('FGV-PLAN-001', testsFile, '', 'Acceptance case list must be nonempty');
  modules.forEach((module, i) => {
    const id = string(module.id);
    refs.add('module', id, modulesFile, `[${i}].id`);
    if (!/^M\d{2}$/.test(id)) context.issue('FGV-PLAN-002', modulesFile, `[${i}].id`, `Invalid module ID "${id}"`);
    if (!string(module.name).trim()) context.issue('FGV-PLAN-003', modulesFile, `[${i}].name`, 'Module needs a name');
  });
  phases.forEach((phase, i) => {
    const id = string(phase.id);
    refs.add('phase', id, phasesFile, `[${i}].id`);
    if (id !== `P${i}`) context.issue('FGV-PLAN-004', phasesFile, `[${i}].id`, `Phase order is invalid; expected P${i}`);
    if (!string(phase.name).trim() || !string(phase.exit).trim()) context.issue('FGV-PLAN-005', phasesFile, `[${i}]`, 'Phase needs name and exit criteria');
    if (!Array.isArray(phase.taskIds)) context.issue('FGV-PLAN-006', phasesFile, `[${i}].taskIds`, 'Phase taskIds must be an array');
  });
  tests.forEach((test, i) => {
    const id = string(test.id);
    refs.add('test', id, testsFile, `[${i}].id`);
    if (!/^T\d{3}$/.test(id)) context.issue('FGV-TEST-001', testsFile, `[${i}].id`, `Invalid acceptance ID "${id}"`);
    for (const field of ['title', 'given', 'when', 'then']) {
      if (!string(test[field]).trim()) context.issue('FGV-TEST-002', testsFile, `[${i}].${field}`, `Acceptance case needs ${field}`, id);
    }
    if (!['unit', 'integration', 'e2e'].includes(string(test.level))) context.issue('FGV-TEST-003', testsFile, `[${i}].level`, 'Invalid acceptance level', id);
    if (!allowedTestStatus.has(string(test.status))) context.issue('FGV-TEST-004', testsFile, `[${i}].status`, 'Invalid acceptance status', id);
    refs.require('module', string(test.module), testsFile, `[${i}].module`, 'FGV-TEST-005');
  });
  tasks.forEach((task, i) => {
    const id = string(task.id);
    refs.add('task', id, tasksFile, `[${i}].id`);
    if (!/^P\d+-\d{2}$/.test(id)) context.issue('FGV-PLAN-007', tasksFile, `[${i}].id`, `Invalid task ID "${id}"`);
  });
  const taskById = new Map(tasks.map((task) => [string(task.id), task]));
  const testById = new Map(tests.map((test) => [string(test.id), test]));
  tests.forEach((test, i) => {
    if (test.taskId !== undefined) refs.require('task', string(test.taskId), testsFile, `[${i}].taskId`, 'FGV-TEST-006');
    for (const [j, related] of items(test.relatedTaskIds).entries()) refs.require('task', string(related), testsFile, `[${i}].relatedTaskIds[${j}]`, 'FGV-TEST-006');
  });
  const phaseTasks = new Map<string, string>();
  phases.forEach((phase, i) => {
    for (const [j, idValue] of items(phase.taskIds).entries()) {
      const id = string(idValue);
      refs.require('task', id, phasesFile, `[${i}].taskIds[${j}]`, 'FGV-PLAN-008');
      if (phaseTasks.has(id)) context.issue('FGV-PLAN-009', phasesFile, `[${i}].taskIds[${j}]`, `Task "${id}" occurs in multiple phases`, id);
      else phaseTasks.set(id, string(phase.id));
    }
  });
  const visited = new Set<string>();
  const active = new Set<string>();
  const checkCycle = (id: string): void => {
    if (active.has(id)) { context.issue('FGV-PLAN-010', tasksFile, id, `Task dependency cycle includes "${id}"`, id); return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const dep of items(taskById.get(id)?.dependsOn).map(string)) if (taskById.has(dep)) checkCycle(dep);
    active.delete(id);
    visited.add(id);
  };
  tasks.forEach((task, i) => {
    const id = string(task.id);
    const phase = string(task.phase);
    refs.require('phase', phase, tasksFile, `[${i}].phase`, 'FGV-PLAN-011');
    refs.require('module', string(task.module), tasksFile, `[${i}].module`, 'FGV-PLAN-012');
    if (phaseTasks.get(id) !== phase) context.issue('FGV-PLAN-013', tasksFile, `[${i}].phase`, `Task "${id}" is absent from its phase taskIds`, id);
    for (const field of ['title', 'implementation', 'deliverable', 'acceptance']) if (!string(task[field]).trim()) context.issue('FGV-PLAN-014', tasksFile, `[${i}].${field}`, `Task needs ${field}`, id);
    if (!allowedTaskStatus.has(string(task.status))) context.issue('FGV-PLAN-015', tasksFile, `[${i}].status`, 'Invalid task status', id);
    if (!Array.isArray(task.dependsOn)) context.issue('FGV-PLAN-016', tasksFile, `[${i}].dependsOn`, 'Dependencies must be an array', id);
    if (!Array.isArray(task.testIds) || !items(task.testIds).length) context.issue('FGV-PLAN-017', tasksFile, `[${i}].testIds`, 'Task needs referenced acceptance cases', id);
    if (new Set(items(task.dependsOn).map(string)).size !== items(task.dependsOn).length) context.issue('FGV-PLAN-024', tasksFile, `[${i}].dependsOn`, 'Duplicate task dependency', id);
    if (new Set(items(task.testIds).map(string)).size !== items(task.testIds).length) context.issue('FGV-PLAN-025', tasksFile, `[${i}].testIds`, 'Duplicate acceptance reference', id);
    for (const [j, depValue] of items(task.dependsOn).entries()) {
      const dep = string(depValue);
      refs.require('task', dep, tasksFile, `[${i}].dependsOn[${j}]`, 'FGV-PLAN-018');
      if (dep === id) context.issue('FGV-PLAN-019', tasksFile, `[${i}].dependsOn[${j}]`, 'Task cannot depend on itself', id);
      const depPhase = Number(/^P(\d+)/.exec(string(taskById.get(dep)?.phase))?.[1]);
      const ownPhase = Number(/^P(\d+)/.exec(phase)?.[1]);
      if (Number.isFinite(depPhase) && Number.isFinite(ownPhase) && depPhase > ownPhase) context.issue('FGV-PLAN-020', tasksFile, `[${i}].dependsOn[${j}]`, `Task depends on a later phase: ${dep}`, id);
    }
    for (const [j, testValue] of items(task.testIds).entries()) {
      const testId = string(testValue);
      refs.require('test', testId, tasksFile, `[${i}].testIds[${j}]`, 'FGV-PLAN-021');
      const test = testById.get(testId);
      if (test && test.module !== task.module) context.issue('FGV-PLAN-022', tasksFile, `[${i}].testIds[${j}]`, `Acceptance ${testId} belongs to another module`, id);
    }
    checkCycle(id);
  });
  for (const id of refs.ids('task')) if (!phaseTasks.has(id)) context.issue('FGV-PLAN-023', phasesFile, 'taskIds', `Task "${id}" is not listed in any phase`, id);
}
