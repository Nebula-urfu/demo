import { getGateways } from '../gateway'

/** Handler for the ai_jobs table (mock of the ai.jobs queue): polls every 200 ms. */
export default defineNitroPlugin((nitroApp) => {
  const timer = setInterval(() => {
    try {
      getGateways().ai.runDue()
    } catch (e) {
      console.error('[ai-worker]', e)
    }
  }, 200)
  timer.unref?.()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
