# Reviewed SSR dependencies

`package.json` and `package-lock.json` describe the dependencies installed for the generated Firebase SSR function. They are reviewed source artifacts; application code still comes from Nuxt's `.output/server` build.

- Normal build: `npm run build`. The generated manifest must match this manifest. The build copies this lockfile and runs `npm ci --omit=dev` in `.output/server`.
- Intentional dependency update: update the root dependencies, then run `npm run ssr:refresh`. Review the manifest/lockfile diff and the audits before committing it.
- Before deployment: `node tools/assert-ssr-deps.mjs` checks runtime, entry point, exact versions and equality with these files. Firebase also invokes this check through its existing predeploy hook.
- Never resolve mismatches by hand-editing `.output/server` or by routinely refreshing the lockfile during deployment.

The lockfile pins the npm dependency tree, not Cloud Build's operating system or every byte of generated code. Root and API dependencies remain separately locked by their existing lockfiles.
