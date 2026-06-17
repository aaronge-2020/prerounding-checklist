# One-time setup for the Python de-identification pipeline.
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File python-deid/setup.ps1

$ErrorActionPreference = "Stop"
$venvDir = Join-Path $PSScriptRoot "venv"

if (-not (Test-Path $venvDir)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv $venvDir
}

$pipExe = Join-Path (Join-Path $venvDir "Scripts") "pip.exe"
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $pipExe install --upgrade pip
& $pipExe install -r (Join-Path $PSScriptRoot "requirements.txt")

Write-Host ""
Write-Host "Downloading spaCy model..." -ForegroundColor Cyan
$pythonExe = Join-Path $venvDir "Scripts" "python.exe"
& $pythonExe -m spacy download en_core_web_lg

Write-Host ""
Write-Host "De-identification pipeline setup complete." -ForegroundColor Green
Write-Host "Run: .\python-deid\venv\Scripts\python.exe python-deid\run_deid.py --help" -ForegroundColor Yellow
