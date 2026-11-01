export function isWorkerRuntime() {
  return globalThis.navigator?.userAgent === 'Cloudflare-Workers'
}
