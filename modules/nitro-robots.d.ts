// Local type augmentation for Nuxt config typing.
//
// Why this exists:
// - `@nuxtjs/robots` generates a Nitro route rules augmentation (adds `routeRules.robots`)
// - Nuxt's `tsconfig.node` (used to typecheck `nuxt.config.ts`) doesn't always reference
//   the generated template, which can surface a TS error in `nuxt.config.ts`.
//
// Keeping this file in `modules/` ensures it is included by `.nuxt/tsconfig.node.json`.
import type { RobotsValue } from '../node_modules/@nuxtjs/robots/dist/runtime/types'

declare module 'nitropack/types' {
  interface NitroRouteRules {
    robots?: RobotsValue | { indexable: boolean; rule: string }
  }

  interface NitroRouteConfig {
    robots?: RobotsValue | { indexable: boolean; rule: string }
  }
}

declare module 'nitropack' {
  interface NitroRouteRules {
    robots?: RobotsValue | { indexable: boolean; rule: string }
  }

  interface NitroRouteConfig {
    robots?: RobotsValue | { indexable: boolean; rule: string }
  }
}

export {}

