import os
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Tuple
import torch

logger = logging.getLogger("stemwave.separator")

class StemSeparatorWorker:
    def __init__(self, models_dir: Path, cache_dir: Path):
        self.models_dir = models_dir
        self.cache_dir = cache_dir
        self.current_model = None
        self.separator = None

    def _init_separator(self, model_name: str):
        # Only re-initialize if model changed or not initialized
        if self.separator is not None and self.current_model == model_name:
            return

        from audio_separator.separator import Separator

        use_cuda = torch.cuda.is_available()
        logger.info(f"Initializing audio-separator with model: {model_name} (CUDA={use_cuda})")

        self.separator = Separator(
            log_level=logging.WARNING,
            model_file_dir=str(self.models_dir),
            output_dir=str(self.cache_dir),
            output_format="WAV",
            use_autocast=use_cuda, # Enables FP16 for massive speedup on RTX 3060
        )
        
        self.separator.load_model(model_filename=model_name)
        self.current_model = model_name

    def separate_track(self, media_id: str, input_audio_path: str, model_name: str, progress_callback=None) -> Dict[str, str]:
        # Specific stem destination directory for this media and model
        stem_dir = self.cache_dir / media_id / "stems" / model_name.replace(".", "_")
        stem_dir.mkdir(parents=True, exist_ok=True)

        vocals_dest = stem_dir / "vocals.wav"
        inst_dest = stem_dir / "instrumental.wav"

        # Calculate served static URLs for WebView2 / Browser
        model_sub = model_name.replace(".", "_")
        vocals_url = f"/cache/{media_id}/stems/{model_sub}/vocals.wav"
        inst_url = f"/cache/{media_id}/stems/{model_sub}/instrumental.wav"

        # Check if already separated & cached
        if vocals_dest.exists() and inst_dest.exists():
            logger.info(f"Using cached stems for {media_id} ({model_name})")
            if progress_callback:
                progress_callback("separating", 100.0)
            return {
                "vocals": vocals_url,
                "instrumental": inst_url,
                "vocals_path": str(vocals_dest),
                "instrumental_path": str(inst_dest),
                "cached": True
            }

        if progress_callback:
            progress_callback("separating", 10.0)

        self._init_separator(model_name)

        # Temporary output directory for raw audio-separator results
        temp_out = self.cache_dir / media_id / "temp_sep"
        temp_out.mkdir(parents=True, exist_ok=True)
        self.separator.output_dir = str(temp_out)
        if hasattr(self.separator, "model_instance") and self.separator.model_instance:
            self.separator.model_instance.output_dir = str(temp_out)

        if progress_callback:
            progress_callback("separating", 30.0)

        output_files = self.separator.separate(input_audio_path)

        if progress_callback:
            progress_callback("separating", 85.0)

        # Identify generated stem files
        # Typical naming: "{input_name}_(Vocals)_{model}.wav" & "{input_name}_(Instrumental)_{model}.wav"
        for fname in output_files:
            p = Path(fname)
            src = None
            if p.is_file():
                src = p
            elif (temp_out / p.name).is_file():
                src = temp_out / p.name
            elif (self.cache_dir / p.name).is_file():
                src = self.cache_dir / p.name

            if not src:
                continue

            lower = p.name.lower()
            if "vocal" in lower or "(vocals)" in lower:
                shutil.move(str(src), str(vocals_dest))
            elif "instrumental" in lower or "inst" in lower or "no_vocals" in lower or "music" in lower:
                shutil.move(str(src), str(inst_dest))
            else:
                # Fallback assignment if naming varies
                if not vocals_dest.exists():
                    shutil.move(str(src), str(vocals_dest))
                elif not inst_dest.exists():
                    shutil.move(str(src), str(inst_dest))

        # Cleanup temp directory
        shutil.rmtree(temp_out, ignore_errors=True)

        # If only vocals or instrumental was produced, fallback copy original
        if not vocals_dest.exists() and inst_dest.exists():
            shutil.copy(input_audio_path, str(vocals_dest))
        elif not inst_dest.exists() and vocals_dest.exists():
            shutil.copy(input_audio_path, str(inst_dest))

        if progress_callback:
            progress_callback("separating", 100.0)

        # Free PyTorch CUDA memory cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return {
            "vocals": vocals_url,
            "instrumental": inst_url,
            "vocals_path": str(vocals_dest),
            "instrumental_path": str(inst_dest),
            "cached": False
        }
