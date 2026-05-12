<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
defineProps<{ label: string; triggerClass?: string; panelClass?: string; panelId?: string; state?: string }>();
const open = defineModel<boolean>('open', { default: false });
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
function onPointerDown(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) { open.value = false; trigger.value?.focus(); }
}
watch(open, (value) => {
  if (value) { document.addEventListener('pointerdown', onPointerDown); document.addEventListener('keydown', onKeyDown); }
  else {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
    if (root.value?.contains(document.activeElement)) trigger.value?.focus();
  }
});
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); });
</script>

<template>
  <div ref="root" class="forge-popover-root">
    <button ref="trigger" class="forge-popover-trigger" :class="triggerClass" type="button" :data-state="state" :aria-expanded="open" :aria-controls="panelId" aria-haspopup="dialog" @click="open = !open"><slot name="trigger" /></button>
    <div v-if="open" :id="panelId" class="forge-popover-panel" :class="panelClass" role="dialog" :aria-label="label"><slot /></div>
  </div>
</template>
