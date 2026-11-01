import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// The first release keeps workouts on the device. Add account-backed cache,
// database, and realtime bindings when the server integrations are introduced.
export default defineCloudflareConfig()
