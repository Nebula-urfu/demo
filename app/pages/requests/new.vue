<script setup lang="ts">
import type { RequestDetail } from '~/types'

definePageMeta({ roles: ['RESIDENT'] })
const { api, upload } = useApi()
const { profile } = useSession()
const { busy, problem, run } = useAction()

// one key per open form: a double click does not create two requests
const idempotencyKey = ref('')
onMounted(() => (idempotencyKey.value = crypto.randomUUID()))

const description = ref('')
const entrance = ref('')
const files = ref<File[]>([])
const touched = ref(false)
const MAX = 5 * 1024 * 1024
const tooBig = computed(() => files.value.find((f) => f.size > MAX))
// local previews of the chosen files
const urls = new WeakMap<File, string>()
const preview = (f: File) => {
  if (!urls.has(f)) urls.set(f, URL.createObjectURL(f))
  return urls.get(f)!
}
onBeforeUnmount(() => files.value.forEach((f) => urls.has(f) && URL.revokeObjectURL(urls.get(f)!)))

function pick(e: Event) {
  const input = e.target as HTMLInputElement
  files.value = [...files.value, ...Array.from(input.files ?? [])].slice(0, 5)
  input.value = '' // the same file can be chosen again
}
function drop(e: DragEvent) {
  files.value = [...files.value, ...Array.from(e.dataTransfer?.files ?? [])].slice(0, 5)
}

const errors = computed(() => ({
  photo: !files.value.length ? 'Добавьте хотя бы одно фото проблемы.' : tooBig.value ? `Файл «${tooBig.value.name}» больше 5 МБ.` : '',
  description: description.value.trim().length < 3 ? 'Опишите проблему, минимум 3 символа.' : '',
  entrance: !entrance.value.trim() ? 'Укажите подъезд.' : '',
}))
const valid = computed(() => !errors.value.photo && !errors.value.description && !errors.value.entrance)

async function submit() {
  touched.value = true
  if (!valid.value) return
  await run(async () => {
    // the photo content goes to the mock Documents (up to 5 MB each) so that it can be shown later
    const ids: string[] = []
    for (const f of files.value) ids.push((await upload(f)).fileId)
    const req = await api<RequestDetail>('/requests', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey.value },
      body: { description: description.value.trim(), entrance: entrance.value.trim(), photoFileIds: ids },
    })
    await navigateTo(`/requests/${req.id}?created=1`)
  })
}
</script>

<template>
  <div>
    <PageHeader title="Новая заявка" crumbs="Житель / Новая заявка" subtitle="Фото и пара слов. Остальное подготовит УК." />
    <form class="grid gap-4 lg:grid-cols-2 items-start" @submit.prevent="submit">
      <BaseCard title="Что случилось">
        <label class="block rounded-[20px] border-2 border-dashed border-accent bg-accent-tint text-center p-8 cursor-pointer" @dragover.prevent @drop.prevent="drop">
          <span class="block text-[28px] text-accent-ink leading-none">+</span>
          <span class="block text-accent-ink mt-1">Добавьте 1–5 фото</span>
          <span class="block text-[14px] text-text-2 mt-1">Перетащите файлы или нажмите, чтобы выбрать</span>
          <input type="file" accept="image/*" multiple class="sr-only" data-testid="photos" @change="pick" />
        </label>
        <ul v-if="files.length" class="flex gap-2 mt-3 scroll-x flex-nowrap" data-testid="previews">
          <li v-for="(f, i) in files" :key="i" class="shrink-0 relative w-[88px] h-[88px] rounded-[14px] overflow-hidden bg-surface-2">
            <img v-if="f.type.startsWith('image/')" :src="preview(f)" :alt="f.name" class="w-full h-full object-cover" />
            <span v-else class="block p-2 text-[11px] text-text-2 break-all">{{ f.name }}</span>
            <button type="button" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-text/70 text-on-accent text-[14px] leading-none" :aria-label="`Убрать ${f.name}`" @click="files.splice(i, 1)">×</button>
          </li>
        </ul>
        <p v-if="touched && errors.photo" class="text-danger-ink text-[14px] mt-2" role="alert">{{ errors.photo }}</p>
        <label class="field-label mt-5" for="description">Описание</label>
        <textarea id="description" v-model="description" class="field min-h-[90px]" maxlength="2000" placeholder="Например: течёт крыша над пятым этажом" />
        <p v-if="touched && errors.description" class="text-danger-ink text-[14px] mt-1" role="alert">{{ errors.description }}</p>
      </BaseCard>
      <BaseCard title="Где">
        <label class="field-label" for="address">Адрес</label>
        <input id="address" class="field bg-bg" :value="profile?.address" readonly />
        <label class="field-label mt-4" for="entrance">Подъезд</label>
        <input id="entrance" v-model="entrance" class="field" maxlength="20" placeholder="Например: 2" />
        <p v-if="touched && errors.entrance" class="text-danger-ink text-[14px] mt-1" role="alert">{{ errors.entrance }}</p>
        <p class="rounded-[16px] bg-accent-tint px-4 py-3 text-[14px] mt-5">Фото помогают УК точнее определить объём работ и быстрее начать ремонт.</p>
      </BaseCard>
      <div class="lg:col-span-2">
        <ProblemAlert :problem="problem" />
        <BaseButton type="submit" :loading="busy" full>Отправить заявку</BaseButton>
      </div>
    </form>
  </div>
</template>
