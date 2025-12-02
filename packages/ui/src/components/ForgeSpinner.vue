<script setup lang="ts">
defineProps<{ label: string }>();
</script>
<template><span class="forge-spinner-wrap" role="status"><span class="forge-spinner" aria-hidden="true" />{{ label }}</span></template>
