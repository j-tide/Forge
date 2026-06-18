<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SchemaFormDefinition } from '../schema-form';
import { buildPluginConfig } from '../schema-form';
import ForgeButton from './ForgeButton.vue';

const props = defineProps<{ schema: SchemaFormDefinition; disabled?: boolean; submitLabel?: string }>();
const emit = defineEmits<{ submit: [config: Record<string, string | number | boolean>] }>();
const values = ref<Record<string, string | number | boolean>>({});
const error = ref('');
const fields = computed(() => Object.entries(props.schema.properties));
watch(() => props.schema, () => { values.value = {}; error.value = ''; });
function update(key: string, value: string | boolean, kind: string): void {
  if (value === '' && kind !== 'boolean') { delete values.value[key]; return; }
  values.value[key] = kind === 'integer' || kind === 'number' ? Number(value) : value;
}
function submit(): void {
  try { emit('submit', buildPluginConfig(props.schema, values.value)); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid configuration'; }
}
</script>

<template>
  <form class="forge-schema-form" @submit.prevent="submit">
    <div v-for="[key, field] in fields" :key="key" class="forge-schema-field">
      <label :for="`forge-plugin-${key}`">{{ field.title ?? key }}<span v-if="schema.required.includes(key)"> *</span></label>
      <p v-if="field.description">{{ field.description }}</p>
      <p v-if="field.format === 'forge-credential-ref'">仅填写已保存凭据的引用。这里不会接收或显示密钥原文。</p>
      <input v-if="field.type === 'boolean'" :id="`forge-plugin-${key}`" type="checkbox" :checked="values[key] === true"
        :disabled="disabled" @change="update(key, ($event.target as HTMLInputElement).checked, field.type)" />
      <input v-else :id="`forge-plugin-${key}`" :type="field.format === 'forge-credential-ref' ? 'password' : field.type === 'integer' || field.type === 'number' ? 'number' : 'text'"
        :step="field.type === 'integer' ? '1' : field.type === 'number' ? 'any' : undefined"
        :autocomplete="field.format === 'forge-credential-ref' ? 'off' : undefined"
        :value="values[key] ?? ''" :disabled="disabled"
        @input="update(key, ($event.target as HTMLInputElement).value, field.type)" />
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <ForgeButton v-if="fields.length" type="submit" variant="primary" :disabled="disabled">{{ submitLabel ?? '检查配置' }}</ForgeButton>
  </form>
</template>

<style scoped>
.forge-schema-form { display: grid; gap: var(--forge-space-16); min-width: 0; }
.forge-schema-field { display: grid; gap: var(--forge-space-6); min-width: 0; }
.forge-schema-field label { font-weight: 650; overflow-wrap: anywhere; }
.forge-schema-field p { margin: 0; color: var(--forge-color-text-secondary); overflow-wrap: anywhere; }
.forge-schema-field input:not([type='checkbox']) { width: 100%; min-width: 0; padding: var(--forge-space-12); border: var(--forge-border-highlight); border-radius: var(--forge-radius-md); background: var(--forge-surface-reading); color: var(--forge-color-text); }
.forge-schema-field input:focus-visible { outline: 2px solid var(--forge-color-accent); outline-offset: 2px; }
.forge-schema-form [role='alert'] { color: var(--forge-color-danger); overflow-wrap: anywhere; }
</style>
