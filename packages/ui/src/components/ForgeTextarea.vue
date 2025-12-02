<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
const model = defineModel<string>({ required: true });
const props = withDefaults(defineProps<{ label: string; description?: string; error?: string; disabled?: boolean; placeholder?: string; maxHeight?: number; rows?: number; visuallyHiddenLabel?: boolean }>(), {
  disabled: false, maxHeight: 240, rows: 4, visuallyHiddenLabel: false,
});
const id = useId();
const field = ref<HTMLTextAreaElement | null>(null);
const descriptionId = computed(() => props.error ? `${id}-error` : props.description ? `${id}-description` : undefined);
async function resize(): Promise<void> {
  await nextTick();
  if (!field.value) return;
  field.value.style.height = 'auto';
  field.value.style.height = `${Math.min(field.value.scrollHeight, props.maxHeight)}px`;
}
watch(model, () => { void resize(); });
onMounted(() => { void resize(); });
</script>

<template>
  <div class="forge-field">
    <label class="forge-field-label" :class="{ 'visually-hidden': visuallyHiddenLabel }" :for="id">{{ label }}</label>
    <textarea :id="id" ref="field" v-model="model" class="forge-textarea" :rows="rows" :placeholder="placeholder" :disabled="disabled" :aria-invalid="Boolean(error)" :aria-describedby="descriptionId" @input="resize" />
    <p v-if="error" :id="descriptionId" class="forge-field-error" role="alert">{{ error }}</p>
    <p v-else-if="description" :id="descriptionId" class="forge-field-description">{{ description }}</p>
  </div>
</template>
