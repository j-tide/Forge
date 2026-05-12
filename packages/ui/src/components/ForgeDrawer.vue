<script setup lang="ts">
import { ref, useId } from 'vue';
import { useOverlayFocus } from '../composables/useOverlayFocus';
defineProps<{ title: string }>();
const open = defineModel<boolean>('open', { required: true });
const panel = ref<HTMLElement | null>(null);
const titleId = useId();
function close(): void { open.value = false; }
useOverlayFocus(open, panel, close);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="forge-overlay forge-overlay--drawer" @mousedown.self="close">
      <section ref="panel" class="forge-drawer" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
        <header class="forge-overlay-heading"><h2 :id="titleId">{{ title }}</h2><button type="button" aria-label="关闭抽屉" @click="close">×</button></header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
