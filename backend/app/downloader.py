import os
import re
import hashlib
import yt_dlp
from typing import Dict, Any, Optional
from pathlib import Path
from .config import settings

def sanitize_url(raw_url: str) -> str:
    url = raw_url.strip()
    for bad in ["\n", "\r", ";", "&", "|", "`", "$", "<", ">"]:
        if bad in url:
            url = url.split(bad)[0]
    return url

def get_media_id(url: str) -> str:
    # Match YouTube video ID
    yt_match = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', url)
    if yt_match:
        return yt_match.group(1)
    # Fallback to MD5 hash for local or arbitrary URLs
    return hashlib.md5(url.encode()).hexdigest()[:12]

QUALITY_FORMATS = {
    "Auto": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best",
    "360p": "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best",
    "144p": "bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=144]+bestaudio/best",
    "Audio Only": "bestaudio/best",
}

class MediaDownloader:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir

    def extract_info(self, url: str) -> Dict[str, Any]:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            media_id = info.get('id') or get_media_id(url)
            return {
                "media_id": media_id,
                "title": info.get("title", "Unknown Title"),
                "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{media_id}/hqdefault.jpg",
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", "Unknown Artist")
            }

    def download_and_prepare(
        self,
        url: str,
        want_video: bool = True,
        quality: str = "Auto",
        progress_callback=None
    ) -> Dict[str, Any]:
        if quality == "Audio Only":
            want_video = False

        info = self.extract_info(url)
        media_id = info["media_id"]
        
        target_dir = self.cache_dir / media_id
        target_dir.mkdir(parents=True, exist_ok=True)
        
        audio_path = target_dir / "source.wav"
        video_path = target_dir / "video.mp4"
        
        # Check if already cached
        if audio_path.exists() and (not want_video or video_path.exists()):
            return {
                "media_id": media_id,
                "title": info["title"],
                "thumbnail": info["thumbnail"],
                "duration": info.get("duration", 0),
                "audio_path": str(audio_path),
                "video_path": str(video_path) if video_path.exists() else None,
                "cached": True
            }

        def hook(d):
            if progress_callback and d['status'] == 'downloading':
                p = d.get('_percent_str', '0%').replace('%', '').strip()
                speed = d.get('speed') or 0.0
                try:
                    pct = float(p)
                    progress_callback("downloading", pct, speed)
                except (ValueError, TypeError):
                    try:
                        progress_callback("downloading", 0.0, speed)
                    except Exception:
                        pass

        # 1. Download Video (if requested)
        if want_video and not video_path.exists():
            format_str = QUALITY_FORMATS.get(quality, QUALITY_FORMATS["Auto"])
            ydl_video_opts = {
                'format': format_str,
                'outtmpl': str(target_dir / "video.%(ext)s"),
                'merge_output_format': 'mp4',
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [hook]
            }
            with yt_dlp.YoutubeDL(ydl_video_opts) as ydl:
                ydl.download([url])

        # 2. Download and extract lossless WAV audio for PyTorch separation
        if not audio_path.exists():
            ydl_audio_opts = {
                'format': 'bestaudio/best',
                'outtmpl': str(target_dir / "temp_audio.%(ext)s"),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'wav',
                    'preferredquality': '0',
                }],
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [hook]
            }
            with yt_dlp.YoutubeDL(ydl_audio_opts) as ydl:
                ydl.download([url])
            
            # Normalize filename to source.wav
            for f in target_dir.glob("temp_audio*.wav"):
                f.rename(audio_path)
                break

        return {
            "media_id": media_id,
            "title": info["title"],
            "thumbnail": info["thumbnail"],
            "duration": info.get("duration", 0),
            "audio_path": str(audio_path),
            "video_path": str(video_path) if video_path.exists() else None,
            "cached": False
        }
