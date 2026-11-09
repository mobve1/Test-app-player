<div align="center">

# 🌊 Stemwave V2
### Smart Media Hub & AI Audio Separator

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![CUDA](https://img.shields.io/badge/CUDA-12.4-76B900?logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*A local-first, GPU-accelerated media hub that downloads, separates, and plays audio stems in real time — entirely on your machine.*

</div>

---

## ✨ Features

### 🎚️ Multi-Player Engine
Stemwave ships three playback modes that share a single synchronized timeline:

| Mode | Description |
|------|-------------|
| **Simple** | Direct source playback — plays the downloaded audio/video as-is with no processing overhead. |
| **Standard** | Dual-stem playback — isolates **Vocals** and **Instrumental** tracks and mixes them live with independent volume sliders. |
| **Pro** | Full separation suite — exposes all stems (Vocals, Instrumental, Drums, Bass, Other) across multiple parallel audio nodes. |

### 🤖 AI Audio Separation
On-device stem separation powered by [audio-separator](https://github.com/karaokenerds/python-audio-separator), running fully offline with CUDA acceleration:

| Model | Family | SDR | Speed (RTX ) | Best For |
|-------|--------|-----|-------------------|----------|
| `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | **BS-Roformer** | 12.97 dB 🥇 | 25×–40× real-time | Gold-standard vocal isolation |
| `mel_band_roformer_kim_ft_unfrozen.ckpt` | **Mel-Roformer** | 12.85 dB | 22×–35× real-time | Elite lead-vocal clarity |
| `UVR-MDX-NET-Inst_HQ_3.onnx` | **MDX-Net** | 10.50 dB | 45×–70× real-time | Fast instrumental extraction |
| `UVR_MDXNET_KIM_Vocal_2.onnx` | **MDX-Net** | 10.20 dB | 50×–80× real-time | Quick vocal previews |
| `htdemucs_ft.yaml` | **Demucs v4** | 9.20 dB | 15×–25× real-time | 4-stem (Drums/Bass/Other/Vocals) |

> Models are **not included** in this repository. See [Model Weights](#-model-weights) below.

### 🎬 Video FX
- Downloads video at selectable quality (144p → 1080p / Audio Only) via **yt-dlp**
- Full HTTP Range Request support for zero-buffering seeking on the built-in WebView2 player
- Stem playback stays frame-accurate against the video timeline at all times

### 📊 Real-time Telemetry Dashboard
- **GPU monitor** — VRAM allocated / reserved / free, peak VRAM per job
- **CPU & RAM** — live percentage graphs with 30-sample rolling history
- **Separation analytics** — processing speed factor (e.g. `28× real-time`), estimated time remaining, per-job history
- **Network** — yt-dlp download speed overlaid with system network delta

---

## 🖥️ Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **GPU** | NVIDIA GPU with CUDA support | **NVIDIA RTX ** (12 GB VRAM) |
| **CUDA** | CUDA 12.x | **CUDA 12.4** |
| **VRAM** | 4 GB | **8–12 GB** (BS-Roformer uses ~3.8 GB) |
| **RAM** | 8 GB | 16 GB |
| **Python** | 3.10 | **3.11** |
| **OS** | Windows 10 | Windows 11 |
| **FFmpeg** | Required | Installed via WinGet or system PATH |

> **CPU-only mode** is supported automatically when no CUDA-capable GPU is detected, though separation will be significantly slower.

> This project was developed and optimized on an **NVIDIA RTX  12 GB** with **CUDA 12.4** and **PyTorch FP16 autocast** enabled for maximum throughput. Speed benchmarks above reflect this hardware.

---

## 📦 Model Weights

**Model weight files (`.onnx`, `.ckpt`, `.pth`) are NOT included in this repository** because of their large file sizes (hundreds of MB each).

Models are **automatically downloaded** on first use by the `audio-separator` library, which fetches them from their respective public sources and places them in the `models/` directory.

You can also trigger a manual download check via the model selector panel in the UI — the backend will report which models are present locally and which still need to be fetched.

The `models/` directory contains only metadata/manifest JSON files (`mdx_model_data.json`, `vr_model_data.json`, `download_checks.json`) that are tracked in source control.

---

## 🚀 Installation & Usage

### Prerequisites

- **Python 3.11** — [python.org](https://www.python.org/downloads/)
- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — install via WinGet: `winget install ffmpeg`
- **NVIDIA GPU drivers** + **CUDA 12** — [NVIDIA CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit)
- **`uv` package manager** (optional, recommended) — [astral.sh/uv](https://astral.sh/uv)

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/stemwave-v2.git
cd stemwave-v2
```

---

### Step 2 — Backend Setup (Automated)

Run the included PowerShell setup script. It will:
1. Create a Python 3.11 virtual environment (`.venv`)
2. Install **PyTorch** with CUDA 12.4 support
3. Install `audio-separator[gpu]`, FastAPI, Uvicorn, and yt-dlp

```powershell
# From the project root
.\setup.ps1
```

> If `uv` is not installed, the script bootstraps it automatically.

**Manual alternative** (if you prefer pip):

```bash
python -m venv .venv
.venv\Scripts\activate

# Install PyTorch with CUDA 12.4
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# Install remaining dependencies
pip install "audio-separator[gpu]==0.48.0" "fastapi>=0.115.0" "uvicorn[standard]>=0.32.0" \
            "yt-dlp>=2024.10.22" "pydantic>=2.7.0" "pydantic-settings>=2.5.0" \
            "psutil>=6.0.0" "pywebview>=5.3"
```

---

### Step 3 — Frontend Setup

```bash
cd frontend
npm install
npm run build   # Produces frontend/dist/ served by FastAPI
cd ..
```

---

### Step 4 — Launch

**Desktop app (default):**
```powershell
.\start.ps1
```

**Server-only mode** (access via browser at `http://127.0.0.1:8000`):
```powershell
.\start.ps1 -ServerOnly
```

**Developer mode** (hot-reload Vite + live FastAPI):
```powershell
.\start.ps1 -Dev
```

---

## 📦 Building Portable Release (.zip)

To compile and package Stemwave V2 into a zero-install portable folder & `.zip` archive for distribution on GitHub Releases:

```powershell
.\build_release.ps1
```

This automated pipeline:
1. Runs `npm run build` to compile the React/Vite UI.
2. Creates a clean `Stemwave-Release` folder containing only production code.
3. Excludes all weight files (`.ckpt`, `.onnx`), `.venv`, `node_modules`, and caches.
4. Generates `Stemwave-Launcher.bat` and compiles a native `Stemwave.exe` Windows wrapper.
5. Archives the result into `Stemwave-V2-Portable.zip`.

End users simply extract `Stemwave-V2-Portable.zip` and double-click `Stemwave.exe` (or `Stemwave-Launcher.bat`). The launcher handles all Python, CUDA, and PyTorch environment setup on their machine automatically.

---

## 🗂️ Project Structure

```
stemwave-v2/
├── backend/
│   ├── app/
│   │   ├── config.py         # App settings & directory paths
│   │   ├── downloader.py     # yt-dlp media fetcher & cacher
│   │   ├── main.py           # FastAPI routes & WebSocket hub
│   │   ├── models.py         # Model registry & hardware detection
│   │   ├── separator.py      # audio-separator CUDA worker
│   │   ├── state.py          # Shared playback state
│   │   └── telemetry.py      # Real-time hardware & job analytics
│   ├── run.py                # Entry point (server or desktop mode)
│   └── pyproject.toml        # Python package metadata
├── frontend/
│   ├── src/
│   │   ├── components/       # React UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── App.tsx           # Root application component
│   │   └── api.ts            # Backend API client
│   ├── package.json
│   └── vite.config.ts
├── models/                   # Weight files downloaded here (git-ignored)
│   ├── mdx_model_data.json   # Model metadata (tracked)
│   └── vr_model_data.json    # Model metadata (tracked)
├── cache/                    # Runtime media cache (git-ignored)
├── setup.ps1                 # One-shot environment setup script
├── start.ps1                 # Application launcher
└── LICENSE
```

---

## ⚙️ Configuration

All server defaults live in [`backend/app/config.py`](backend/app/config.py):

| Setting | Default | Description |
|---------|---------|-------------|
| `HOST` | `127.0.0.1` | FastAPI bind address |
| `PORT` | `8000` | FastAPI port |
| `DEFAULT_MODEL` | `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | Model loaded on startup |
| `AUDIO_SAMPLE_RATE` | `44100` | Output WAV sample rate |
| `OUTPUT_FORMAT` | `WAV` | Lossless stem output format |

---

## 🔌 API Reference

The FastAPI backend exposes a REST + WebSocket interface:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `WS` | `/ws` | Real-time playback status & progress events |
| `POST` | `/api/stream/start` | Download & separate a media URL |
| `POST` | `/api/stream/stop` | Cancel current stream |
| `POST` | `/api/stream/seek` | Seek to position |
| `POST` | `/api/stream/pause` | Pause playback |
| `POST` | `/api/stream/resume` | Resume playback |
| `GET` | `/api/models` | List available & downloaded models |
| `POST` | `/api/models/select` | Activate a separation model |
| `GET` | `/api/hardware` | GPU / CPU / RAM specs |
| `GET` | `/api/stats` | Full telemetry snapshot |

Interactive API docs are available at `http://127.0.0.1:8000/docs` while the server is running.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change, then submit a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a PR

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️ and CUDA cores.
</div>
