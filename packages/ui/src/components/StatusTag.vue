<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'info' | 'active' | 'success' | 'warning' | 'danger'; label: string; icon?: string }>(), { tone: 'neutral' });
</script>

<template>
  <span class="forge-status-tag" :class="`forge-status-tag--${tone}`"><span aria-hidden="true">{{ icon ?? '●' }}</span>{{ label }}</span>
</template>
