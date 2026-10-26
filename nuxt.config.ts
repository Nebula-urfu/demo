import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  devServer: { host: '127.0.0.1', port: 80 },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: ["lk.ykit.ru"] },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'YKit (демо)',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  nitro: {
    // schema.sql is read at startup (server/plugins/00-db.ts) through server assets
    serverAssets: [{ baseName: 'db', dir: './server/db' }],
  },
})
