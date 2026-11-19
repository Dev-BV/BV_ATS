<#
  Builds the whole system into ONE folder that can be copied to the server.
  Run on your development PC (needs .NET SDK and Node.js):   .\deploy\publish.ps1
  Result: <project>\publish   (the API with the web app inside it)
#>
param([string]$Output = "")

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Output) { $Output = Join-Path $root "publish" }

Write-Host "1/3  Building the web app..." -ForegroundColor Cyan
Push-Location (Join-Path $root "web")
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally { Pop-Location }

Write-Host "2/3  Copying the web app into the API (wwwroot)..." -ForegroundColor Cyan
$wwwroot = Join-Path $root "api\wwwroot"
if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
Copy-Item (Join-Path $root "web\dist") $wwwroot -Recurse

Write-Host "3/3  Publishing the API..." -ForegroundColor Cyan
if (Test-Path $Output) { Remove-Item $Output -Recurse -Force }
dotnet publish (Join-Path $root "api\CvTemplate.Api.csproj") -c Release -o $Output
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Write-Host ""
Write-Host "Done. Copy the contents of this folder to the server:" -ForegroundColor Green
Write-Host "  $Output"
