<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '加载中' });
</script>
<template><div class="forge-skeleton" role="status" :aria-label="label"><span class="visually-hidden">{{ label }}</span></div></template>
