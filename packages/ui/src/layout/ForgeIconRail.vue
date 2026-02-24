<script setup lang="ts">
defineProps<{ items: { id: string; label: string; icon: string; disabled?: boolean }[]; selected: string }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>
<template>
  <nav class="forge-icon-rail" aria-label="主导航">
    <button class="forge-brand-mark" type="button" aria-label="Forge 首页" title="Forge 首页" @click="emit('select', 'home')"><span aria-hidden="true">F</span></button>
    <div class="forge-rail-links">
      <button v-for="item in items" :key="item.id" type="button" class="forge-rail-link" :class="{ 'is-active': selected === item.id }" :aria-current="selected === item.id ? 'page' : undefined" :aria-label="item.label" :title="item.label" :disabled="item.disabled" @click="emit('select', item.id)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="item.icon === 'home'"><path d="M3.5 11 12 4l8.5 7v8.5H3.5z" /><path d="M9 19.5v-6h6v6" /></template>
          <template v-else-if="item.icon === 'board'"><rect x="3.5" y="4.5" width="5" height="15" rx="1.3" /><rect x="10" y="4.5" width="5" height="10" rx="1.3" /><rect x="16.5" y="4.5" width="4" height="15" rx="1.3" /></template>
          <template v-else-if="item.icon === 'workflow'"><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6.5 8l4.5 8m6.5-8-4.5 8" /></template>
          <template v-else-if="item.icon === 'agents'"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.3-3 2.3-5 5.5-5s5.2 2 5.5 5" /><path d="M16 5.5a2.7 2.7 0 0 1 0 5.2M17 14c2 .3 3.1 2 3.5 5" /></template>
          <template v-else-if="item.icon === 'plugins'"><path d="M4 4.5h5.5a2.5 2.5 0 1 0 5 0H20v5.7a2.5 2.5 0 1 0 0 5v4.3h-5.5a2.5 2.5 0 1 0-5 0H4v-5.7a2.5 2.5 0 1 0 0-5z" /></template>
          <template v-else-if="item.icon === 'projects'"><path d="M3.5 7h6l2 2h9v10.5h-17z" /><path d="M3.5 7V4.5h7" /></template>
          <template v-else-if="item.icon === 'knowledge'"><path d="M4 4.5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z" /><path d="M20 4.5h-4a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h4z" /></template>
          <template v-else-if="item.icon === 'settings'"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></template>
        </svg>
      </button>
    </div>
  </nav>
</template>
