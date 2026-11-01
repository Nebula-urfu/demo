<script setup lang="ts">
import type { DevEvent } from '~/types'

const { api } = useApi()
const { logout } = useSession()
const events = ref<DevEvent[]>([])
const topic = ref('')
const state = ref<'loading' | 'ready' | 'error'>('loading')
const { busy, problem, run } = useAction()

async function load() {
  try {
    events.value = (await api<{ items: DevEvent[] }>('/dev/events', { query: { limit: 100, topic: topic.value || undefined } })).items
    state.value = 'ready'
  } catch {
    if (state.value === 'loading') state.value = 'error'
  }
}
onMounted(load)
watch(topic, load)
usePolling(load, () => true, 2000)

const text = (e: DevEvent) => {
  const p = e.payload
  if (e.topic === 'notifications') return `${p.to}: ${p.text}${p.urgent ? ' (срочно)' : ''}`
  return `${p.jobType} · задание ${String(p.jobId).slice(0, 8)}`
}
const reset = () =>
  run(async () => {
    if (!window.confirm('Сбросить демо? Все заявки и сессии будут удалены.')) return
    await api('/dev/reset', { method: 'POST' })
    logout()
    await navigateTo('/login')
  })
const topics = [
  { id: '', label: 'Все' },
  { id: 'ai.jobs', label: 'ai.jobs' },
  { id: 'ai.results', label: 'ai.results' },
  { id: 'notifications', label: 'notifications' },
]
</script>

<template>
  <div>
    <PageHeader title="Демо-панель" crumbs="Служебный экран" subtitle="Журнал событий: задания ИИ и уведомления. Обновляется раз в 2 секунды." />
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="scroll-x flex gap-2 flex-nowrap">
        <button
          v-for="t in topics"
          :key="t.id"
          type="button"
          class="rounded-full px-5 py-2 text-[15px] shrink-0 border"
          :class="topic === t.id ? 'bg-accent text-on-accent border-accent' : 'bg-transparent text-text border-text/70'"
          @click="topic = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <BaseButton variant="secondary" :loading="busy" full @click="reset">Сбросить демо</BaseButton>
    </div>
    <ProblemAlert :problem="problem" />
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем события." />
    <StateBox v-else-if="state === 'error'" kind="error" text="Не удалось загрузить события." />
    <StateBox v-else-if="!events.length" kind="empty" text="Событий пока нет." />
    <BaseCard v-else>
      <ul>
        <li v-for="e in events" :key="e.id" class="py-3 border-b border-border last:border-0 text-[14px]">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full px-2.5 py-0.5 text-[12px]" :class="e.topic === 'notifications' ? 'bg-accent-2-tint text-accent-2-ink' : 'bg-accent-tint text-accent-ink'">{{ e.topic }}</span>
            <span class="text-text-2">{{ e.type }}</span>
            <span v-if="e.requestId" class="text-text-2">заявка №{{ shortId(e.requestId) }}</span>
            <span class="text-text-2 ml-auto">{{ formatDate(e.ts) }}</span>
          </div>
          <p class="mt-1 break-words">{{ text(e) }}</p>
        </li>
      </ul>
    </BaseCard>
  </div>
</template>
