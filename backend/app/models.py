import os
import psutil
import torch
from typing import List, Dict, Any
from pydantic import BaseModel

class ModelInfo(BaseModel):
    name: str
    path: str
    family: str
    compatibility: str
    recommendation: str
    estimatedMemoryGB: float
    description: str
    sdr: float = 0.0
    sdrRating: str = ""

class HardwareSpecs(BaseModel):
    cpuCores: int
    ramGB: float
    executionProvider: str
    gpuName: str
    vramGB: float

# Registered models supported by audio-separator
SUPPORTED_MODELS: List[Dict[str, Any]] = [
    {
        "name": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "family": "BS-Roformer",
        "description": "ViperX BS-Roformer (Vocals / Instrumental) - Industry Gold Standard SDR 12.97",
        "estimatedMemoryGB": 3.8,
        "recommendation": "optimal",
        "sdr": 12.97,
        "sdrRating": "Gold Standard (12.97 dB)",
        "speedFactorEst": "25x - 40x"
    },
    {
        "name": "mel_band_roformer_kim_ft_unfrozen.ckpt",
        "family": "Mel-Roformer",
        "description": "Mel-Band Roformer Kim Vocal FT - Exceptional clarity on lead vocals",
        "estimatedMemoryGB": 4.2,
        "recommendation": "optimal",
        "sdr": 12.85,
        "sdrRating": "Elite Vocal (12.85 dB)",
        "speedFactorEst": "22x - 35x"
    },
    {
        "name": "UVR-MDX-NET-Inst_HQ_3.onnx",
        "family": "MDX-Net",
        "description": "UVR MDX-Net Instrumental HQ 3 - Fast inference, clean backing track",
        "estimatedMemoryGB": 1.8,
        "recommendation": "fast",
        "sdr": 10.50,
        "sdrRating": "High Quality (10.50 dB)",
        "speedFactorEst": "45x - 70x"
    },
    {
        "name": "UVR_MDXNET_KIM_Vocal_2.onnx",
        "family": "MDX-Net",
        "description": "Kim Vocal 2 - Lightweight vocal isolator for quick previews",
        "estimatedMemoryGB": 1.6,
        "recommendation": "fast",
        "sdr": 10.20,
        "sdrRating": "Standard (10.20 dB)",
        "speedFactorEst": "50x - 80x"
    },
    {
        "name": "htdemucs_ft.yaml",
        "family": "Demucs v4",
        "description": "Demucs v4 Fine-tuned - 4-Stem separation (Drums, Bass, Other, Vocals)",
        "estimatedMemoryGB": 3.2,
        "recommendation": "multi-stem",
        "sdr": 9.20,
        "sdrRating": "4-Stem SDR (9.20 dB)",
        "speedFactorEst": "15x - 25x"
    }
]

def get_hardware_specs() -> HardwareSpecs:
    cpu_cores = psutil.cpu_count(logical=True) or 8
    ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    
    provider = "CPU"
    gpu_name = "None"
    vram_gb = 0.0
    
    if torch.cuda.is_available():
        provider = "CUDA (Direct Torch)"
        gpu_name = torch.cuda.get_device_name(0)
        vram_bytes = torch.cuda.get_device_properties(0).total_memory
        vram_gb = round(vram_bytes / (1024 ** 3), 1)
    
    return HardwareSpecs(
        cpuCores=cpu_cores,
        ramGB=ram_gb,
        executionProvider=provider,
        gpuName=gpu_name,
        vramGB=vram_gb
    )

def get_available_models(models_dir: str) -> List[ModelInfo]:
    hw = get_hardware_specs()
    models: List[ModelInfo] = []
    
    for item in SUPPORTED_MODELS:
        local_path = os.path.join(models_dir, item["name"])
        is_downloaded = os.path.exists(local_path)
        
        comp = item["recommendation"]
        if hw.vramGB > 0 and item["estimatedMemoryGB"] > hw.vramGB:
            comp = "demanding"
            rec = "May exceed available GPU VRAM"
        else:
            rec = f"Accelerated by {hw.gpuName}" if hw.gpuName != "None" else "Runs on CPU"
            
        models.append(ModelInfo(
            name=item["name"],
            path=local_path if is_downloaded else "",
            family=item["family"],
            compatibility=comp,
            recommendation=rec,
            estimatedMemoryGB=item["estimatedMemoryGB"],
            description=item["description"],
            sdr=item.get("sdr", 0.0),
            sdrRating=item.get("sdrRating", "")
        ))
    
    return models
