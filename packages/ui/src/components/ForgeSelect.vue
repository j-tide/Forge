<script setup lang="ts">
import { useId } from 'vue';
const model = defineModel<string>({ required: true });
withDefaults(defineProps<{ label: string; options: { value: string; label: string; disabled?: boolean }[]; disabled?: boolean }>(), { disabled: false });
const id = useId();
</script>

<template>
  <div class="forge-field">
    <label class="forge-field-label" :for="id">{{ label }}</label>
    <select :id="id" v-model="model" class="forge-select" :disabled="disabled">
      <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
    </select>
  </div>
</template>
