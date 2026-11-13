// The `next` package is not installed: vinext's fallback types (tsconfig
// `vinext/types`) supply `next` and `next/*`. They also declare an ambient
// "@next/env" module without `loadEnvConfig`, which hides the real package's
// types. This merges the one export scripts/migrate.ts uses back in; it
// matches @next/env 16's own declaration.
declare module '@next/env' {
  export function loadEnvConfig(
    dir: string,
    dev?: boolean,
  ): {
    combinedEnv: Record<string, string | undefined>
    parsedEnv: Record<string, string | undefined> | undefined
    loadedEnvFiles: Array<{
      path: string
      contents: string
      env: Record<string, string | undefined>
    }>
  }
}
