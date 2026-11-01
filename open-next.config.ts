import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Account and training routes opt out of caching. The custom Worker entry
// supplies SMTP and the WorkspaceDO binding without a shared database pool.
export default defineCloudflareConfig()
