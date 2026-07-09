$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..')

Push-Location $ProjectRoot
try {
  Write-Host 'Building Nuxt app...'
  npm run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $requiredArtifacts = @(
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
