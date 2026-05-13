<script setup lang="ts">
import { ref } from 'vue';
import {
  GlassSurface, ForgeButton, ForgeIconButton, ForgeInput, ForgeTextarea, ForgeSelect,
  StatusTag, ForgeBadge, ForgeCard, ForgeTabs, ForgeTooltip, ForgePopover,
  ForgeDialog, ForgeDrawer, ForgeToast, ForgeEmptyState, ForgeSpinner, ForgeSkeleton,
} from '@forge/ui';
const input = ref('');
const textarea = ref('');
const choice = ref('one');
const tab = ref('overview');
const dialogOpen = ref(false);
const drawerOpen = ref(false);
const popoverOpen = ref(false);
const toastVisible = ref(false);
</script>

<template>
  <section class="ui-showcase" aria-labelledby="showcase-title">
    <p class="eyebrow">FORGE / DESIGN SYSTEM</p>
    <h1 id="showcase-title">UI Showcase</h1>
    <p class="utility-intro">开发环境专用的组件检视页。以下状态仅演示组件样式，不代表产品任务或 Agent 运行。</p>
    <div class="showcase-grid">
      <div class="showcase-column">
      <GlassSurface variant="elevated"><h2>Actions</h2><div class="showcase-row"><ForgeButton variant="primary" @click="toastVisible = true">Primary</ForgeButton><ForgeButton variant="secondary">Secondary</ForgeButton><ForgeButton variant="ghost">Ghost</ForgeButton><ForgeButton variant="danger">Danger</ForgeButton><ForgeButton disabled>Disabled</ForgeButton><ForgeButton loading>Loading</ForgeButton></div></GlassSurface>
      <GlassSurface variant="subtle"><h2>States</h2><div class="showcase-row"><StatusTag label="未连接" /><StatusTag label="信息" tone="info" /><StatusTag label="活动中" tone="active" /><StatusTag label="成功" tone="success" /><StatusTag label="注意" tone="warning" /><StatusTag label="失败" tone="danger" /><ForgeBadge>Badge</ForgeBadge></div><div class="showcase-row"><ForgeTooltip text="Accessible tooltip"><ForgeIconButton label="示例图标" tooltip="示例图标">◇</ForgeIconButton></ForgeTooltip><ForgePopover v-model:open="popoverOpen" label="Popover example"><template #trigger>Open popover</template><p>组件样式与键盘关闭示例。</p></ForgePopover></div></GlassSurface>
      <GlassSurface><h2>Overlays</h2><div class="showcase-row"><ForgeButton @click="dialogOpen = true">Open dialog</ForgeButton><ForgeButton @click="drawerOpen = true">Open drawer</ForgeButton></div><ForgeEmptyState title="Nothing here yet" description="空状态只说明当前没有数据。" /></GlassSurface>
      </div>
      <div class="showcase-column">
      <GlassSurface><h2>Fields</h2><ForgeInput v-model="input" label="Project name" description="输入只留在这个演示页。" placeholder="例如：Forge 组件" clearable /><ForgeInput v-model="input" label="Validation example" error="这里显示字段错误。" /><ForgeTextarea v-model="textarea" label="Description" placeholder="写下组件使用情境…" /><ForgeSelect v-model="choice" label="Native keyboard select" :options="[{ value: 'one', label: '第一项' }, { value: 'two', label: '第二项' }]" /></GlassSurface>
      <GlassSurface variant="elevated"><h2>Containers</h2><div class="showcase-row"><ForgeCard class="showcase-card">Default card</ForgeCard><ForgeCard variant="selected" class="showcase-card">Selected card</ForgeCard></div><ForgeTabs v-model="tab" label="Showcase tabs" :tabs="[{ id: 'overview', label: 'Overview' }, { id: 'details', label: 'Details' }, { id: 'disabled', label: 'Disabled', disabled: true }]"><p>{{ tab === 'overview' ? 'Overview panel' : 'Details panel' }}</p></ForgeTabs></GlassSurface>
      <GlassSurface variant="solid-fallback"><h2>Loading & fallback</h2><div class="showcase-row"><ForgeSpinner label="加载中" /><ForgeSkeleton class="showcase-skeleton" /></div><p>Reduced Transparency 会将玻璃材质切换为实色。</p></GlassSurface>
      </div>
    </div>
    <ForgeDialog v-model:open="dialogOpen" title="Dialog example"><p>使用 Tab 与 Shift+Tab 检查焦点约束；Escape 关闭并返回触发按钮。</p><ForgeButton @click="dialogOpen = false">Close dialog</ForgeButton></ForgeDialog>
    <ForgeDrawer v-model:open="drawerOpen" title="Drawer example"><p>这里仅演示右侧 Sheet，不包含任务详情业务。</p><ForgeButton @click="drawerOpen = false">Close drawer</ForgeButton></ForgeDrawer>
    <ForgeToast v-if="toastVisible" message="组件操作已触发。" />
  </section>
</template>
