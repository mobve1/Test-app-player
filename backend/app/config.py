import os
import shutil
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Stemwave UVR Player"
    VERSION: str = "2.0.0"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    MODELS_DIR: Path = BASE_DIR / "models"
    CACHE_DIR: Path = BASE_DIR / "cache"
    FRONTEND_DIR: Path = BASE_DIR / "frontend" / "dist"
    
    # Audio separation parameters
    DEFAULT_MODEL: str = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
    AUDIO_SAMPLE_RATE: int = 44100
    OUTPUT_FORMAT: str = "WAV" # Lossless for crystal-clear playback
    
    # Check for FFmpeg in system or WinGet path
    FFMPEG_PATH: str = shutil.which("ffmpeg") or "ffmpeg"
    
    class Config:
        arbitrary_types_allowed = True

settings = Settings()
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
