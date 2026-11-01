<script setup lang="ts">
const props = defineProps<{ fileId: string; alt: string }>()
const photoUrl = usePhotoUrl()
const src = ref<string | null>(null)
const failed = ref(false)

async function load() {
  src.value = null
  failed.value = false
  const u = await photoUrl(props.fileId)
  if (u) src.value = u
  else failed.value = true
}
onMounted(load)
watch(() => props.fileId, load)
</script>

<template>
  <img v-if="src" :src="src" :alt="alt" class="w-full h-full object-cover" loading="lazy" />
  <div v-else class="w-full h-full flex items-center justify-center text-[12px] text-text-2 bg-surface-2 p-2 text-center break-all" :class="{ 'animate-pulse': !failed }">
    {{ failed ? alt : '' }}
  </div>
</template>
