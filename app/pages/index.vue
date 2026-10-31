<script setup lang="ts">
const { homePath, isLoggedIn } = useSession()
await navigateTo(isLoggedIn.value ? homePath.value : '/login', { replace: true })
</script>

<template><div /></template>
