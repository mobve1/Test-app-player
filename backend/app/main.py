import os
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .state import state
from .models import get_available_models, get_hardware_specs
from .downloader import MediaDownloader, sanitize_url
from .separator import StemSeparatorWorker
from .telemetry import telemetry

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

downloader = MediaDownloader(settings.CACHE_DIR)
separator_worker = StemSeparatorWorker(settings.MODELS_DIR, settings.CACHE_DIR)

# ── Pydantic Request Models ──────────────────────────────────────────────────
class StartStreamRequest(BaseModel):
    url: str
    listenMode: str = "original"
    mediaFormat: str = "video"
    quality: Optional[str] = "Auto"

class SeekRequest(BaseModel):
    position: float

class ModeRequest(BaseModel):
    mode: str

class VolumeRequest(BaseModel):
    volume: float

class ConfirmPlaybackRequest(BaseModel):
    generation: int

class ModelSelectRequest(BaseModel):
    name: str

# ── WebSocket Hub ────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await state.manager.connect(websocket)
    try:
        while True:
            # Keep-alive ping/pong
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        state.manager.disconnect(websocket)
    except Exception:
        state.manager.disconnect(websocket)

# ── Stream Lifecycle Endpoints ───────────────────────────────────────────────
@app.post("/api/stream/start")
async def start_stream(req: StartStreamRequest, bg: BackgroundTasks):
    url = sanitize_url(req.url)
    if not url:
        raise HTTPException(status_code=400, detail="Invalid media URL")

    current_gen = state.next_generation()
    quality = req.quality or "Auto"
    want_video = req.mediaFormat == "video" and quality != "Audio Only"
    state.current_mode = req.listenMode

    # Background task for download & separation to keep API response immediate
    async def process_task(gen: int):
        try:
            await state.emit_status("loading", "Extracting stream metadata...")
            loop = asyncio.get_event_loop()

            def dl_cb(status_name: str, pct: float, speed: float = 0.0):
                telemetry.set_download_progress(True, speed)
                asyncio.run_coroutine_threadsafe(
                    state.emit_status("loading", f"Downloading {status_name} ({pct:.0f}%)..."),
                    loop
                )

            # 1. Download & prepare media
            dl_result = await loop.run_in_executor(
                None,
                lambda: downloader.download_and_prepare(
                    url,
                    want_video=want_video,
                    quality=quality,
                    progress_callback=dl_cb
                )
            )
            telemetry.set_download_progress(False, 0.0)

            if state.generation != gen:
                return # Aborted by newer request

            media_id = dl_result["media_id"]
            state.current_media_id = media_id

            # Emit initial metadata to UI
            video_url = f"/cache/{media_id}/video.mp4" if dl_result.get("video_path") else ""
            await state.emit_media_info(
                video_url=video_url,
                thumbnail=dl_result["thumbnail"],
                title=dl_result["title"]
            )

            # 2. Audio separation via audio-separator with Benchmark Analytics
            await state.emit_status("loading", "Isolating stems with CUDA acceleration...")

            audio_dur = dl_result.get("duration", 0)
            if audio_dur <= 0 and os.path.exists(dl_result["audio_path"]):
                try:
                    import wave
                    with wave.open(dl_result["audio_path"], "rb") as wf:
                        audio_dur = round(wf.getnframes() / wf.getframerate(), 1)
                except Exception:
                    audio_dur = 60.0

            telemetry.on_separation_start(media_id, dl_result.get("title", ""), state.current_model, audio_dur)

            def sep_cb(status_name: str, pct: float):
                telemetry.on_separation_progress(status_name, pct)
                asyncio.run_coroutine_threadsafe(
                    state.emit_status("loading", f"Separating stems ({pct:.0f}%)..."),
                    loop
                )

            sep_result = await loop.run_in_executor(
                None,
                lambda: separator_worker.separate_track(
                    media_id=media_id,
                    input_audio_path=dl_result["audio_path"],
                    model_name=state.current_model,
                    progress_callback=sep_cb
                )
            )

            telemetry.on_separation_finish(media_id, dl_result.get("title", ""), state.current_model, audio_dur)

            if state.generation != gen:
                return

            # 3. Synchronized gate: Notify frontend that all stems & video are ready
            await state.emit_status("playing", "Stems ready")
            await state.emit_playback_state(
                "ready",
                position=0.0,
                message="Ready to play",
                vocals=sep_result["vocals"],
                instrumental=sep_result["instrumental"],
                media_id=media_id
            )

        except Exception as e:
            telemetry.is_separating = False
            telemetry.current_job = None
            if state.generation == gen:
                await state.emit_status("error", f"Processing error: {str(e)}")
                await state.emit_playback_state("error", message=str(e))

    asyncio.create_task(process_task(current_gen))
    return {
        "status": "processing",
        "generation": current_gen
    }

@app.post("/api/playback/confirm")
async def confirm_playback(req: ConfirmPlaybackRequest):
    if req.generation == state.generation:
        state.is_playing = True
        await state.emit_playback_state("playing", position=0.0)
    return {"status": "ok"}

@app.post("/api/stream/stop")
async def stop_stream():
    state.next_generation()
    state.is_playing = False
    await state.emit_playback_state("idle")
    await state.emit_status("idle", "")
    return {"status": "stopped"}

@app.post("/api/stream/seek")
async def seek_stream(req: SeekRequest):
    return {"status": "ok", "position": req.position}

@app.post("/api/stream/pause")
async def pause_stream(req: SeekRequest):
    state.is_playing = False
    return {"status": "ok", "state": "paused", "position": req.position}

@app.post("/api/stream/resume")
async def resume_stream(req: SeekRequest):
    state.is_playing = True
    return {"status": "ok", "state": "playing", "position": req.position}

@app.post("/api/stream/mode")
async def change_mode(req: ModeRequest):
    state.current_mode = req.mode
    return {"status": "ok", "mode": req.mode}

@app.post("/api/stream/volume")
async def set_volume(req: VolumeRequest):
    state.volume = max(0.0, min(1.0, req.volume))
    return {"status": "ok", "volume": state.volume}

# ── Model & Hardware Endpoints ───────────────────────────────────────────────
@app.get("/api/models")
async def get_models():
    return get_available_models(str(settings.MODELS_DIR))

@app.post("/api/models/select")
async def select_model(req: ModelSelectRequest):
    state.current_model = req.name
    await state.emit_status("playing", f"Selected model: {req.name}")
    return {"status": "ok", "model": req.name}

@app.get("/api/hardware")
async def get_hardware():
    return get_hardware_specs()

@app.get("/api/stats")
async def get_system_stats():
    return telemetry.get_full_stats()

# ── Media Streaming with Range Request Support ──────────────────────────────
@app.get("/api/media/{media_id}/{file_type}")
async def stream_media_file(media_id: str, file_type: str, request: Request):
    media_dir = settings.CACHE_DIR / media_id
    if not media_dir.exists():
        raise HTTPException(status_code=404, detail="Media not found")

    target_file: Optional[Path] = None

    if file_type == "video":
        target_file = media_dir / "video.mp4"
    elif file_type == "source":
        target_file = media_dir / "source.wav"
    elif file_type in ["vocals", "instrumental"]:
        model_sub = state.current_model.replace(".", "_")
        target_file = media_dir / "stems" / model_sub / f"{file_type}.wav"
        # Fallback to source if stem not yet separated
        if not target_file.exists():
            target_file = media_dir / "source.wav"

    if not target_file or not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File {file_type} not found")

    # Full HTTP Range Request handling for zero-buffering seeking
    file_size = target_file.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        parts = range_header.replace("bytes=", "").split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        length = end - start + 1

        def iterfile():
            with open(target_file, "rb") as f:
                f.seek(start)
                bytes_left = length
                chunk_size = 1024 * 512
                while bytes_left > 0:
                    read_bytes = min(chunk_size, bytes_left)
                    data = f.read(read_bytes)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": "video/mp4" if file_type == "video" else "audio/wav",
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(
        target_file,
        media_type="video/mp4" if file_type == "video" else "audio/wav",
        headers={"Accept-Ranges": "bytes"}
    )

# ── Static Cache Serving (Must be mounted before root frontend) ───────────────
CACHE_DIR = Path(settings.CACHE_DIR)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/cache", StaticFiles(directory=str(CACHE_DIR)), name="cache")

# ── Serve Built React Frontend ───────────────────────────────────────────────
if settings.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(settings.FRONTEND_DIR), html=True), name="frontend")
