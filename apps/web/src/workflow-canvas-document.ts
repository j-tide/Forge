import { z } from 'zod';
import { workflowTemplateSchema, type WorkflowTemplate } from '@forge/contracts';

const positionSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});
export const canvasDocumentSchema = z.strictObject({
  format: z.literal('forge-workflow-canvas/v1'),
  definition: workflowTemplateSchema,
  layout: z.strictObject({ nodes: z.array(positionSchema).min(1).max(64) }),
});
export type CanvasLayout = z.infer<typeof canvasDocumentSchema>['layout'];
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;
const maxImportBytes = 256_000;

export function defaultCanvasLayout(definition: WorkflowTemplate): CanvasLayout {
  return { nodes: definition.nodes.map((node, index) => ({
    id: node.id, x: 80, y: 60 + index * 160,
  })) };
}

export function validateCanvasLayout(
  definition: WorkflowTemplate, layout: CanvasLayout,
): CanvasLayout {
  const checked = canvasDocumentSchema.parse({
    format: 'forge-workflow-canvas/v1', definition, layout,
  });
  const expected = new Set(checked.definition.nodes.map((node) => node.id));
  const seen = new Set(checked.layout.nodes.map((node) => node.id));
  if (seen.size !== expected.size || seen.size !== checked.layout.nodes.length ||
      [...expected].some((id) => !seen.has(id))) {
    throw new Error('CANVAS_LAYOUT_NODE_MISMATCH');
  }
  return checked.layout;
}

export function exportCanvasDocument(definition: WorkflowTemplate, layout: CanvasLayout): string {
  const checkedDefinition = workflowTemplateSchema.parse(definition);
  const checkedLayout = validateCanvasLayout(checkedDefinition, layout);
  return JSON.stringify({
    format: 'forge-workflow-canvas/v1', definition: checkedDefinition, layout: checkedLayout,
  }, null, 2);
}

export function importCanvasDocument(raw: string): CanvasDocument {
  if (new TextEncoder().encode(raw).byteLength > maxImportBytes) throw new Error('CANVAS_IMPORT_TOO_LARGE');
  const value: unknown = JSON.parse(raw);
  if (value && typeof value === 'object' && 'definition' in value &&
      value.definition && typeof value.definition === 'object' &&
      'schemaVersion' in value.definition && value.definition.schemaVersion !== '1.0') {
    throw new Error('WORKFLOW_DSL_VERSION_UNSUPPORTED');
  }
  const checked = canvasDocumentSchema.parse(value);
  validateCanvasLayout(checked.definition, checked.layout);
  return checked;
}
