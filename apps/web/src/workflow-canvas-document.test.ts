import { expect, it } from 'vitest';
import type { WorkflowTemplate } from '@forge/contracts';
import { defaultCanvasLayout, exportCanvasDocument, importCanvasDocument,
  validateCanvasLayout } from './workflow-canvas-document';

const definition: WorkflowTemplate = {
  schemaVersion: '1.0', id: 'workflow.fixture', revision: 2, name: 'Fixture',
  start: 'develop', nodes: [
    { id: 'develop', kind: 'agent', label: 'Develop', boardColumn: 'development',
      binding: 'profile.developer', requiredCapabilities: ['structuredOutput'],
      inputs: ['task'], outputSchema: 'step-result', timeoutSeconds: 600, retryLimit: 1,
      readOnly: false },
    { id: 'accept', kind: 'approval', label: 'Human acceptance', boardColumn: 'verify',
      binding: 'human.owner', requiredCapabilities: [], inputs: ['task', 'snapshot'],
      outputSchema: 'approval-decision', timeoutSeconds: 600, retryLimit: 0, readOnly: true },
  ],
  edges: [{ from: 'develop', on: 'ready', to: 'accept' }],
  rework: [{ from: 'develop', on: 'failed', to: 'develop', maxCycles: 2,
    invalidateDescendants: true }],
  maxTotalAttempts: 4, onUnmatched: 'escalate', finalAcceptance: 'human',
};

it('round trips every semantic field while layout remains independent', () => {
  const layout = defaultCanvasLayout(definition);
  layout.nodes[0]!.x = -340;
  layout.nodes[1]!.y = 980;
  const imported = importCanvasDocument(exportCanvasDocument(definition, layout));
  expect(imported.definition).toEqual(definition);
  expect(imported.layout).toEqual(layout);
  imported.layout.nodes[0]!.x = 400;
  expect(imported.definition).toEqual(definition);
  expect(imported.definition.edges).toEqual(definition.edges);
  expect(imported.definition.rework).toEqual(definition.rework);
});

it('rejects missing, duplicate, foreign, oversized or untrusted layout fields', () => {
  const layout = defaultCanvasLayout(definition);
  expect(() => validateCanvasLayout(definition, { nodes: [layout.nodes[0]!] })).toThrow(
    'CANVAS_LAYOUT_NODE_MISMATCH',
  );
  expect(() => validateCanvasLayout(definition, { nodes: [
    layout.nodes[0]!, layout.nodes[0]!,
  ] })).toThrow('CANVAS_LAYOUT_NODE_MISMATCH');
  const valid = JSON.parse(exportCanvasDocument(definition, layout));
  expect(() => importCanvasDocument(JSON.stringify({ ...valid, autoApprove: true }))).toThrow();
  expect(() => importCanvasDocument(JSON.stringify({ ...valid, layout: { nodes: [
    { id: 'develop', x: 0, y: 0 }, { id: '../secret', x: 0, y: 0 },
  ] } }))).toThrow();
  expect(() => importCanvasDocument(' '.repeat(256_001))).toThrow('CANVAS_IMPORT_TOO_LARGE');
  expect(() => importCanvasDocument(JSON.stringify({ ...valid, definition: {
    ...valid.definition, schemaVersion: '2.0',
  } }))).toThrow('WORKFLOW_DSL_VERSION_UNSUPPORTED');
});
