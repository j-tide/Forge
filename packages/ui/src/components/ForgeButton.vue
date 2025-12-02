<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), { variant: 'secondary', size: 'md', disabled: false, loading: false, type: 'button' });
</script>

<template>
  <button class="forge-button" :class="[`forge-button--${variant}`, `forge-button--${size}`]" :type="type" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="forge-spinner forge-spinner--button" aria-hidden="true" />
    <slot />
  </button>
</template>
