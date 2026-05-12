<script setup lang="ts">
withDefaults(defineProps<{ message: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' });
</script>
<template><div class="forge-toast" :class="`forge-toast--${tone}`" role="status" aria-live="polite">{{ message }}</div></template>
