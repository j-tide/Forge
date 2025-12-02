<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'subtle' | 'elevated' | 'floating' | 'solid-fallback';
  radius?: 'md' | 'lg' | 'xl';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
}>(), { variant: 'default', radius: 'xl', padding: 'md', interactive: false, selected: false });
</script>

<template>
  <component :is="interactive ? 'button' : 'div'" class="forge-glass" :type="interactive ? 'button' : undefined" :aria-pressed="interactive ? selected : undefined" :class="[`forge-glass--${variant}`, `forge-glass--radius-${radius}`, `forge-glass--padding-${padding}`, { 'is-interactive': interactive, 'is-selected': selected }]">
    <slot />
  </component>
</template>
