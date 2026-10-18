// Start: npm run server   (reads .env if present — see .env.example)
import { createMessagingServer } from './app.ts'
import { channelStatuses, loadConfig } from './config.ts'

const { config, problems } = loadConfig()
for (const p of problems) console.warn(`[config] ${p}`)

const { server } = createMessagingServer(config)
server.listen(config.port, config.host, () => {
  const live = channelStatuses(config).filter((c) => c.live)
  console.log(`Trip2Go messaging server on http://${config.host}:${config.port}`)
  console.log(live.length
    ? `Live channels: ${live.map((c) => `${c.companyId}/${c.channel}`).join(', ')}`
    : 'No live channels configured — the CRM will keep using simulated conversations. See docs/messaging.md.')
})
