$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..')

Push-Location $ProjectRoot
try {
  # Same rule the Nuxt config and the functions generator apply independently: no commit, no build.
  # Printed up front so it can be compared against the three post-deploy probes.
  $BuildSha = git rev-parse --short HEAD
  if ($LASTEXITCODE -ne 0) {
    Write-Error 'Cannot resolve the Git commit. A build that cannot identify itself must not be deployed.' -ErrorAction Continue
    exit 1
  }
  if (git status --porcelain) {
    $BuildSha = "$BuildSha-dirty"
  }
  Write-Host "Deploying build: $BuildSha"

  Write-Host 'Compiling Cloud Functions...'
  npm --prefix functions run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  Write-Host 'Building Nuxt app...'
  npm run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $requiredArtifacts = @(
    'functions/lib/index.js',
    '.output/public',
    '.output/server',
    '.output/server/index.mjs',
    '.output/server/package.json'
  )

  foreach ($artifact in $requiredArtifacts) {
    if (!(Test-Path $artifact)) {
      Write-Error "Missing build artifact: $artifact" -ErrorAction Continue
      exit 1
    }
  }

  # npm run build already installed the reviewed SSR lockfile with npm ci.
  node tools/assert-ssr-deps.mjs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  $ssrRuntime = node -p "require('./.output/server/package-lock.json').packages['node_modules/firebase-functions'].version"
  Write-Host "SSR runtime: firebase-functions@$ssrRuntime"

  $env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
  # Use file-based discovery with the pinned Windows CLI/SDK, as the emulator tests do.
  $env:FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH = 'true'
  Write-Host "Using FUNCTIONS_DISCOVERY_TIMEOUT=$env:FUNCTIONS_DISCOVERY_TIMEOUT seconds..."
  Write-Host 'Deploying to Firebase production...'
  node node_modules/firebase-tools/lib/bin/firebase.js deploy --only 'firestore,storage,functions,hosting' --project majstorsada-b2ad4
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
