import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, sep, win32 } from 'node:path';
import { ReferenceIndex, ValidationContext, items, record, string } from './shared.js';
import { SchemaRegistry } from './schemas.js';

const base = 'forge_spec_v1.0/';
// Static reference-pack declarations. They are not a runtime capability or installed-plugin registry.
const declaredExecutors = ['forge.refiner'];
const declaredVerifiers = ['verifier.project-checks'];
const declaredApprovals = ['human.owner'];
const declaredServices = ['workspace.v1', 'artifact.v1', 'credential.v1'];
const declaredContexts = ['project-rules', 'repo-search'];
const declaredPermissions = ['workspace.read', 'workspace.write', 'process.spawn'];

function safeReference(path: string): boolean {
  const normalized = normalize(path);
  return path.length > 0 && !isAbsolute(path) && !win32.isAbsolute(path) &&
    normalized !== '..' && !normalized.startsWith(`..${sep}`) && !path.split(/[\\/]/).includes('..');
}

export function validatePresets(context: ValidationContext, refs: ReferenceIndex, schemas: SchemaRegistry): void {
  for (const id of declaredExecutors) refs.add('executor', id, 'packages/contract-validator/src/presets.ts', 'declaredExecutors');
  for (const id of declaredVerifiers) refs.add('verifier', id, 'packages/contract-validator/src/presets.ts', 'declaredVerifiers');
  for (const id of declaredApprovals) refs.add('approval', id, 'packages/contract-validator/src/presets.ts', 'declaredApprovals');
  for (const id of declaredServices) refs.add('service', id, 'packages/contract-validator/src/presets.ts', 'declaredServices');
  for (const id of declaredContexts) refs.add('context', id, 'packages/contract-validator/src/presets.ts', 'declaredContexts');
  for (const id of declaredPermissions) refs.add('permission', id, 'packages/contract-validator/src/presets.ts', 'declaredPermissions');
  let manifestNames: string[] = [];
  try { manifestNames = readdirSync(join(context.specRoot, 'contracts')).filter((name) => name.endsWith('.manifest.json') || name === 'plugin-manifest.example.json'); }
  catch (error) { context.issue('FGV-IO-001', `${base}contracts`, '', `Cannot list manifests: ${String(error)}`); }
  for (const manifestName of manifestNames) {
  const manifestFile = `${base}contracts/${manifestName}`;
  const manifest = record(context.json(manifestFile));
  if (manifest && schemas.validate('plugin-manifest', manifest, manifestFile)) {
    refs.add('plugin', string(manifest.id), manifestFile, 'id');
    if (manifest.forgeApiRange !== '^1.0.0') context.issue('FGV-PLUGIN-001', manifestFile, 'forgeApiRange', `Unsupported Forge plugin API range "${string(manifest.forgeApiRange)}"`);
    if (!safeReference(string(manifest.entry))) context.issue('FGV-PLUGIN-002', manifestFile, 'entry', 'Plugin entry must be a relative path inside its own package');
    const contribution = record(manifest.contributes);
    if (contribution) for (const [kind, namespace] of Object.entries({ executors: 'executor', verifiers: 'verifier', contextProviders: 'context' } as const)) {
      const ids = new Set<string>();
      for (const [i, value] of items(contribution[kind]).entries()) {
        const id = string(value);
        if (ids.has(id)) context.issue('FGV-PLUGIN-003', manifestFile, `contributes.${kind}[${i}]`, `Duplicate contribution "${id}"`, id);
        ids.add(id);
        refs.add(namespace, id, manifestFile, `contributes.${kind}[${i}]`);
      }
    }
    for (const [i, value] of items(manifest.requires).entries()) refs.require('service', string(value), manifestFile, `requires[${i}]`, 'FGV-PLUGIN-004');
    for (const [i, value] of items(manifest.requestedPermissions).entries()) refs.require('permission', string(value), manifestFile, `requestedPermissions[${i}]`, 'FGV-PLUGIN-005');
    const configSchema = string(manifest.configSchema);
    if (!safeReference(configSchema) || !existsSync(join(context.specRoot, 'contracts', configSchema))) context.issue('FGV-PLUGIN-006', manifestFile, 'configSchema', `Plugin configSchema "${configSchema}" does not exist`);
  }
  }
  const profileFolder = join(context.specRoot, 'presets');
  let profileFiles: string[] = [];
  try { profileFiles = readdirSync(profileFolder).filter((name) => name.endsWith('.profile.json')).sort(); }
  catch (error) { context.issue('FGV-IO-001', `${base}presets`, '', `Cannot list profiles: ${String(error)}`); }
  if (!profileFiles.length) context.issue('FGV-PROFILE-001', `${base}presets`, '', 'No agent profiles found');
  for (const name of profileFiles) {
    const file = `${base}presets/${name}`;
    const profile = record(context.json(file));
    if (!profile || !schemas.validate('agent-profile', profile, file)) continue;
    const id = string(profile.id);
    refs.add('profile', id, file, 'id');
    refs.require('executor', string(profile.executorId), file, 'executorId', 'FGV-PROFILE-002');
    for (const [i, value] of items(profile.contextProviders).entries()) refs.require('context', string(value), file, `contextProviders[${i}]`, 'FGV-PROFILE-003');
    if (!['read-only', 'workspace-write'].includes(string(profile.policyProfile))) context.issue('FGV-PROFILE-004', file, 'policyProfile', 'Unknown permission profile');
    const prompt = string(profile.promptTemplate);
    if (!safeReference(prompt) || !existsSync(join(context.specRoot, prompt))) context.issue('FGV-PROFILE-005', file, 'promptTemplate', `Prompt template "${prompt}" does not exist`);
    if (profile.executorId === 'forge.refiner') context.issue('FGV-PROFILE-006', file, 'executorId', 'forge.refiner is a reference-only declaration; runtime support is not established', id, 'warning');
    if (profile.executorId === 'codex-sdk') context.issue('FGV-PROFILE-007', file, 'executorId', 'codex-sdk is declared by a reference example; an installed runtime contribution is not established', id, 'warning');
  }
  let workflowFiles: string[] = [];
  try { workflowFiles = readdirSync(profileFolder).filter((name) => /\.workflow\.(json|ya?ml)$/.test(name)).sort(); }
  catch (error) { context.issue('FGV-IO-001', `${base}presets`, '', `Cannot list workflows: ${String(error)}`); }
  if (!workflowFiles.length) context.issue('FGV-WORKFLOW-016', `${base}presets`, '', 'No workflow definitions found');
  for (const name of workflowFiles) {
  const workflowFile = `${base}presets/${name}`;
  const workflow = record(name.endsWith('.json') ? context.json(workflowFile) : context.yaml(workflowFile));
  if (!workflow || !schemas.validate('workflow', workflow, workflowFile)) continue;
  const workflowId = string(workflow.id);
  refs.add('workflow', `${workflowId}@${String(workflow.revision)}`, workflowFile, 'id');
  const nodes = items(workflow.nodes).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const nodeIds = new Set<string>();
  for (const [i, node] of nodes.entries()) {
    const id = string(node.id);
    if (nodeIds.has(id)) context.issue('FGV-WORKFLOW-001', workflowFile, `nodes[${i}].id`, `Duplicate workflow step "${id}"`, id);
    nodeIds.add(id);
    const kind = string(node.kind);
    const namespace = kind === 'agent' ? 'profile' : kind === 'verifier' ? 'verifier' : kind === 'approval' ? 'approval' : kind === 'command' ? 'command' : null;
    if (namespace) refs.require(namespace, string(node.binding), workflowFile, `nodes[${i}].binding`, 'FGV-WORKFLOW-004');
    refs.require('schema', string(node.outputSchema), workflowFile, `nodes[${i}].outputSchema`, 'FGV-WORKFLOW-005');
    const capabilityFields = record(schemas.schemas.get('executor-capabilities')?.properties) ?? {};
    for (const [j, capability] of items(node.requiredCapabilities).entries()) if (!(string(capability) in capabilityFields)) context.issue('FGV-WORKFLOW-017', workflowFile, `nodes[${i}].requiredCapabilities[${j}]`, `Unknown executor capability "${string(capability)}"`);
    if (kind === 'approval' && node.binding !== 'human.owner') context.issue('FGV-WORKFLOW-006', workflowFile, `nodes[${i}].binding`, 'Final approval must be bound to human.owner');
  }
  const start = string(workflow.start);
  if (!nodeIds.has(start)) context.issue('FGV-WORKFLOW-002', workflowFile, 'start', `Entry step "${start}" does not exist`);
  const edges = items(workflow.edges).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const graph = new Map([...nodeIds].map((id) => [id, [] as string[]]));
  const routeIds = new Set<string>();
  for (const [i, edge] of edges.entries()) {
    const from = string(edge.from), to = string(edge.to);
    if (!nodeIds.has(from) || !nodeIds.has(to)) context.issue('FGV-WORKFLOW-003', workflowFile, `edges[${i}]`, `Dangling transition ${from} → ${to}`);
    const route = `${from}:${string(edge.on)}`;
    if (routeIds.has(route)) context.issue('FGV-WORKFLOW-007', workflowFile, `edges[${i}]`, `Ambiguous transition for ${route}`);
    routeIds.add(route);
    graph.get(from)?.push(to);
  }
  const active = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) { context.issue('FGV-WORKFLOW-008', workflowFile, 'edges', `Normal workflow has an unbounded cycle at "${id}"`, id); return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    active.delete(id);
    visited.add(id);
  };
  if (nodeIds.has(start)) visit(start);
  for (const id of nodeIds) if (!visited.has(id)) context.issue('FGV-WORKFLOW-009', workflowFile, 'nodes', `Step "${id}" is unreachable`, id);
  const terminal = nodes.filter((node) => (graph.get(string(node.id))?.length ?? 0) === 0);
  if (!terminal.length || terminal.some((node) => node.kind !== 'approval')) context.issue('FGV-WORKFLOW-010', workflowFile, 'edges', 'Every normal terminal path must reach human approval');
  if (workflow.finalAcceptance !== 'human') context.issue('FGV-WORKFLOW-011', workflowFile, 'finalAcceptance', 'Final acceptance must remain human');
  if (!Number.isInteger(workflow.maxTotalAttempts) || Number(workflow.maxTotalAttempts) < nodes.length) context.issue('FGV-WORKFLOW-012', workflowFile, 'maxTotalAttempts', 'Workflow needs a finite total attempt budget');
  for (const [i, route] of items(workflow.rework).entries()) {
    const value = record(route);
    if (!value) continue;
    const from = string(value.from), to = string(value.to);
    if (!nodeIds.has(from) || !nodeIds.has(to)) context.issue('FGV-WORKFLOW-013', workflowFile, `rework[${i}]`, `Dangling rework route ${from} → ${to}`);
    if (!Number.isInteger(value.maxCycles) || Number(value.maxCycles) < 1 || Number(value.maxCycles) >= Number(workflow.maxTotalAttempts)) context.issue('FGV-WORKFLOW-014', workflowFile, `rework[${i}].maxCycles`, 'Rework must have a finite bound below maxTotalAttempts');
    const key = `${from}:${string(value.on)}`;
    if (routeIds.has(key)) context.issue('FGV-WORKFLOW-015', workflowFile, `rework[${i}]`, `Ambiguous failure route for ${key}`);
    routeIds.add(key);
  }
  }
  const taskExampleFile = `${base}contracts/task-contract.example.json`;
  const taskExample = record(context.json(taskExampleFile));
  if (taskExample) refs.require('workflow', string(taskExample.workflowRef), taskExampleFile, 'workflowRef', 'FGV-REF-002');
}
