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

  Write-Host 'Installing production dependencies for Nuxt SSR function...'
  Push-Location '.output/server'
  try {
    npm install --omit=dev
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  finally {
    Pop-Location
  }

  $env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
  Write-Host "Using FUNCTIONS_DISCOVERY_TIMEOUT=$env:FUNCTIONS_DISCOVERY_TIMEOUT seconds..."
  Write-Host 'Deploying to Firebase production...'
  firebase deploy --only 'firestore,storage,functions,hosting' --project majstorsada-b2ad4
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
