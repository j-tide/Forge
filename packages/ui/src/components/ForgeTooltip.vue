<script setup lang="ts">
import { useId } from 'vue';
defineProps<{ text: string }>();
const id = useId();
</script>
<template><span class="forge-tooltip" :aria-describedby="id"><slot /><span :id="id" role="tooltip" class="forge-tooltip-text">{{ text }}</span></span></template>
