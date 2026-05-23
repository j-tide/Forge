import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as formatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { ReferenceIndex, ValidationContext, record, string } from './shared.js';

export class SchemaRegistry {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: true, validateSchema: true });
  private readonly validators = new Map<string, ValidateFunction>();
  readonly schemas = new Map<string, Record<string, unknown>>();
  constructor(private readonly context: ValidationContext, private readonly references: ReferenceIndex) {
    (formatsModule as unknown as { default: (ajv: Ajv2020) => void }).default(this.ajv);
  }
  load(): void {
    const folder = join(this.context.specRoot, 'contracts');
    let files: string[];
    try { files = readdirSync(folder).filter((name) => name.endsWith('.schema.json')).sort(); }
    catch (error) {
      this.context.issue('FGV-IO-001', 'forge_spec_v1.0/contracts', '', `Cannot list schemas: ${String(error)}`);
      return;
    }
    if (!files.length) this.context.issue('FGV-SCHEMA-001', 'forge_spec_v1.0/contracts', '', 'No JSON Schemas found');
    for (const name of files) {
      const file = `forge_spec_v1.0/contracts/${name}`;
      const value = record(this.context.json(file));
      if (!value) { this.context.issue('FGV-SCHEMA-002', file, '', 'Schema must be an object'); continue; }
      const id = name.slice(0, -'.schema.json'.length);
      this.references.add('schema', id, file, '$id');
      if (string(value.$id) !== `https://forge.local/schemas/${name}`) this.context.issue('FGV-SCHEMA-003', file, '$id', 'Schema ID must match its canonical file name');
      if (value.$schema !== 'https://json-schema.org/draft/2020-12/schema') this.context.issue('FGV-SCHEMA-004', file, '$schema', 'Expected JSON Schema draft 2020-12');
      if (value.type === 'object' && !Array.isArray(value.required)) this.context.issue('FGV-SCHEMA-005', file, 'required', 'Root object needs an explicit required list');
      if (value.type === 'object' && value.additionalProperties === undefined) this.context.issue('FGV-SCHEMA-006', file, 'additionalProperties', 'Root object needs an explicit additionalProperties policy', undefined, 'warning');
      try {
        if (!this.ajv.validateSchema(value)) {
          for (const error of this.ajv.errors ?? []) this.context.issue('FGV-SCHEMA-007', file, error.instancePath, `${error.message ?? 'Invalid schema'} (${error.schemaPath})`);
          continue;
        }
        this.ajv.addSchema(value);
        this.schemas.set(id, value);
      } catch (error) { this.context.issue('FGV-SCHEMA-007', file, '', `Schema registration failed: ${String(error)}`); }
    }
    for (const [id] of this.schemas) {
      const file = `forge_spec_v1.0/contracts/${id}.schema.json`;
      try {
        const schema = this.schemas.get(id);
        if (schema) this.validators.set(id, this.ajv.compile(schema));
      } catch (error) { this.context.issue('FGV-SCHEMA-008', file, '$ref', `Schema reference/compilation failed: ${String(error)}`); }
    }
    const examples = files.length ? readdirSync(folder).filter((name) => name.endsWith('.example.json')).sort() : [];
    for (const name of examples) {
      const file = `forge_spec_v1.0/contracts/${name}`;
      const schemaName = name.slice(0, -'.example.json'.length);
      const value = this.context.json(file);
      this.validate(schemaName, value, file);
    }
  }
  validate(name: string, value: unknown, file: string): boolean {
    const validator = this.validators.get(name);
    if (!validator) {
      this.context.issue('FGV-SCHEMA-009', file, '', `No compiled schema for "${name}"`, name);
      return false;
    }
    if (validator(value)) return true;
    for (const error of validator.errors ?? []) {
      const path = error.instancePath + (error.keyword === 'required' ? `/${String(error.params.missingProperty)}` : '');
      this.context.issue('FGV-DATA-001', file, path, `${name}: ${error.message ?? 'invalid value'}`);
    }
    return false;
  }
}
