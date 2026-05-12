<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
type Tab = { id: string; label: string; disabled?: boolean };
const model = defineModel<string>({ required: true });
const props = defineProps<{ tabs: Tab[]; label: string }>();
const id = useId();
const buttons = ref<HTMLButtonElement[]>([]);
async function selectByKey(event: KeyboardEvent, index: number): Promise<void> {
  const enabled = props.tabs.map((tab, i) => !tab.disabled ? i : -1).filter((i) => i >= 0);
  if (!enabled.length) return;
  let next: number | undefined;
  if (event.key === 'Home') next = enabled[0];
  if (event.key === 'End') next = enabled[enabled.length - 1];
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const current = enabled.indexOf(index);
    next = enabled[(current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
  }
  if (next === undefined) return;
  event.preventDefault();
  model.value = props.tabs[next]!.id;
  await nextTick();
  buttons.value[next]?.focus();
}
</script>

<template>
  <div class="forge-tabs">
    <div class="forge-tab-list" role="tablist" :aria-label="label">
      <button v-for="(tab, index) in tabs" :id="`${id}-tab-${tab.id}`" :key="tab.id" :ref="(element) => { if (element) buttons[index] = element as HTMLButtonElement; }" type="button" role="tab" :aria-selected="model === tab.id" :aria-controls="`${id}-panel-${tab.id}`" :tabindex="model === tab.id ? 0 : -1" :disabled="tab.disabled" @click="model = tab.id" @keydown="selectByKey($event, index)">{{ tab.label }}</button>
    </div>
    <div :id="`${id}-panel-${model}`" role="tabpanel" :aria-labelledby="`${id}-tab-${model}`" tabindex="0"><slot :selected="model" /></div>
  </div>
</template>
