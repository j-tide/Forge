<script setup lang="ts">
import { ref, useId } from 'vue';
import { useOverlayFocus } from '../composables/useOverlayFocus';
const props = withDefaults(defineProps<{ title: string; closeOnOverlay?: boolean; initialFocus?: string }>(), { closeOnOverlay: true });
const open = defineModel<boolean>('open', { required: true });
const panel = ref<HTMLElement | null>(null);
const titleId = useId();
function close(): void { open.value = false; }
function overlayClick(): void { if (props.closeOnOverlay) close(); }
useOverlayFocus(open, panel, close, props.initialFocus);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="forge-overlay" @mousedown.self="overlayClick">
      <section ref="panel" class="forge-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
        <header class="forge-overlay-heading"><h2 :id="titleId">{{ title }}</h2><button type="button" aria-label="关闭对话框" @click="close">×</button></header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
