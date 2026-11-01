# Realtime validation

Run `npm run test:realtime` (or `node --test scripts/test-realtime.mjs`) to exercise the actual `WorkspaceDO` implementation in local workerd with SQLite Durable Object storage and a real WebSocket client. This test complements `npm test`, whose realtime tests cover origin checks, signed-cookie verification, user-derived routing, connection limits, and hibernation-safe identity state.

Requirements are the repository's supported Node version, the pinned `miniflare` and `esbuild` development dependencies, `ws`, and permission to spawn workerd and bind loopback sockets. In the managed cloud environment, use the supported execution approval path if socket restrictions require it. No Neon, Google, SMTP, or Cloudflare deployment credentials are used. No deployment or outgoing email occurs.

The test verifies a real HTTP WebSocket upgrade, delivery of revision-only messages, account isolation, rejection of client broadcasts, and execution of a durable alarm that removes an expired server connection. A test-only Worker supplies a synthetic account identity; this runtime test does not claim to validate a real user's database session or Google OAuth flow.

Each run uses a new temporary directory. Teardown terminates the test clients, disposes Miniflare/workerd, and removes the run's storage, including when assertions fail. Metadata fetching, telemetry, and the development registry are disabled. The listener binds only to `127.0.0.1`.

Current Miniflare can retain a client-side socket after an alarm closes and detaches the Durable Object's server socket. The test checks the real alarm and actual server connection state rather than relying on that proxy's peer-close event. The application additionally reconnects its realtime client after 55 seconds, before the server's 60-second maximum lifetime, and retains authenticated HTTP synchronization as a fallback.
