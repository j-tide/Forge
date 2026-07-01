import type { WorkflowTemplate } from '@forge/contracts';

export interface WorkflowDifference {
  field: string;
  before: string;
  after: string;
}

function display(value: unknown): string {
  if (value === undefined) return '无';
  if (Array.isArray(value)) return value.length ? value.map(String).join(' → ') : '无';
  return String(value);
}

export function diffWorkflowDefinitions(oldDefinition: WorkflowTemplate,
  newDefinition: WorkflowTemplate): WorkflowDifference[] {
  if (oldDefinition.id !== newDefinition.id) throw new Error('WORKFLOW_ID_MISMATCH');
  const changes: WorkflowDifference[] = [];
  const add = (field: string, before: unknown, after: unknown): void => {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field, before: display(before), after: display(after) });
    }
  };
  add('名称', oldDefinition.name, newDefinition.name);
  add('入口', oldDefinition.start, newDefinition.start);
  add('步骤顺序', oldDefinition.nodes.map((node) => node.id),
    newDefinition.nodes.map((node) => node.id));
  add('总尝试上限', oldDefinition.maxTotalAttempts, newDefinition.maxTotalAttempts);
  const oldNodes = new Map(oldDefinition.nodes.map((node) => [node.id, node]));
  const newNodes = new Map(newDefinition.nodes.map((node) => [node.id, node]));
  for (const id of new Set([...oldNodes.keys(), ...newNodes.keys()])) {
    const before = oldNodes.get(id);
    const after = newNodes.get(id);
    if (!before || !after) { add(`步骤 ${id}`, before ? '存在' : undefined, after ? '存在' : undefined); continue; }
    for (const [field, key] of [
      ['名称', 'label'], ['种类', 'kind'], ['看板阶段', 'boardColumn'], ['绑定', 'binding'],
      ['只读', 'readOnly'], ['超时秒数', 'timeoutSeconds'], ['重试上限', 'retryLimit'],
      ['必需能力', 'requiredCapabilities'], ['输入', 'inputs'], ['输出', 'outputSchema'],
    ] as const) add(`步骤 ${id} · ${field}`, before[key], after[key]);
  }
  add('正常路径', oldDefinition.edges.map((edge) => `${edge.from} · ${edge.on} → ${edge.to}`),
    newDefinition.edges.map((edge) => `${edge.from} · ${edge.on} → ${edge.to}`));
  add('返工路径', oldDefinition.rework.map((edge) =>
    `${edge.from} · ${edge.on} → ${edge.to} / ${edge.maxCycles} 次`),
  newDefinition.rework.map((edge) =>
    `${edge.from} · ${edge.on} → ${edge.to} / ${edge.maxCycles} 次`));
  add('未匹配路由', oldDefinition.onUnmatched, newDefinition.onUnmatched);
  add('最终验收', oldDefinition.finalAcceptance, newDefinition.finalAcceptance);
  return changes;
}
