<#
.SYNOPSIS
    Automated Setup Script for Stemwave UVR Player V2 (Windows / NVIDIA RTX 3060 CUDA 12).
    1. Creates Python 3.11 Virtual Environment (.venv).
    2. Installs PyTorch with CUDA 12.4 acceleration.
    3. Installs audio-separator[gpu]==0.48.0, fastapi, uvicorn, and yt-dlp.
#>

[CmdletBinding()]
param(
    [string]$ProjectDir = ""
)

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
}

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  Stemwave UVR Player V2 - Backend & Worker Setup       " -ForegroundColor Cyan
Write-Host "  Target: $ProjectDir" -ForegroundColor DarkCyan
Write-Host "========================================================`n" -ForegroundColor Cyan

Set-Location $ProjectDir

# 1. Check or locate uv / Python 3.11
Write-Host "[1/4] Checking Python & uv package manager..." -ForegroundColor DarkYellow
$hasUv = (Get-Command uv -ErrorAction SilentlyContinue) -ne $null

if (-not $hasUv) {
    Write-Host "[!] uv not detected in PATH. Bootstrapping astral uv..." -ForegroundColor Yellow
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
}

# 2. Create Python Virtual Environment (.venv)
Write-Host "`n[2/4] Creating dedicated Python 3.11 virtual environment (.venv)..." -ForegroundColor DarkYellow
if (-not (Test-Path ".venv")) {
    uv venv --python 3.11 .venv
    Write-Host "[OK] Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[OK] Existing .venv detected." -ForegroundColor Green
}

$venvPython = Join-Path $ProjectDir ".venv\Scripts\python.exe"

# 3. Install PyTorch with Native CUDA 12.4 Acceleration (RTX 3060)
Write-Host "`n[3/4] Installing PyTorch with CUDA 12.4 support..." -ForegroundColor DarkYellow
$env:UV_HTTP_TIMEOUT = "600"
& uv pip install --python $venvPython torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# 4. Install audio-separator[gpu]==0.48.0, FastAPI, Uvicorn, and yt-dlp
Write-Host "`n[4/4] Installing audio-separator[gpu]==0.48.0, fastapi, uvicorn, and yt-dlp..." -ForegroundColor DarkYellow
& uv pip install --python $venvPython "audio-separator[gpu]==0.48.0" "fastapi>=0.115.0" "uvicorn[standard]>=0.32.0" "yt-dlp>=2024.10.22" "pydantic>=2.7.0"

# 5. Verification Check
Write-Host "`n[*] Verifying PyTorch & CUDA 12 device access..." -ForegroundColor DarkYellow
& $venvPython -c "import torch; dev = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'; print(f'[CUDA Status] Available: {torch.cuda.is_available()} | Device: {dev}')"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE - STEMWAVE BACKEND READY!              " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "`nTo start the FastAPI backend server, run:" -ForegroundColor Yellow
Write-Host "  .venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload`n" -ForegroundColor Cyan
