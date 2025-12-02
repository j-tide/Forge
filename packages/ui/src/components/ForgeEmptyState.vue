<script setup lang="ts">
defineProps<{ title: string; description: string }>();
</script>
<template><div class="forge-empty-state" role="status"><div class="forge-empty-state-symbol" aria-hidden="true"><span /><span /><span /></div><h3>{{ title }}</h3><p>{{ description }}</p><slot /></div></template>
