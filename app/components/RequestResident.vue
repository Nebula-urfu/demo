<script setup lang="ts">
import type { RequestDetail } from '~/types'

const props = defineProps<{ id: string }>()
const { api } = useApi()
const route = useRoute()
const req = ref<RequestDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')

async function load() {
  try {
    req.value = await api<RequestDetail>(`/requests/${props.id}`)
    state.value = 'ready'
  } catch {
    if (state.value === 'loading') state.value = 'error'
  }
}
onMounted(load)
usePolling(load, () => state.value === 'ready', 3000)

// the resident sees only RequestStatus: three items of the progress derived from it
const progress = computed(() => {
  const s = req.value?.status
  const rank = s === 'COMPLETED' ? 2 : s === 'IN_PROGRESS' ? 1 : 0
  const mark = (i: number) => (i < rank || (rank === 2 && i === 2) ? 'Готово' : i === rank ? 'Сейчас' : 'Позже')
  return [
    { title: 'Заявка принята', text: req.value ? formatDate(req.value.createdAt) : '', badge: mark(0) },
    { title: 'Заявка в работе', text: 'УК готовит закупку или подрядчик уже работает.', badge: mark(1) },
    { title: 'Заявка выполнена', text: '', badge: mark(2) },
  ]
})
const badgeCls = (b: string) => (b === 'Готово' ? 'bg-accent-2-tint text-accent-2-ink' : b === 'Сейчас' ? 'bg-accent-tint text-accent-ink' : 'bg-surface-2 text-text-2')
</script>

<template>
  <div>
    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем заявку." class="mt-8" />
    <StateBox v-else-if="state === 'error' || !req" kind="error" text="Не удалось загрузить заявку." class="mt-8" />
    <template v-else>
      <PageHeader :title="req.description.length > 70 ? `${req.description.slice(0, 70)}…` : req.description" :crumbs="`Мои заявки / №${shortId(req.id)}`">
        <div class="flex gap-2">
          <StatusBadge kind="request" :value="req.status" />
          <span class="rounded-full bg-surface-2 text-text-2 px-3 py-0.5 text-[12px]">№{{ shortId(req.id) }}</span>
        </div>
      </PageHeader>
      <p v-if="route.query.created" class="rounded-[16px] bg-accent-2-tint text-accent-2-ink px-4 py-3 mb-4" role="status">Заявка принята</p>
      <div class="grid gap-4 lg:grid-cols-2 items-start">
        <BaseCard title="Заявка">
          <PhotoGallery :photos="req.photos" class="mb-3 block" />
          <p>{{ req.description }}</p>
          <dl class="grid grid-cols-[100px_1fr] gap-y-2 mt-4 text-[15px]">
            <dt class="text-text-2">Адрес</dt><dd>{{ req.address }}, подъезд {{ req.entrance }}</dd>
            <dt class="text-text-2">Создана</dt><dd>{{ formatDate(req.createdAt) }}</dd>
          </dl>
        </BaseCard>
        <BaseCard title="Ход заявки">
          <ul>
            <li v-for="(p, i) in progress" :key="i" class="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
              <div>
                <p>{{ p.title }}</p>
                <p v-if="p.text" class="text-[14px] text-text-2">{{ p.text }}</p>
              </div>
              <span class="rounded-full px-3 py-0.5 text-[12px] shrink-0" :class="badgeCls(p.badge)">{{ p.badge }}</span>
            </li>
          </ul>
        </BaseCard>
      </div>
    </template>
  </div>
</template>
