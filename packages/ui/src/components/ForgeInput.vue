<script setup lang="ts">
import { computed, useId } from 'vue';
const model = defineModel<string>({ required: true });
const props = withDefaults(defineProps<{ label: string; description?: string; error?: string; disabled?: boolean; placeholder?: string; clearable?: boolean; type?: 'text' | 'search' | 'email' | 'password' }>(), {
  disabled: false, clearable: false, type: 'text',
});
const id = useId();
const descriptionId = computed(() => props.error ? `${id}-error` : props.description ? `${id}-description` : undefined);
</script>

<template>
  <div class="forge-field">
    <label class="forge-field-label" :for="id">{{ label }}</label>
    <div class="forge-field-control">
      <span v-if="$slots.prefix" class="forge-field-affix"><slot name="prefix" /></span>
      <input :id="id" v-model="model" class="forge-text-input" :type="type" :placeholder="placeholder" :disabled="disabled" :aria-invalid="Boolean(error)" :aria-describedby="descriptionId" />
      <span v-if="$slots.suffix" class="forge-field-affix"><slot name="suffix" /></span>
      <button v-if="clearable && model && !disabled" class="forge-clear-button" type="button" :aria-label="`清除${label}`" @click="model = ''">×</button>
    </div>
    <p v-if="error" :id="descriptionId" class="forge-field-error" role="alert">{{ error }}</p>
    <p v-else-if="description" :id="descriptionId" class="forge-field-description">{{ description }}</p>
  </div>
</template>
