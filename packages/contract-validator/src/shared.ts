import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseDocument } from 'yaml';

export type Severity = 'error' | 'warning';
export interface ValidationIssue {
  code: string;
  severity: Severity;
  file: string;
  path: string;
  message: string;
  relatedId?: string;
  suggestion?: string;
}
export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checkedFiles: string[];
  duration: number;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function items(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function string(value: unknown): string { return typeof value === 'string' ? value : ''; }

export class ValidationContext {
  readonly specRoot: string;
  readonly checked = new Set<string>();
  readonly issues: ValidationIssue[] = [];
  constructor(readonly repoRoot: string) { this.specRoot = join(repoRoot, 'forge_spec_v1.0'); }
  issue(code: string, file: string, path: string, message: string, relatedId?: string, severity: Severity = 'error', suggestion?: string): void {
    this.issues.push({ code, severity, file, path, message, ...(relatedId ? { relatedId } : {}), ...(suggestion ? { suggestion } : {}) });
  }
  read(relativePath: string): string | null {
    const file = relativePath.split('\\').join('/');
    this.checked.add(file);
    try { return readFileSync(join(this.repoRoot, file), 'utf8'); }
    catch (error) {
      this.issue('FGV-IO-001', file, '', `Cannot read file: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  json(path: string): unknown {
    const text = this.read(path);
    if (text === null) return null;
    try { return JSON.parse(text) as unknown; }
    catch (error) {
      this.issue('FGV-JSON-001', path, '', `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  yaml(path: string): unknown {
    const text = this.read(path);
    if (text === null) return null;
    try {
      const doc = parseDocument(text, { uniqueKeys: true, strict: true });
      for (const error of doc.errors) this.issue('FGV-YAML-001', path, '', error.message);
      return doc.errors.length ? null : doc.toJS() as unknown;
    } catch (error) {
      this.issue('FGV-YAML-001', path, '', `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  relative(path: string): string { return relative(this.repoRoot, path).split('\\').join('/'); }
}

export type Namespace = 'schema' | 'task' | 'phase' | 'test' | 'module' | 'profile' | 'workflow' | 'plugin' | 'executor' | 'verifier' | 'approval' | 'service' | 'context' | 'permission' | 'command';
export class ReferenceIndex {
  private readonly values = new Map<Namespace, Map<string, string>>();
  constructor(private readonly context: ValidationContext) {}
  add(namespace: Namespace, id: string, file: string, path: string): void {
    if (!id) { this.context.issue('FGV-ID-001', file, path, `Missing ${namespace} ID`); return; }
    let group = this.values.get(namespace);
    if (!group) { group = new Map(); this.values.set(namespace, group); }
    const previous = group.get(id);
    if (previous) this.context.issue('FGV-ID-002', file, path, `Duplicate ${namespace} ID "${id}"; first declared in ${previous}`, id);
    else group.set(id, file);
  }
  has(namespace: Namespace, id: string): boolean { return this.values.get(namespace)?.has(id) ?? false; }
  require(namespace: Namespace, id: string, file: string, path: string, code = 'FGV-REF-001'): void {
    if (!this.has(namespace, id)) this.context.issue(code, file, path, `Referenced ${namespace} "${id}" does not exist`, id);
  }
  ids(namespace: Namespace): string[] { return [...(this.values.get(namespace)?.keys() ?? [])]; }
}
