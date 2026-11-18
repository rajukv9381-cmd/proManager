[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ClientRepository,

    [Parameter(Mandatory = $true)]
    [string]$ServerRepository,

    [ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$')]
    [string]$Tag = 'latest',

    [string]$Profile
)

$ErrorActionPreference = 'Stop'
$repositoryPattern = '^(?<registry>[0-9]{12}\.dkr\.ecr\.(?<region>[a-z0-9-]+)\.amazonaws\.com(?:\.cn)?)/(?<repository>[a-z0-9]+(?:[._/-][a-z0-9]+)*)$'

function Get-RepositoryInfo([string]$Uri) {
    if ($Uri -notmatch $repositoryPattern) {
        throw "Invalid private ECR repository URI: $Uri"
    }
    return [PSCustomObject]@{ Uri = $Uri; Registry = $Matches.registry; Region = $Matches.region }
}

$client = Get-RepositoryInfo $ClientRepository
$server = Get-RepositoryInfo $ServerRepository
if ($client.Uri -eq $server.Uri) {
    throw 'Client and server must use different ECR repositories.'
}

$aws = Get-Command aws -ErrorAction SilentlyContinue
if (-not $aws) {
    $awsPath = Join-Path $env:ProgramFiles 'Amazon\AWSCLIV2\aws.exe'
    if (-not (Test-Path -LiteralPath $awsPath)) { throw 'AWS CLI is required.' }
} else {
    $awsPath = $aws.Source
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required.' }

$awsOptions = @()
if ($Profile) { $awsOptions += @('--profile', $Profile) }
& $awsPath sts get-caller-identity --region $client.Region @awsOptions --query Account --output text | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'AWS authentication failed. Configure your credentials or sign in to your AWS profile.' }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not available.' }

$projectRoot = Split-Path -Parent $PSScriptRoot
$clientImage = "$($client.Uri):$Tag"
$serverImage = "$($server.Uri):$Tag"
$previousDockerConfig = $env:DOCKER_CONFIG
$temporaryDockerConfig = Join-Path ([System.IO.Path]::GetTempPath()) "promanage-ecr-$([guid]::NewGuid().ToString('N'))"
Push-Location $projectRoot
try {
    Write-Host "Building $clientImage"
    docker build --file Dockerfile.client --tag $clientImage .
    if ($LASTEXITCODE -ne 0) { throw 'Client image build failed.' }
    Write-Host "Building $serverImage"
    docker build --file Dockerfile.server --tag $serverImage .
    if ($LASTEXITCODE -ne 0) { throw 'Server image build failed.' }

    New-Item -ItemType Directory -Path $temporaryDockerConfig | Out-Null
    $env:DOCKER_CONFIG = $temporaryDockerConfig
    foreach ($repository in @($client, $server) | Sort-Object Registry -Unique) {
        $password = & $awsPath ecr get-login-password --region $repository.Region @awsOptions
        if ($LASTEXITCODE -ne 0 -or -not $password) { throw "ECR authentication failed for $($repository.Registry)." }
        try {
            $password | docker login --username AWS --password-stdin $repository.Registry
            if ($LASTEXITCODE -ne 0) { throw "Docker login failed for $($repository.Registry)." }
        } finally {
            $password = $null
        }
    }

    Write-Host "Pushing $clientImage"
    docker push $clientImage
    if ($LASTEXITCODE -ne 0) { throw 'Client image push failed.' }
    Write-Host "Pushing $serverImage"
    docker push $serverImage
    if ($LASTEXITCODE -ne 0) { throw 'Server image push failed. The client image may already have been pushed.' }
    Write-Host 'Both images were pushed successfully.'
} finally {
    $env:DOCKER_CONFIG = $previousDockerConfig
    $configFile = Join-Path $temporaryDockerConfig 'config.json'
    if (Test-Path -LiteralPath $configFile) { Remove-Item -LiteralPath $configFile -Force }
    if (Test-Path -LiteralPath $temporaryDockerConfig) { Remove-Item -LiteralPath $temporaryDockerConfig -Force }
    Pop-Location
}
