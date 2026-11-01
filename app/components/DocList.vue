<script setup lang="ts">
import type { DocumentRef } from '~/types'

defineProps<{ docs: DocumentRef[] }>()
const { download } = useApi()
const { busy, problem, run } = useAction()
const get = (d: DocumentRef) => d.fileId && run(() => download(d.fileId!, d.name))
</script>

<template>
  <ul>
    <li v-for="d in docs" :key="d.kind + d.name" class="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
      <span class="min-w-0 break-words">{{ d.name }}<span v-if="d.version" class="text-[12px] text-text-2 ml-2">версия {{ d.version }}</span></span>
      <button
        type="button"
        class="rounded-full border border-border px-4 py-1.5 text-[14px] shrink-0 text-accent-ink"
        :disabled="busy || !d.fileId"
        :aria-label="`Скачать ${d.name}`"
        @click="get(d)"
      >
        Скачать
      </button>
    </li>
    <li v-if="problem" class="text-danger-ink text-[14px] pt-2" role="alert">{{ problem.text }}</li>
  </ul>
</template>
