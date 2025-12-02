<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'interactive' | 'selected'; tone?: 'panel' | 'reading' }>(), { variant: 'default', tone: 'panel' });
</script>
<template><component :is="variant === 'interactive' ? 'button' : 'div'" class="forge-card" :type="variant === 'interactive' ? 'button' : undefined" :class="[`forge-card--${variant}`, `forge-card--${tone}`]"><slot /></component></template>
