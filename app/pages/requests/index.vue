<script setup lang="ts">
import type { Page, RequestSummary } from '~/types'

definePageMeta({ roles: ['RESIDENT', 'STAFF'] })
const { api } = useApi()
const { profile } = useSession()
const items = ref<RequestSummary[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const filter = ref('all')
const isStaff = computed(() => profile.value?.role === 'STAFF')

async function load() {
  try {
    items.value = (await api<Page<RequestSummary>>('/requests', { query: { limit: 100 } })).items
    state.value = 'ready'
  } catch {
    if (state.value === 'loading') state.value = 'error'
  }
}
onMounted(load)
usePolling(load, () => state.value === 'ready', 2000)

const filters = computed(() =>
  isStaff.value
    ? [
        { id: 'all', label: 'Все' },
        { id: 'urgent', label: 'Срочные' },
        { id: 'new', label: 'Новые' },
        { id: 'review', label: 'На проверке' },
      ]
    : [
        { id: 'all', label: 'Все' },
        { id: 'work', label: 'В работе' },
        { id: 'closed', label: 'Закрытые' },
      ],
)

const shown = computed(() =>
  items.value.filter((r) => {
    switch (filter.value) {
      case 'urgent': return r.urgency === 'EMERGENCY'
      case 'new': return r.status === 'ACCEPTED'
      case 'review': return r.currentStepState === 'IN_REVIEW'
      case 'work': return r.status !== 'COMPLETED'
      case 'closed': return r.status === 'COMPLETED'
      default: return true
    }
  }),
)

const urgent = computed(() => items.value.filter((r) => r.urgency === 'EMERGENCY'))
const inReview = computed(() => items.value.filter((r) => r.currentStepState === 'IN_REVIEW'))
const first = computed(() => urgent.value[0])
const tiles = computed(() => [
  { n: items.value.length, tag: 'всего', text: 'Заявки организации' },
  { n: urgent.value.length, tag: 'срочные', text: 'Требуют реакции сегодня' },
  { n: inReview.value.length, tag: 'на проверке', text: 'Ждут решения проверяющего' },
])
const cut = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s)
const tone = (s: string) => (s === 'COMPLETED' ? 'bg-accent-2-tint' : s === 'IN_PROGRESS' ? 'bg-accent-tint' : 'bg-surface border border-border')
</script>

<template>
  <div>
    <PageHeader :title="isStaff ? 'Входящие заявки' : 'Мои заявки'" :crumbs="isStaff ? 'Сотрудник УК / Входящие' : 'Житель / Мои заявки'" />

    <template v-if="isStaff && state === 'ready'">
      <YBanner
        :eyebrow="`Здравствуйте, ${profile?.displayName}`"
        :title="urgent.length ? `${urgent.length} ${plural(urgent.length, 'срочная заявка ждёт', 'срочные заявки ждут', 'срочных заявок ждут')} решения` : 'Срочных заявок нет'"
        :text="first ? `${cut(first.description, 90)} · ${first.address}` : 'Новые заявки появятся в списке ниже.'"
      >
        <BaseButton v-if="urgent.length" variant="secondary" @click="filter = 'urgent'">Открыть срочные</BaseButton>
      </YBanner>
      <div class="grid gap-4 md:grid-cols-3 mt-4">
        <BaseCard v-for="t in tiles" :key="t.tag">
          <p class="flex items-start gap-2"><span class="font-display text-[44px] font-semibold leading-none">{{ t.n }}</span><span class="text-[12px] text-text-2">[{{ t.tag }}]</span></p>
          <p class="text-text-2 mt-3">{{ t.text }}</p>
        </BaseCard>
      </div>
    </template>

    <div class="flex flex-wrap items-center justify-between gap-3 mt-6 mb-4">
      <div class="scroll-x flex gap-2 flex-nowrap">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="rounded-full px-5 py-2 text-[15px] shrink-0 border"
          :class="filter === f.id ? 'bg-accent text-on-accent border-accent' : 'bg-transparent text-text border-text/70'"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <BaseButton v-if="!isStaff" to="/requests/new" full>Подать заявку</BaseButton>
    </div>

    <StateBox v-if="state === 'loading'" kind="loading" text="Загружаем заявки." />
    <StateBox v-else-if="state === 'error'" kind="error" text="Не удалось загрузить заявки.">
      <button class="underline ml-2" @click="load">Повторить</button>
    </StateBox>
    <StateBox v-else-if="!shown.length" kind="empty" :text="isStaff ? 'Новых заявок нет.' : 'У вас пока нет заявок. Сообщите о проблеме, если что-то сломалось.'" />

    <template v-else-if="isStaff">
      <div class="hidden md:block bg-surface border border-border rounded-card overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-surface-2 text-[12px] text-text-2">
            <tr><th class="px-6 py-3 font-normal">№</th><th class="font-normal">Проблема</th><th class="font-normal">Адрес</th><th class="font-normal">Срочность</th><th class="font-normal">Шаг</th><th class="font-normal">Время</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.id" class="border-t border-border hover:bg-bg cursor-pointer" @click="navigateTo(`/requests/${r.id}`)">
              <td class="px-6 py-4"><NuxtLink :to="`/requests/${r.id}`" class="hover:underline">{{ shortId(r.id) }}</NuxtLink></td>
              <td class="pr-4">{{ cut(r.description, 50) }}</td>
              <td class="pr-4">{{ r.address }}, подъезд {{ r.entrance }}</td>
              <td><StatusBadge kind="urgency" :value="r.urgency ?? 'PLANNED'" /></td>
              <td class="space-x-1">
                <span v-if="r.currentStep" class="inline-block rounded-full bg-accent-tint text-accent-ink px-3 py-0.5 text-[12px]">{{ STEP_LABEL[r.currentStep] }}</span>
                <StatusBadge v-if="r.currentStepState" kind="step" :value="r.currentStepState" />
                <StatusBadge v-else kind="request" :value="r.status" />
              </td>
              <td class="text-[14px] text-text-2 pr-4">{{ formatDate(r.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="md:hidden space-y-3">
        <NuxtLink v-for="r in shown" :key="r.id" :to="`/requests/${r.id}`" class="block bg-surface border border-border rounded-card p-4">
          <div class="flex items-center justify-between gap-2"><span class="text-[12px] text-text-2">№{{ shortId(r.id) }}</span><StatusBadge kind="urgency" :value="r.urgency ?? 'PLANNED'" /></div>
          <p class="mt-1">{{ cut(r.description, 70) }}</p>
          <p class="text-[14px] text-text-2">{{ r.address }}, подъезд {{ r.entrance }}</p>
          <p class="mt-2 space-x-1">
            <span v-if="r.currentStep" class="inline-block rounded-full bg-accent-tint text-accent-ink px-3 py-0.5 text-[12px]">{{ STEP_LABEL[r.currentStep] }}</span>
            <StatusBadge v-if="r.currentStepState" kind="step" :value="r.currentStepState" />
          </p>
        </NuxtLink>
      </div>
    </template>

    <div v-else class="space-y-3">
      <NuxtLink v-for="r in shown" :key="r.id" :to="`/requests/${r.id}`" class="flex gap-4 items-center rounded-card p-3.5" :class="tone(r.status)">
        <div class="w-[88px] h-[64px] md:w-[120px] md:h-[84px] rounded-[16px] overflow-hidden bg-surface-2 shrink-0">
          <AuthImage v-if="r.photoId" :file-id="r.photoId" alt="Фото заявки" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <p class="text-[17px] break-words">{{ cut(r.description) }}</p>
            <StatusBadge kind="request" :value="r.status" />
          </div>
          <p class="text-text-2 text-[14px]">№{{ shortId(r.id) }} · {{ r.address }}, подъезд {{ r.entrance }}</p>
          <p class="text-[14px] mt-1">Подана {{ formatDate(r.createdAt) }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
