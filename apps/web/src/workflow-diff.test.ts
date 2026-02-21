import { expect, it } from 'vitest';
import type { WorkflowTemplate } from '@forge/contracts';
import { diffWorkflowDefinitions } from './workflow-diff';

const old: WorkflowTemplate = {
  schemaVersion: '1.0', id: 'workflow.fixture', revision: 1, name: 'Quick', start: 'develop',
  nodes: [{ id: 'develop', kind: 'agent', label: 'Developer', boardColumn: 'development',
    binding: 'profile.developer', requiredCapabilities: ['structuredOutput'], inputs: ['task'],
    outputSchema: 'step-result', timeoutSeconds: 600, retryLimit: 1, readOnly: false }],
  edges: [], rework: [], maxTotalAttempts: 6, onUnmatched: 'escalate', finalAcceptance: 'human',
};

it('shows immutable publication differences without conflating a draft with a Run', () => {
  const next: WorkflowTemplate = { ...old, revision: 2, name: 'Quick review',
    nodes: [{ ...old.nodes[0]!, label: 'Developer v2', timeoutSeconds: 900 }],
    maxTotalAttempts: 8 };
  expect(diffWorkflowDefinitions(old, next)).toEqual([
    { field: '名称', before: 'Quick', after: 'Quick review' },
    { field: '总尝试上限', before: '6', after: '8' },
    { field: '步骤 develop · 名称', before: 'Developer', after: 'Developer v2' },
    { field: '步骤 develop · 超时秒数', before: '600', after: '900' },
  ]);
  expect(diffWorkflowDefinitions(old, old)).toEqual([]);
  expect(() => diffWorkflowDefinitions(old, { ...old, id: 'workflow.other' })).toThrow('WORKFLOW_ID_MISMATCH');
});
