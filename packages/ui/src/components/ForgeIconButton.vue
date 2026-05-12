<script setup lang="ts">
withDefaults(defineProps<{ label: string; tooltip?: string; disabled?: boolean; selected?: boolean }>(), {
  disabled: false, selected: false,
});
</script>

<template>
  <button class="forge-icon-button" type="button" :aria-label="label" :title="tooltip ?? label" :disabled="disabled" :aria-pressed="selected" :class="{ 'is-selected': selected }">
    <slot />
  </button>
</template>
