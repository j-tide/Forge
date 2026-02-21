<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, VueFlow, type Edge, type Node,
  type NodeDragEvent, type NodeMouseEvent } from '@vue-flow/core';
import type { WorkflowCompile, WorkflowTemplate } from '@forge/contracts';
import { defaultCanvasLayout, validateCanvasLayout, type CanvasLayout } from '../workflow-canvas-document';
import '@vue-flow/core/dist/style.css';

const props = defineProps<{
  definition: WorkflowTemplate;
  layout: CanvasLayout;
  compiled: WorkflowCompile | null;
}>();
const emit = defineEmits<{
  'update:layout': [value: CanvasLayout];
  select: [nodeId: string];
}>();
const selectedId = defineModel<string>('selectedId', { default: '' });
const invalidNodes = computed(() => {
  const issues = props.compiled?.issues ?? [];
  const ids = new Set<string>();
  for (const issue of issues) {
    const match = /^nodes\[(\d+)\]/.exec(issue.path);
    if (match) {
      const node = props.definition.nodes[Number(match[1])];
      if (node) ids.add(node.id);
    } else if (issue.path.startsWith('edges[') || issue.path === 'edges' ||
               issue.path === 'workflow') {
      for (const node of props.definition.nodes) ids.add(node.id);
    }
  }
  return ids;
});
const positions = computed(() => {
  try { return validateCanvasLayout(props.definition, props.layout); }
  catch { return defaultCanvasLayout(props.definition); }
});
const nodes = computed<Node[]>(() => props.definition.nodes.map((node) => ({
  id: node.id, type: 'forge', position: positions.value.nodes.find((item) =>
    item.id === node.id) ?? { x: 0, y: 0 },
  data: { label: node.label, kind: node.kind, binding: node.binding,
    invalid: invalidNodes.value.has(node.id) },
  connectable: false, deletable: false,
  class: invalidNodes.value.has(node.id) ? 'forge-flow-invalid' : '',
})));
const edges = computed<Edge[]>(() => [
  ...props.definition.edges.map((edge, index) => ({
    id: `normal-${index}-${edge.from}-${edge.to}`, source: edge.from, target: edge.to,
    type: 'smoothstep', label: edge.on, updatable: false,
  })),
  ...props.definition.rework.map((edge, index) => ({
    id: `rework-${index}-${edge.from}-${edge.to}`, source: edge.from, target: edge.to,
    sourceHandle: 'rework-out', targetHandle: 'rework-in',
    type: 'smoothstep', label: `${edge.on} · 最多 ${edge.maxCycles}`,
    updatable: false, class: 'forge-flow-rework',
  })),
]);
function onDragStop(event: NodeDragEvent): void {
  const current = positions.value.nodes.map((item) => item.id === event.node.id
    ? { id: item.id, x: event.node.position.x, y: event.node.position.y } : item);
  emit('update:layout', validateCanvasLayout(props.definition, { nodes: current }));
}
function onNodeClick(event: NodeMouseEvent): void {
  selectedId.value = event.node.id;
  emit('select', event.node.id);
}
</script>

<template>
  <div class="workflow-canvas" role="region" aria-label="Workflow 画布">
    <VueFlow :nodes="nodes" :edges="edges" :nodes-connectable="false"
      :edges-updatable="false" :delete-key-code="null" fit-view-on-init
      @node-drag-stop="onDragStop" @node-click="onNodeClick">
      <template #node-forge="{ data }">
        <div class="forge-flow-node" :class="{ 'forge-flow-node--invalid': data.invalid }">
          <Handle type="target" :position="Position.Top" :connectable="false" />
          <Handle id="rework-in" type="target" :position="Position.Right" :connectable="false"
            class="forge-flow-rework-handle forge-flow-rework-in" />
          <span class="forge-flow-kind">{{ data.kind }}</span>
          <strong>{{ data.label }}</strong>
          <small>{{ data.binding }}</small>
          <Handle type="source" :position="Position.Bottom" :connectable="false" />
          <Handle id="rework-out" type="source" :position="Position.Right" :connectable="false"
            class="forge-flow-rework-handle forge-flow-rework-out" />
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-canvas { width: 100%; height: 560px; border: 1px solid var(--forge-color-line);
  border-radius: var(--forge-radius-lg); background: var(--forge-surface-reading); overflow: hidden; }
.forge-flow-node { display: grid; gap: var(--forge-space-4); width: 220px;
  padding: var(--forge-space-16); border: 1px solid var(--forge-color-line);
  border-radius: var(--forge-radius-lg); background: var(--forge-surface-reading);
  box-shadow: var(--forge-shadow-surface); color: var(--forge-color-text); }
.forge-flow-node--invalid { border-color: var(--forge-color-danger); }
.forge-flow-kind { color: var(--forge-color-text-secondary); font-size: 11px; text-transform: uppercase; }
.forge-flow-node small { color: var(--forge-color-text-secondary); overflow-wrap: anywhere; }
.forge-flow-rework-handle { opacity: 0; }
.forge-flow-rework-in { top: 38%; }
.forge-flow-rework-out { top: 62%; }
:deep(.forge-flow-rework .vue-flow__edge-path) { stroke-dasharray: 5 4; stroke: var(--forge-color-warning); }
:deep(.vue-flow__edge-path) { stroke: var(--forge-color-line); }
:deep(.vue-flow__edge-text) { fill: var(--forge-color-text-secondary); }
:deep(.vue-flow__background) { background: transparent; }
</style>
