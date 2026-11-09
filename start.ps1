<#
.SYNOPSIS
    1-Click Launcher for Stemwave UVR Player V2.
#>

param(
    [switch]$Dev,
    [switch]$ServerOnly
)

$ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $ProjectDir

$venvPython = Join-Path $ProjectDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "[!] Virtual environment not found. Running setup.ps1 first..." -ForegroundColor Yellow
    & .\setup.ps1
}

if ($Dev) {
    Write-Host "[*] Launching Stemwave in Developer Mode (FastAPI + Vite Dev)..." -ForegroundColor Cyan
    
    # Start Backend
    $backendJob = Start-Process -FilePath $venvPython -ArgumentList "backend\run.py --server" -PassThru -NoNewWindow
    
    # Start Frontend Vite Dev
    Push-Location "frontend"
    npm run dev
    Pop-Location
    
    # Cleanup on exit
    Stop-Process -Id $backendJob.Id -ErrorAction SilentlyContinue
} else {
    Write-Host "[*] Starting Stemwave Desktop Player..." -ForegroundColor Green
    $args = "backend\run.py"
    if ($ServerOnly) {
        $args += " --server"
    }
    & $venvPython $args
}
