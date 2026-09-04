[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)] [string] $SecretsFile,
  [string] $ResourceGroup = 'wppconnect-media-prod',
  [string] $Location = 'eastus2',
  [string] $Prefix = 'wppmedia',
  [string] $ImageTag = '',
  [int] $MinimumReplicas = 1,
  [int] $MaximumReplicas = 3
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..\..'))
$foundationTemplate = Join-Path $scriptRoot 'foundation.bicep'
$appTemplate = Join-Path $scriptRoot 'app.bicep'
$resolvedSecretsFile = [IO.Path]::GetFullPath($SecretsFile)

function Read-DotEnv([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Secrets file not found: $Path" }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([^=]+)=(.*)$') { continue }
    $values[$Matches[1].Trim()] = $Matches[2].Trim()
  }
  return $values
}

function Require-Secret([hashtable] $Values, [string] $Name, [int] $MinimumLength = 1) {
  $value = [string] $Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -lt $MinimumLength) {
    throw "$Name is required and must contain at least $MinimumLength characters"
  }
  return $value
}

$secrets = Read-DotEnv $resolvedSecretsFile
$databaseUrl = Require-Secret $secrets 'DATABASE_URL'
$storageKey = Require-Secret $secrets 'MEDIA_STORAGE_KEY' 40
$decodedStorageKey = [Convert]::FromBase64String($storageKey)
if ($decodedStorageKey.Length -ne 32) { throw 'MEDIA_STORAGE_KEY must decode to exactly 32 bytes' }
$resultSecret = Require-Secret $secrets 'MEDIA_RESULT_SIGNING_SECRET' 32
$webhookSecret = Require-Secret $secrets 'MEDIA_WEBHOOK_SIGNING_SECRET' 32
$transcriptionKey = [string] $secrets['TRANSCRIPTION_API_KEY']
$transcriptionBaseUrl = if ($secrets['TRANSCRIPTION_BASE_URL']) { [string] $secrets['TRANSCRIPTION_BASE_URL'] } else { 'https://api.openai.com/v1' }
$transcriptionModel = if ($secrets['TRANSCRIPTION_MODEL']) { [string] $secrets['TRANSCRIPTION_MODEL'] } else { 'whisper-1' }

if (-not $ImageTag) {
  $ImageTag = (git -C $serviceRoot rev-parse --short=12 HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $ImageTag) { throw 'Could not resolve the image tag from Git' }
}
if ($MinimumReplicas -lt 1) { throw 'MinimumReplicas must remain at least 1 so queued jobs continue processing' }
if ($MaximumReplicas -lt $MinimumReplicas) { throw 'MaximumReplicas must be greater than or equal to MinimumReplicas' }

$temporaryParameters = $null
try {
  if (-not $PSCmdlet.ShouldProcess($ResourceGroup, 'Create or update Azure Media API infrastructure')) { return }
  $temporaryParameters = [IO.Path]::GetTempFileName()

  az account show --output none
  if ($LASTEXITCODE -ne 0) { throw 'Azure CLI is not authenticated' }
  az provider register --namespace Microsoft.App --wait
  az provider register --namespace Microsoft.OperationalInsights --wait
  az provider register --namespace Microsoft.ContainerRegistry --wait
  az group create --name $ResourceGroup --location $Location --output none

  $foundation = az deployment group create `
    --name 'media-foundation' `
    --resource-group $ResourceGroup `
    --template-file $foundationTemplate `
    --parameters "prefix=$Prefix" "location=$Location" `
    --query properties.outputs --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Foundation deployment failed' }

  $registryName = $foundation.registryName.value
  az acr build `
    --registry $registryName `
    --image "wppconnect-media-api:$ImageTag" `
    --file (Join-Path $serviceRoot 'Dockerfile') `
    $serviceRoot
  if ($LASTEXITCODE -ne 0) { throw 'Container build failed' }

  $parameterDocument = @{
    '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters = @{
      imageTag = @{ value = $ImageTag }
      prefix = @{ value = $Prefix }
      registryName = @{ value = $registryName }
      environmentName = @{ value = $foundation.environmentName.value }
      identityName = @{ value = $foundation.identityName.value }
      storageName = @{ value = $foundation.storageName.value }
      databaseUrl = @{ value = $databaseUrl }
      mediaStorageKey = @{ value = $storageKey }
      resultSigningSecret = @{ value = $resultSecret }
      webhookSigningSecret = @{ value = $webhookSecret }
      transcriptionApiKey = @{ value = $transcriptionKey }
      transcriptionBaseUrl = @{ value = $transcriptionBaseUrl }
      transcriptionModel = @{ value = $transcriptionModel }
      minimumReplicas = @{ value = $MinimumReplicas }
      maximumReplicas = @{ value = $MaximumReplicas }
    }
  }
  $parameterDocument | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryParameters -Encoding utf8NoBOM

  $application = az deployment group create `
    --name "media-app-$ImageTag" `
    --resource-group $ResourceGroup `
    --template-file $appTemplate `
    --parameters "@$temporaryParameters" `
    --query properties.outputs --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Application deployment failed' }

  $mediaApiUrl = $application.mediaApiUrl.value
  $health = Invoke-RestMethod -Method Get -Uri "$mediaApiUrl/health" -TimeoutSec 30
  if ($health.status -ne 'ok' -or $health.service -ne 'wppconnect-media-api') {
    throw "Unexpected health response from $mediaApiUrl"
  }
  [pscustomobject]@{
    mediaApiUrl = $mediaApiUrl
    image = "$($foundation.registryServer.value)/wppconnect-media-api:$ImageTag"
    health = $health.status
    transcriptionConfigured = -not [string]::IsNullOrWhiteSpace($transcriptionKey)
  }
} finally {
  if ($temporaryParameters -and [IO.File]::Exists($temporaryParameters)) {
    [IO.File]::Delete($temporaryParameters)
  }
}
