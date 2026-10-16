import { retiredEmailLinkRedirect } from '@/utils/retiredEmailLink'

// Old client email-action URLs no longer sign in or consume Firebase codes.
// Replace the URL with an ordinary OTP entry and discard the legacy query.
export default defineNuxtRouteMiddleware((to) => {
  const target = retiredEmailLinkRedirect(to.path, to.query, useRuntimeConfig().public.siteUrl)
  // Prerendered Hosting pages need a clean document load so login gets its own
  // robots/canonical metadata instead of inheriting the public page payload.
  if (target) return navigateTo(target, { redirectCode: 302, replace: true, external: import.meta.client })
})
