<#
.SYNOPSIS
    Automated Packaging & Release Build Script for Stemwave V2 Portable.
    Creates a clean, distribution-ready portable package suitable for GitHub Releases.

.DESCRIPTION
    1. Compiles the React/Vite frontend (npm run build).
    2. Assembles a clean 'Stemwave-Release' folder structure.
    3. Copies production backend code, compiled frontend, and model manifests.
    4. Excludes heavy model weights (*.ckpt, *.onnx, *.pth), virtual environments, and node_modules.
    5. Generates 'Stemwave-Launcher.bat' with automatic 1-click CUDA/Python runtime bootstrapping.
    6. Compiles a native lightweight 'Stemwave.exe' Windows application wrapper.
    7. Optionally bundles the release into 'Stemwave-V2-Portable.zip'.

.PARAMETER SkipFrontendBuild
    Skips running 'npm run build' if frontend/dist is already built.

.PARAMETER NoZip
    Skips creating the final Stemwave-V2-Portable.zip archive.

.EXAMPLE
    .\build_release.ps1
    .\build_release.ps1 -SkipFrontendBuild
    .\build_release.ps1 -NoZip
#>

[CmdletBinding()]
param(
    [switch]$SkipFrontendBuild,
    [switch]$NoZip,
    [string]$ReleaseDirName = "Stemwave-Release",
    [string]$ZipName = "Stemwave-V2-Portable.zip"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$ReleaseDir = Join-Path $ProjectRoot $ReleaseDirName
$ZipPath = Join-Path $ProjectRoot $ZipName

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   STEMWAVE V2 - PORTABLE BUILD & RELEASE PACKAGER              " -ForegroundColor Cyan
Write-Host "   Project Root: $ProjectRoot" -ForegroundColor DarkCyan
Write-Host "   Output Dir:   $ReleaseDir" -ForegroundColor DarkCyan
Write-Host "=================================================================`n" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# STEP 1: Build the React / Vite Frontend
# -----------------------------------------------------------------------------
$frontendDir = Join-Path $ProjectRoot "frontend"
$distDir = Join-Path $frontendDir "dist"

if (-not $SkipFrontendBuild) {
    Write-Host "[1/6] Building React frontend via Vite..." -ForegroundColor Yellow
    if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
        throw "frontend/package.json not found in $frontendDir"
    }

    Push-Location $frontendDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/6] Skipping frontend build (re-using existing frontend/dist)..." -ForegroundColor DarkGray
}

if (-not (Test-Path (Join-Path $distDir "index.html"))) {
    throw "Compiled frontend not found at $distDir\index.html. Run without -SkipFrontendBuild first."
}
Write-Host "[OK] Compiled frontend verified in frontend/dist`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 2: Create Clean Release Directory
# -----------------------------------------------------------------------------
Write-Host "[2/6] Preparing clean release directory: $ReleaseDirName..." -ForegroundColor Yellow
if (Test-Path $ReleaseDir) {
    Write-Host "     Cleaning previous release folder..." -ForegroundColor DarkGray
    Remove-Item -Path $ReleaseDir -Recurse -Force
}

$dirsToCreate = @(
    $ReleaseDir,
    (Join-Path $ReleaseDir "backend\app"),
    (Join-Path $ReleaseDir "frontend\dist"),
    (Join-Path $ReleaseDir "models"),
    (Join-Path $ReleaseDir "cache")
)

foreach ($dir in $dirsToCreate) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Write-Host "[OK] Release directory hierarchy created`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 3: Copy Application Code & Assets (Excluding Dev & Weights)
# -----------------------------------------------------------------------------
Write-Host "[3/6] Copying production source files..." -ForegroundColor Yellow

# A. Backend core application files
$backendSrc = Join-Path $ProjectRoot "backend"
$backendAppSrc = Join-Path $backendSrc "app"
$backendAppDst = Join-Path $ReleaseDir "backend\app"

Get-ChildItem -Path $backendAppSrc -Filter "*.py" -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $backendAppDst -Force
}
Copy-Item -Path (Join-Path $backendSrc "run.py") -Destination (Join-Path $ReleaseDir "backend\run.py") -Force
Copy-Item -Path (Join-Path $backendSrc "pyproject.toml") -Destination (Join-Path $ReleaseDir "backend\pyproject.toml") -Force
if (Test-Path (Join-Path $backendSrc "main.py")) {
    Copy-Item -Path (Join-Path $backendSrc "main.py") -Destination (Join-Path $ReleaseDir "backend\main.py") -Force
}

# B. Compiled frontend distribution
Copy-Item -Path "$distDir\*" -Destination (Join-Path $ReleaseDir "frontend\dist") -Recurse -Force

# C. Model metadata / JSON manifests ONLY (Crucially exclude all weight files: .ckpt, .onnx, .pth, .yaml)
$modelsSrc = Join-Path $ProjectRoot "models"
$modelsDst = Join-Path $ReleaseDir "models"
Get-ChildItem -Path $modelsSrc -Filter "*.json" -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $modelsDst -Force
}

# D. Cache placeholder (.gitkeep)
Set-Content -Path (Join-Path $ReleaseDir "cache\.gitkeep") -Value "" -NoNewline

# E. Root documents (README & LICENSE)
if (Test-Path (Join-Path $ProjectRoot "README.md")) {
    Copy-Item -Path (Join-Path $ProjectRoot "README.md") -Destination $ReleaseDir -Force
}
if (Test-Path (Join-Path $ProjectRoot "LICENSE")) {
    Copy-Item -Path (Join-Path $ProjectRoot "LICENSE") -Destination $ReleaseDir -Force
}

Write-Host "[OK] Files copied successfully (Model weights & node_modules excluded)`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 4: Generate Stemwave-Launcher.bat
# -----------------------------------------------------------------------------
Write-Host "[4/6] Generating portable 'Stemwave-Launcher.bat'..." -ForegroundColor Yellow

$launcherBatContent = @'
@echo off
setlocal enabledelayedexpansion
title Stemwave V2 - Smart Media Hub & AI Audio Separator
color 0B

cd /d "%~dp0"

echo =====================================================================
echo                STEMWAVE V2 - SMART MEDIA HUB
echo         AI Audio Separator & Real-Time Player (CUDA 12)
echo =====================================================================
echo.

set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"

if exist "!VENV_PYTHON!" goto LAUNCH_APP

echo [!] First-time run detected.
echo Setting up isolated Python 3.11 environment with NVIDIA CUDA acceleration...
echo.

:: 1. Ensure Astral uv package manager is available
where uv >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.cargo\bin\uv.exe" (
        set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
    ) else if exist "%LOCALAPPDATA%\bin\uv.exe" (
        set "PATH=%LOCALAPPDATA%\bin;!PATH!"
    ) else (
        echo [*] Installing fast Astral uv package manager...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
        set "PATH=%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\bin;!PATH!"
    )
)

:: 2. Create isolated Python 3.11 virtual environment via uv
echo.
echo [*] Initializing Python 3.11 virtual environment (.venv)...
uv venv --python 3.11 .venv
if errorlevel 1 (
    echo [!] uv venv failed. Attempting fallback using system Python...
    python -m venv .venv
)

if not exist "!VENV_PYTHON!" (
    echo [ERROR] Failed to create virtual environment (.venv\Scripts\python.exe not found).
    echo Please make sure Python 3.10-3.12 or uv is accessible.
    pause
    exit /b 1
)

:: 3. Install PyTorch with native CUDA 12.4 acceleration
echo.
echo [*] Installing PyTorch with CUDA 12.4 support (Optimized for NVIDIA RTX 3060)...
set "UV_HTTP_TIMEOUT=600"
uv pip install --python "!VENV_PYTHON!" torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
if errorlevel 1 (
    echo [!] CUDA PyTorch installation encountered an issue. Falling back to standard PyTorch...
    uv pip install --python "!VENV_PYTHON!" torch torchvision torchaudio
)

:: 4. Install audio-separator, FastAPI, Uvicorn, pywebview, and yt-dlp
echo.
echo [*] Installing Stemwave dependencies (audio-separator, pywebview, fastapi, yt-dlp)...
uv pip install --python "!VENV_PYTHON!" "audio-separator[gpu]==0.48.0" "fastapi>=0.115.0" "uvicorn[standard]>=0.32.0" "yt-dlp>=2024.10.22" "pydantic>=2.7.0" "pydantic-settings>=2.5.0" "psutil>=6.0.0" "pywebview>=5.3" "websockets>=13.0"

:: 5. Device Verification
echo.
echo [*] Verifying hardware device access...
"!VENV_PYTHON!" -c "import torch; dev = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'; print(f'[Device Verified] CUDA: {torch.cuda.is_available()} | Active Device: {dev}')"

:: 6. Check for FFmpeg
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo.
    echo [NOTE] FFmpeg was not detected in system PATH.
    echo While basic playback works, audio conversion and yt-dlp video remuxing benefit from FFmpeg.
    echo Install in terminal anytime with: winget install ffmpeg
)

echo.
echo =====================================================================
echo  SETUP COMPLETE - LAUNCHING STEMWAVE V2!
echo =====================================================================
timeout /t 2 >nul

:LAUNCH_APP
echo [*] Starting Stemwave desktop player...
"!VENV_PYTHON!" "backend\run.py" %*
if errorlevel 1 (
    echo.
    echo [!] Stemwave terminated with an error code: %errorlevel%
    pause
)
'@

Set-Content -Path (Join-Path $ReleaseDir "Stemwave-Launcher.bat") -Value $launcherBatContent -Encoding ASCII
Write-Host "[OK] Stemwave-Launcher.bat generated`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 5: Compile Native Lightweight Stemwave.exe Wrapper
# -----------------------------------------------------------------------------
Write-Host "[5/6] Compiling native 'Stemwave.exe' Windows application wrapper..." -ForegroundColor Yellow

$csharpSource = @'
using System;
using System.Diagnostics;
using System.IO;

namespace StemwaveLauncher
{
    class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string batPath = Path.Combine(appDir, "Stemwave-Launcher.bat");
            string venvPython = Path.Combine(appDir, ".venv", "Scripts", "python.exe");
            string runPy = Path.Combine(appDir, "backend", "run.py");

            // If .venv already exists, launch the Python backend + pywebview window directly
            if (File.Exists(venvPython) && File.Exists(runPy))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = venvPython;
                psi.Arguments = "backend\\run.py " + string.Join(" ", args);
                psi.WorkingDirectory = appDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true; // Clean windowless launch, native Edge WebView2 will open
                try
                {
                    Process proc = Process.Start(psi);
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
                catch (Exception)
                {
                    // Fall back to batch script if direct invocation fails
                }
            }

            // First-time run or fallback: Launch batch launcher in visible console to show setup progress
            if (File.Exists(batPath))
            {
                ProcessStartInfo batPsi = new ProcessStartInfo();
                batPsi.FileName = "cmd.exe";
                batPsi.Arguments = "/c \"" + batPath + "\" " + string.Join(" ", args);
                batPsi.WorkingDirectory = appDir;
                batPsi.UseShellExecute = true;

                Process batProc = Process.Start(batPsi);
                batProc.WaitForExit();
                return batProc.ExitCode;
            }

            return 1;
        }
    }
}
'@

$tempCsPath = Join-Path $env:TEMP "StemwaveLauncherSource_$([Guid]::NewGuid().ToString('N')).cs"
$outputExePath = Join-Path $ReleaseDir "Stemwave.exe"
Set-Content -Path $tempCsPath -Value $csharpSource -Encoding UTF8

$cscPath = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (Test-Path $cscPath) {
    & $cscPath /nologo /target:winexe /optimize+ /out:$outputExePath $tempCsPath | Out-Null
    Remove-Item $tempCsPath -Force -ErrorAction SilentlyContinue
    if (Test-Path $outputExePath) {
        Write-Host "[OK] Native Stemwave.exe compiled successfully`n" -ForegroundColor Green
    } else {
        Write-Host "[!] Stemwave.exe compilation finished without output file, launcher.bat remains primary`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "[!] csc.exe not found at standard path. Stemwave-Launcher.bat is available as primary launcher`n" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# STEP 6: Package into Zip Archive
# -----------------------------------------------------------------------------
if (-not $NoZip) {
    Write-Host "[6/6] Compressing release package into $ZipName..." -ForegroundColor Yellow
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath -Force
    }

    Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal
    $zipSizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
    Write-Host "[OK] Zip archive created: $ZipName ($zipSizeMb MB)`n" -ForegroundColor Green
} else {
    Write-Host "[6/6] Skipping zip compression (-NoZip specified)`n" -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# Summary Report
# -----------------------------------------------------------------------------
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "   STEMWAVE V2 RELEASE PACKAGE READY!                           " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "Release Directory: $ReleaseDir"
if (-not $NoZip) {
    Write-Host "Distribution Zip:  $ZipPath"
}
Write-Host "`nContents inside ${ReleaseDirName}:"
Get-ChildItem -Path $ReleaseDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Write-Host "The release is ready for GitHub Releases distribution!" -ForegroundColor Cyan
