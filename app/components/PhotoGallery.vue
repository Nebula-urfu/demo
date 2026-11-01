<script setup lang="ts">
import type { FileRef } from '~/types'

const props = defineProps<{ photos: FileRef[] }>()
const index = ref(0)
const current = computed(() => props.photos[Math.min(index.value, props.photos.length - 1)])
</script>

<template>
  <div v-if="photos.length" data-testid="gallery">
    <div class="rounded-[20px] overflow-hidden aspect-[4/3] bg-surface-2">
      <AuthImage v-if="current" :key="current.fileId" :file-id="current.fileId" :alt="current.name" />
    </div>
    <ul v-if="photos.length > 1" class="scroll-x flex gap-2 flex-nowrap mt-2">
      <li v-for="(p, i) in photos" :key="p.fileId" class="shrink-0">
        <button
          type="button"
          class="block w-16 h-16 rounded-[12px] overflow-hidden border-2"
          :class="i === index ? 'border-accent' : 'border-transparent'"
          :aria-label="`Фото ${i + 1}: ${p.name}`"
          @click="index = i"
        >
          <AuthImage :file-id="p.fileId" :alt="p.name" />
        </button>
      </li>
    </ul>
  </div>
</template>
