<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { homePath, isLoggedIn } = useSession()
const title = computed(() =>
  props.error.statusCode === 403 ? 'Недоступно для вашей роли' : props.error.statusCode === 404 ? 'Страница не найдена' : 'Что-то пошло не так',
)
const back = () => clearError({ redirect: isLoggedIn.value ? homePath.value : '/login' })
</script>

<template>
  <NuxtLayout :name="isLoggedIn ? 'default' : 'blank'">
    <div class="mt-16 text-center">
      <p class="font-display text-[56px] text-accent">{{ error.statusCode }}</p>
      <h1 class="text-[24px] font-semibold mt-2">{{ title }}</h1>
      <div class="mt-6 flex justify-center"><BaseButton @click="back">На главную</BaseButton></div>
    </div>
  </NuxtLayout>
</template>
