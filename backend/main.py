import os
import sys
import gc
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("StemwaveBackend")

# ── Directories ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
OUTPUT_DIR = BASE_DIR / "cache"
TEMP_DIR = BASE_DIR / "cache" / "temp"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── Supported Models Registry ────────────────────────────────────────────────
DEFAULT_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"

RECOMMENDED_MODELS = [
    {
        "name": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "family": "BS-Roformer",
        "stems": ["Vocals", "Instrumental"],
        "description": "ViperX BS-Roformer - Industry Best SDR 12.97 (Recommended for RTX 3060)",
        "vram_gb": 3.8
    },
    {
        "name": "mel_band_roformer_kim_ft_unfrozen.ckpt",
        "family": "Mel-Roformer",
        "stems": ["Vocals", "Instrumental"],
        "description": "Mel-Band Roformer (Kim FT) - Exceptional lead vocal isolation",
        "vram_gb": 4.2
    },
    {
        "name": "UVR-MDX-NET-Inst_HQ_3.onnx",
        "family": "MDX-Net",
        "stems": ["Vocals", "Instrumental"],
        "description": "UVR MDX-Net Inst HQ 3 - Fast lightweight instrumental extraction",
        "vram_gb": 1.8
    },
    {
        "name": "UVR_MDXNET_KIM_Vocal_2.onnx",
        "family": "MDX-Net",
        "stems": ["Vocals", "Instrumental"],
        "description": "Kim Vocal 2 - Fast vocal isolator",
        "vram_gb": 1.6
    },
    {
        "name": "htdemucs_ft.yaml",
        "family": "Demucs v4",
        "stems": ["Drums", "Bass", "Other", "Vocals"],
        "description": "Demucs v4 Fine-tuned - 4-Stem Full Separation",
        "vram_gb": 3.2
    }
]

# ── Job Data Structures ──────────────────────────────────────────────────────
class JobStatus:
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    LOADING_MODEL = "loading_model"
    SEPARATING = "separating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class SeparationRequest(BaseModel):
    source_type: str = Field(..., description="'youtube', 'local_file', or 'url'")
    source: str = Field(..., description="YouTube URL or absolute path to local audio/video file")
    model_name: str = Field(default=DEFAULT_MODEL, description="Model filename")
    output_format: str = Field(default="WAV", description="'WAV', 'FLAC', or 'MP3'")
    quality: str = Field(default="Auto", description="'Auto', '1080p', '720p', '480p', '360p', '144p', or 'Audio Only'")

class JobState(BaseModel):
    job_id: str
    status: str
    progress: float = 0.0
    message: str = ""
    source: str = ""
    model_name: str = ""
    quality: str = "Auto"
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    output_files: Dict[str, str] = {}
    error: Optional[str] = None

# In-memory jobs tracking
jobs_db: Dict[str, JobState] = {}
separation_queue: asyncio.Queue = asyncio.Queue()

# ── Audio Separator Lazy Instance ────────────────────────────────────────────
current_loaded_model: Optional[str] = None
separator_instance: Optional[Any] = None

def get_separator(model_name: str, output_path: Path, output_format: str = "WAV"):
    global separator_instance, current_loaded_model

    from audio_separator.separator import Separator

    if separator_instance is None or current_loaded_model != model_name:
        logger.info(f"Initializing audio-separator with model: {model_name}")
        
        separator_instance = Separator(
            log_level=logging.WARNING,
            model_file_dir=str(MODELS_DIR),
            output_dir=str(output_path),
            output_format=output_format,
            use_autocast=True,  # Enables PyTorch AMP FP16 on RTX 3060
        )
        separator_instance.load_model(model_filename=model_name)
        current_loaded_model = model_name
    else:
        # Update output directory for the current job
        separator_instance.output_dir = str(output_path)
        separator_instance.output_format = output_format

    return separator_instance

def clean_gpu_memory():
    """Forces aggressive VRAM reclamation between separation jobs."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass
    gc.collect()

QUALITY_FORMATS = {
    "Auto": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best",
    "360p": "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best",
    "144p": "bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=144]+bestaudio/best",
    "Audio Only": "bestaudio/best",
}

# ── Downloader Helper (yt-dlp) ───────────────────────────────────────────────
def download_youtube_audio(url: str, output_dir: Path, quality: str = "Auto", progress_cb=None) -> Dict[str, Any]:
    import yt_dlp

    target_audio = output_dir / "input_audio.wav"
    target_video = output_dir / "input_video.mp4"

    def ytdl_hook(d):
        if d['status'] == 'downloading' and progress_cb:
            p = d.get('_percent_str', '0%').replace('%', '').strip()
            try:
                progress_cb(float(p))
            except ValueError:
                pass

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': str(output_dir / "temp_audio.%(ext)s"),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '0',
        }],
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [ytdl_hook]
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        meta = ydl.extract_info(url, download=True)
        title = meta.get('title', 'Unknown Title')
        thumbnail = meta.get('thumbnail', '')
        
        # Rename to consistent input_audio.wav
        for f in output_dir.glob("temp_audio*.wav"):
            f.rename(target_audio)
            break

    # Optionally download video for playback sync if not Audio Only
    if quality != "Audio Only":
        try:
            v_format = QUALITY_FORMATS.get(quality, QUALITY_FORMATS["Auto"])
            ydl_video_opts = {
                'format': v_format,
                'outtmpl': str(target_video),
                'quiet': True,
                'no_warnings': True,
            }
            with yt_dlp.YoutubeDL(ydl_video_opts) as ydl:
                ydl.download([url])
        except Exception as e:
            logger.warning(f"Video download skipped or failed: {e}")

    return {
        "audio_path": str(target_audio),
        "video_path": str(target_video) if target_video.exists() else None,
        "title": title,
        "thumbnail": thumbnail
    }

# ── Background Single-Worker Queue ───────────────────────────────────────────
async def queue_worker():
    """
    Dedicated worker loop:
    Picks one job at a time from separation_queue to protect 12GB RTX 3060 VRAM.
    """
    logger.info("Separation Queue Worker initialized and listening.")
    while True:
        job_id = await separation_queue.get()
        try:
            await process_single_job(job_id)
        except Exception as e:
            logger.error(f"Unexpected error in worker loop for job {job_id}: {e}", exc_info=True)
        finally:
            separation_queue.task_done()
            clean_gpu_memory()

async def process_single_job(job_id: str):
    job = jobs_db.get(job_id)
    if not job or job.status == JobStatus.CANCELLED:
        return

    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)

    loop = asyncio.get_event_loop()

    try:
        # Step 1: Input Resolution (YouTube download or local file copy)
        input_audio_file = ""
        
        if job.source_type == "youtube":
            job.status = JobStatus.DOWNLOADING
            job.message = "Downloading audio stream via yt-dlp..."
            job.progress = 5.0

            def dl_progress(pct: float):
                job.progress = 5.0 + (pct * 0.25) # Scale to 5% - 30%

            dl_info = await loop.run_in_executor(
                None,
                lambda: download_youtube_audio(job.source, job_output_dir, job.quality, dl_progress)
            )
            input_audio_file = dl_info["audio_path"]
            job.title = dl_info["title"]
            job.thumbnail = dl_info["thumbnail"]
            if dl_info.get("video_path"):
                job.output_files["video"] = f"/cache/{job_id}/input_video.mp4"

        elif job.source_type == "local_file":
            local_path = Path(job.source)
            if not local_path.exists():
                raise FileNotFoundError(f"Local file does not exist: {job.source}")
            input_audio_file = str(local_path)
            job.title = local_path.stem
        else:
            raise ValueError(f"Unsupported source type: {job.source_type}")

        # Step 2: Model Loading & Initialization
        job.status = JobStatus.LOADING_MODEL
        job.message = f"Loading model {job.model_name} into VRAM..."
        job.progress = 35.0

        separator = await loop.run_in_executor(
            None,
            lambda: get_separator(job.model_name, job_output_dir, "WAV")
        )

        # Step 3: PyTorch Separation Execution
        job.status = JobStatus.SEPARATING
        job.message = f"Separating audio with {job.model_name} (RTX 3060 CUDA FP16)..."
        job.progress = 50.0

        raw_outputs: List[str] = await loop.run_in_executor(
            None,
            lambda: separator.separate(input_audio_file)
        )

        job.progress = 90.0
        job.message = "Indexing separated stem outputs..."

        # Step 4: Index stems into accessible endpoints
        results = {}
        for filename in raw_outputs:
            filepath = job_output_dir / filename
            if not filepath.exists():
                continue
            
            lower_name = filename.lower()
            if "vocal" in lower_name or "(vocals)" in lower_name:
                results["vocals"] = f"/cache/{job_id}/{filename}"
            elif "instrumental" in lower_name or "inst" in lower_name or "no_vocals" in lower_name:
                results["instrumental"] = f"/cache/{job_id}/{filename}"
            elif "drums" in lower_name:
                results["drums"] = f"/cache/{job_id}/{filename}"
            elif "bass" in lower_name:
                results["bass"] = f"/cache/{job_id}/{filename}"
            elif "other" in lower_name:
                results["other"] = f"/cache/{job_id}/{filename}"
            else:
                results[Path(filename).stem] = f"/cache/{job_id}/{filename}"

        job.output_files.update(results)
        job.status = JobStatus.COMPLETED
        job.progress = 100.0
        job.message = "Separation completed successfully."
        logger.info(f"Job {job_id} successfully completed. Stems: {list(results.keys())}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        job.status = JobStatus.FAILED
        job.error = str(e)
        job.message = f"Error: {str(e)}"
    finally:
        clean_gpu_memory()

# ── Lifespan Context Manager ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the single-worker queue on startup
    worker_task = asyncio.create_task(queue_worker())
    logger.info("FastAPI Backend started. CUDA status: Checking GPU...")
    clean_gpu_memory()
    yield
    # Cancel worker on shutdown
    worker_task.cancel()
    clean_gpu_memory()

# ── FastAPI App Setup ────────────────────────────────────────────────────────
app = FastAPI(
    title="Stemwave Audio Separator Backend",
    version="2.0.0",
    description="High-performance local audio separation backend powered by audio-separator & CUDA",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/cache", StaticFiles(directory=str(OUTPUT_DIR)), name="cache")

# ── API Endpoints ────────────────────────────────────────────────────────────

@app.post("/api/separate", response_model=Dict[str, Any])
async def submit_separation_job(req: SeparationRequest):
    """
    Submits a YouTube link or local audio file path to the processing queue.
    Guarantees single-task execution to protect RTX 3060 12GB VRAM.
    """
    job_id = str(uuid.uuid4())[:8]
    
    new_job = JobState(
        job_id=job_id,
        status=JobStatus.QUEUED,
        progress=0.0,
        message="Job queued. Waiting for worker...",
        source=req.source,
        model_name=req.model_name,
        quality=req.quality
    )
    jobs_db[job_id] = new_job
    await separation_queue.put(job_id)

    queue_position = separation_queue.qsize()
    return {
        "job_id": job_id,
        "status": new_job.status,
        "queue_position": queue_position,
        "message": f"Job {job_id} queued successfully."
    }

@app.get("/api/jobs/{job_id}", response_model=JobState)
async def get_job_status(job_id: str):
    """Polls the status and progress of a separation job."""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_db[job_id]

@app.get("/api/jobs", response_model=List[JobState])
async def list_all_jobs():
    """Lists all recent separation jobs."""
    return list(jobs_db.values())

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancels a job if it has not yet started."""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs_db[job_id]
    if job.status == JobStatus.QUEUED:
        job.status = JobStatus.CANCELLED
        job.message = "Job cancelled by user."
        return {"status": "cancelled"}
    return {"status": "cannot_cancel", "message": f"Job is in '{job.status}' state."}

@app.get("/api/models")
async def get_models():
    """Lists recommended models and marks which ones are locally downloaded."""
    available = []
    for m in RECOMMENDED_MODELS:
        local_path = MODELS_DIR / m["name"]
        item = dict(m)
        item["downloaded"] = local_path.exists()
        available.append(item)
    return available

@app.get("/api/hardware")
async def get_hardware():
    """Returns GPU and VRAM utilization for RTX 3060."""
    try:
        import torch
        if torch.cuda.is_available():
            vram_total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            vram_allocated = torch.cuda.memory_allocated(0) / (1024 ** 3)
            vram_reserved = torch.cuda.memory_reserved(0) / (1024 ** 3)
            return {
                "cuda_available": True,
                "device_name": torch.cuda.get_device_name(0),
                "vram_total_gb": round(vram_total, 2),
                "vram_allocated_gb": round(vram_allocated, 2),
                "vram_free_gb": round(vram_total - vram_reserved, 2)
            }
    except Exception:
        pass
    return {"cuda_available": False, "device_name": "CPU", "vram_total_gb": 0.0}

@app.get("/api/files/{job_id}/{filename:path}")
async def stream_output_file(job_id: str, filename: str, request: Request):
    """
    Serves separated audio and video files with full HTTP 206 Partial Content (Range requests)
    to enable zero-stutter scrubbing on HTML5 audio/video elements.
    """
    file_path = OUTPUT_DIR / job_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")
    media_type = "audio/wav" if file_path.suffix == ".wav" else "video/mp4"

    if range_header:
        parts = range_header.replace("bytes=", "").split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        chunk_length = end - start + 1

        def stream_chunk():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = chunk_length
                buf_size = 1024 * 512
                while remaining > 0:
                    read_bytes = min(buf_size, remaining)
                    data = f.read(read_bytes)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_length),
            "Content-Type": media_type,
        }
        return StreamingResponse(stream_chunk(), status_code=206, headers=headers)

    return FileResponse(file_path, media_type=media_type, headers={"Accept-Ranges": "bytes"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
