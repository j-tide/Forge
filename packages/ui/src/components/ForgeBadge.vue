<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' });
</script>
<template><span class="forge-badge" :class="`forge-badge--${tone}`"><slot /></span></template>
