import { resolve } from 'node:path';
import { ReferenceIndex, ValidationContext, type ValidationIssue, type ValidationReport } from './shared.js';
import { SchemaRegistry } from './schemas.js';
import { validatePlanning } from './planning.js';
import { validatePresets } from './presets.js';
import { validateOpenApi, validateProductionTokens, validateSql } from './artifacts.js';
import { validateVersions } from './versions.js';

export type { ValidationIssue, ValidationReport } from './shared.js';
export function validateContracts(repoRoot: string): ValidationReport {
  const started = performance.now();
  const context = new ValidationContext(resolve(repoRoot));
  const references = new ReferenceIndex(context);
  const schemas = new SchemaRegistry(context, references);
  schemas.load();
  validatePlanning(context, references);
  validateOpenApi(context, references);
  validatePresets(context, references, schemas);
  validateSql(context);
  validateProductionTokens(context);
  validateVersions(context);
  const errors: ValidationIssue[] = context.issues.filter((issue) => issue.severity === 'error');
  const warnings: ValidationIssue[] = context.issues.filter((issue) => issue.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings, checkedFiles: [...context.checked].sort(), duration: Math.round(performance.now() - started) };
}
