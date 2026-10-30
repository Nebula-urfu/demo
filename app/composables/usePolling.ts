/** Calls `fn` every `ms` while `active()` is true (used while a step is in PROCESSING). */
export function usePolling(fn: () => Promise<unknown> | unknown, active: () => boolean, ms = 1000) {
  let timer: ReturnType<typeof setInterval> | null = null
  let busy = false
  onMounted(() => {
    timer = setInterval(async () => {
      if (busy || !active()) return
      busy = true
      try {
        await fn()
      } finally {
        busy = false
      }
    }, ms)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })
}
