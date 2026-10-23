/**
 * Minimal ambient types for the Node built-ins used by the e2e specs.
 *
 * The app `tsconfig.json` only includes `src`, so Playwright specs are not
 * type-checked by `npm run build`. This file keeps the specs self-describing
 * for editors and any future e2e-only typecheck without adding `@types/node`
 * to the frontend dependencies.
 */
declare module 'node:fs/promises' {
  export function writeFile(path: string, data: string): Promise<void>
  export function unlink(path: string): Promise<void>
}
