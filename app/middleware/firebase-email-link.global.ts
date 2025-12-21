// Redirect Firebase Auth email-action links (mode=signIn&oobCode=...) to our in-app handler.
// This makes the flow robust even if Firebase Console "Action URL" points to `/` on the branded domain.
export default defineNuxtRouteMiddleware((to) => {
  // Never interfere with Firebase reserved auth paths if they are ever hit.
  if (to.path.startsWith('/__/auth')) return

  const mode = to.query.mode
  const oobCode = to.query.oobCode

  // Email link sign-in entrypoint (Magic Link)
  if (mode === 'signIn' && typeof oobCode === 'string') {
    if (to.path !== '/finishLogin') {
      return navigateTo({ path: '/finishLogin', query: to.query }, { redirectCode: 302 })
    }
  }
})


