export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    setResponseHeader(event, 'X-Demo-Mode', 'true')
  })
  // Errors rendered by Nitro itself (404 etc.) get the header too.
  nitroApp.hooks.hook('beforeResponse', (event) => {
    setResponseHeader(event, 'X-Demo-Mode', 'true')
  })
})
