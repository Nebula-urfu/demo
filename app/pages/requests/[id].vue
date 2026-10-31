<script setup lang="ts">
definePageMeta({ roles: ['RESIDENT', 'STAFF'] })
const { profile } = useSession()
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <RequestResident v-if="profile?.role === 'RESIDENT'" :id="id" />
  <StaffWorkspace v-else :id="id" />
</template>
