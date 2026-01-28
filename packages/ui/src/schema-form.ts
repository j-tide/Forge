/** Closed subset of JSON Schema accepted by the bundled plugin preflight. */
export interface SchemaFormField {
  type: 'string' | 'integer' | 'number' | 'boolean';
  title?: string | undefined;
  description?: string | undefined;
  format?: 'forge-credential-ref' | undefined;
}
export interface SchemaFormDefinition {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, SchemaFormField>;
  required: string[];
}

export function buildPluginConfig(schema: SchemaFormDefinition, input: Record<string, unknown>): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, field] of Object.entries(schema.properties)) {
    const value = input[key];
    if (value === undefined || value === '') {
      if (schema.required.includes(key)) throw new Error(`Required field: ${key}`);
      continue;
    }
    if (field.type === 'boolean' && typeof value === 'boolean') output[key] = value;
    else if (field.type === 'string' && typeof value === 'string') {
      if (field.format === 'forge-credential-ref' && !/^credential:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
        throw new Error(`Invalid credential reference: ${key}`);
      }
      output[key] = value;
    } else if ((field.type === 'integer' || field.type === 'number') && typeof value === 'number'
      && Number.isFinite(value) && (field.type !== 'integer' || Number.isInteger(value))) output[key] = value;
    else throw new Error(`Invalid field: ${key}`);
  }
  return output;
}
