import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { migrations } from '@forge/persistence';
import { ReferenceIndex, ValidationContext, items, record, string } from './shared.js';

const base = 'forge_spec_v1.0/';
function localReference(root: unknown, reference: string): boolean {
  if (!reference.startsWith('#/')) return false;
  let current: unknown = root;
  for (const segment of reference.slice(2).split('/')) {
    current = record(current)?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (current === undefined) return false;
  }
  return true;
}

export function validateOpenApi(context: ValidationContext, refs: ReferenceIndex): void {
  const file = `${base}contracts/openapi.yaml`;
  const api = record(context.yaml(file));
  if (!api) return;
  if (!/^3\.1\./.test(string(api.openapi))) context.issue('FGV-API-001', file, 'openapi', 'OpenAPI version must be 3.1.x');
  if (!string(record(api.info)?.title).trim() || !string(record(api.info)?.version).trim()) context.issue('FGV-API-002', file, 'info', 'OpenAPI title and version are required');
  const paths = record(api.paths);
  if (!paths || !Object.keys(paths).length) context.issue('FGV-API-003', file, 'paths', 'OpenAPI paths must be nonempty');
  const operationIds = new Set<string>();
  const allowedMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
  for (const [path, item] of Object.entries(paths ?? {})) {
    if (!path.startsWith('/')) context.issue('FGV-API-004', file, `paths.${path}`, 'API path must start with /');
    const pathItem = record(item);
    if (!pathItem) { context.issue('FGV-API-005', file, `paths.${path}`, 'Path item must be an object'); continue; }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (method === 'parameters' || method === 'summary' || method === 'description' || method === 'servers') continue;
      if (!allowedMethods.has(method)) { context.issue('FGV-API-006', file, `paths.${path}.${method}`, 'Unknown HTTP method'); continue; }
      const op = record(operation);
      const id = string(op?.operationId);
      if (!id) context.issue('FGV-API-007', file, `paths.${path}.${method}.operationId`, 'Operation ID is required');
      else if (operationIds.has(id)) context.issue('FGV-API-008', file, `paths.${path}.${method}.operationId`, `Duplicate operation ID "${id}"`, id);
      operationIds.add(id);
      const responses = record(op?.responses);
      if (!responses || !Object.keys(responses).length) context.issue('FGV-API-009', file, `paths.${path}.${method}.responses`, 'Operation needs at least one response');
      else for (const [status, response] of Object.entries(responses)) {
        if (!/^[1-5]\d\d$/.test(status) && status !== 'default') context.issue('FGV-API-010', file, `paths.${path}.${method}.responses.${status}`, 'Invalid HTTP status code');
        if (!string(record(response)?.description).trim()) context.issue('FGV-API-011', file, `paths.${path}.${method}.responses.${status}`, 'Response description is required');
      }
    }
  }
  const schemes = record(record(api.components)?.securitySchemes) ?? {};
  const inspectSecurity = (value: unknown, path: string): void => {
    for (const [i, requirement] of items(value).entries()) for (const name of Object.keys(record(requirement) ?? {})) {
      if (!(name in schemes)) context.issue('FGV-API-012', file, `${path}[${i}].${name}`, `Security scheme "${name}" is undefined`);
    }
  };
  inspectSecurity(api.security, 'security');
  for (const [path, item] of Object.entries(paths ?? {})) for (const [method, operation] of Object.entries(record(item) ?? {})) {
    if (allowedMethods.has(method) && record(operation)?.security !== undefined) inspectSecurity(record(operation)?.security, `paths.${path}.${method}.security`);
  }
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((child, i) => walk(child, `${path}[${i}]`)); return; }
    const object = record(value);
    if (!object) return;
    if (typeof object.$ref === 'string' && !localReference(api, object.$ref)) context.issue('FGV-API-013', file, `${path}.$ref`, `Unresolved or external OpenAPI reference "${object.$ref}"`);
    for (const [key, child] of Object.entries(object)) if (key !== '$ref') walk(child, path ? `${path}.${key}` : key);
  };
  walk(api, '');
  const commandsFile = `${base}planning/commands.json`;
  const commands = items(context.json(commandsFile)).map(record).filter((value): value is Record<string, unknown> => value !== null);
  const methods = items(record(record(record(api.components)?.schemas)?.Command)?.oneOf)
    .map((variant) => string(record(record(variant)?.properties)?.method && record(record(record(variant)?.properties)?.method)?.const));
  if (!methods.length) context.issue('FGV-API-014', file, 'components.schemas.Command.oneOf', 'Command union is missing');
  const methodSet = new Set(methods);
  if (methodSet.size !== methods.length) context.issue('FGV-API-015', file, 'components.schemas.Command.oneOf', 'Duplicate command method in OpenAPI');
  for (const [i, command] of commands.entries()) {
    const method = string(command.method);
    refs.add('command', method, commandsFile, `[${i}].method`);
    if (!methodSet.has(method)) context.issue('FGV-API-016', commandsFile, `[${i}].method`, `Command "${method}" has no OpenAPI variant`, method);
    if (typeof command.remoteAllowed !== 'boolean') context.issue('FGV-API-017', commandsFile, `[${i}].remoteAllowed`, 'remoteAllowed must be boolean');
    if (!string(command.scope).trim() || !string(command.payloadSchema).trim()) context.issue('FGV-API-018', commandsFile, `[${i}]`, 'Command needs scope and payloadSchema');
    if (['credentials.set', 'approvals.decide'].includes(method) && command.remoteAllowed !== false) context.issue('FGV-API-019', commandsFile, `[${i}].remoteAllowed`, `Sensitive command "${method}" must remain local`);
  }
  for (const method of methodSet) refs.require('command', method, file, 'components.schemas.Command.oneOf', 'FGV-API-020');
}

export function validateSql(context: ValidationContext): void {
  const file = `${base}contracts/schema.sql`;
  const sql = context.read(file);
  if (sql === null) return;
  let db: Database.Database | null = null;
  try {
    db = new Database(':memory:');
    db.exec(sql);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    if (!tables.length) context.issue('FGV-SQL-001', file, '', 'DDL created no tables');
    if (db.pragma('foreign_keys', { simple: true }) !== 1) context.issue('FGV-SQL-002', file, 'PRAGMA foreign_keys', 'DDL must enable foreign key enforcement');
    for (const table of tables) {
      const foreignKeys = db.pragma(`foreign_key_list(${JSON.stringify(table.name)})`) as { table: string }[];
      for (const target of foreignKeys) if (!tables.some((candidate) => candidate.name === target.table)) context.issue('FGV-SQL-003', file, table.name, `Foreign key references missing table "${target.table}"`);
    }
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') context.issue('FGV-SQL-004', file, 'integrity_check', `SQLite integrity failed: ${String(integrity)}`);
  } catch (error) { context.issue('FGV-SQL-005', file, '', `DDL cannot execute in isolated SQLite: ${String(error)}`); }
  finally { db?.close(); }
  let migrationDb: Database.Database | null = null;
  try {
    migrationDb = new Database(':memory:');
    for (const [i, migration] of migrations.entries()) {
      if (migration.version !== i + 1) context.issue('FGV-MIGRATION-001', 'packages/persistence/src/migrations.ts', `migrations[${i}].version`, 'Migration versions must be contiguous and ordered');
      if (createHash('sha256').update(migration.sql).digest('hex') !== migration.checksum) context.issue('FGV-MIGRATION-002', 'packages/persistence/src/migrations.ts', `migrations[${i}].checksum`, 'Migration checksum does not match SQL');
      migrationDb.exec(migration.sql);
    }
    if (!migrationDb.prepare("SELECT 1 FROM sqlite_master WHERE name='runtime_metadata'").get()) context.issue('FGV-MIGRATION-003', 'packages/persistence/src/migrations.ts', '', 'Runtime metadata table is absent after migrations');
  } catch (error) { context.issue('FGV-MIGRATION-004', 'packages/persistence/src/migrations.ts', '', `Production migration SQL fails in isolated SQLite: ${String(error)}`); }
  finally { migrationDb?.close(); }
  context.checked.add('packages/persistence/src/migrations.ts');
}

export function validateProductionTokens(context: ValidationContext): void {
  const file = 'packages/ui/src/tokens/values.json';
  const cssFile = 'packages/ui/src/tokens.css';
  const tokens = record(context.json(file));
  const css = context.read(cssFile);
  if (!tokens || css === null) return;
  const required = ['color-canvas', 'color-text', 'surface-panel', 'radius-lg', 'shadow-surface', 'blur-glass', 'space-16', 'font-body', 'motion-normal', 'z-dialog'];
  for (const key of required) if (!string(tokens[key]).trim()) context.issue('FGV-TOKEN-001', file, key, `Production design token "${key}" is missing`);
  for (const key of Object.keys(tokens)) {
    if (!/^[-a-z0-9]+$/.test(key)) context.issue('FGV-TOKEN-002', file, key, 'Token name contains invalid characters');
    if (!css.includes(`--forge-${key}:`)) context.issue('FGV-TOKEN-003', cssFile, `--forge-${key}`, `Generated CSS variable for "${key}" is missing`);
  }
}
