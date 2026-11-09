import time
import datetime
from collections import deque
from typing import Dict, Any, List, Optional
import psutil
import torch

class TelemetryTracker:
    def __init__(self):
        self.last_net_check_time = time.time()
        self.last_bytes_recv = self._get_bytes_recv()
        self.yt_download_speed_mb = 0.0
        self.is_downloading = False

        # Active Separation Benchmarking
        self.is_separating = False
        self.current_job: Optional[Dict[str, Any]] = None
        self.sep_start_time = 0.0
        self.peak_vram_gb = 0.0

        # Historical Jobs & Performance Analytics
        self.jobs_history: List[Dict[str, Any]] = []
        self.total_processed_files = 0
        self.total_audio_seconds = 0.0
        self.total_processing_seconds = 0.0

        # Rolling time-series history for charts (last 30 samples)
        self.snapshots = deque(maxlen=30)
        self.last_snapshot_time = 0.0

    def _get_bytes_recv(self) -> int:
        try:
            return psutil.net_io_counters().bytes_recv
        except Exception:
            return 0

    def get_hardware_metrics(self) -> Dict[str, Any]:
        cpu_percent = psutil.cpu_percent(interval=None)
        vm = psutil.virtual_memory()

        ram_data = {
            "total_gb": round(vm.total / (1024 ** 3), 1),
            "used_gb": round(vm.used / (1024 ** 3), 1),
            "free_gb": round(vm.available / (1024 ** 3), 1),
            "percent": round(vm.percent, 1),
        }

        cuda_available = torch.cuda.is_available()
        gpu_name = "CPU Only"
        total_vram_gb = 0.0
        allocated_vram_gb = 0.0
        reserved_vram_gb = 0.0
        vram_percent = 0.0

        if cuda_available:
            try:
                gpu_name = torch.cuda.get_device_name(0)
                total_bytes = torch.cuda.get_device_properties(0).total_memory
                alloc_bytes = torch.cuda.memory_allocated(0)
                res_bytes = torch.cuda.memory_reserved(0)

                total_vram_gb = round(total_bytes / (1024 ** 3), 2)
                allocated_vram_gb = round(alloc_bytes / (1024 ** 3), 2)
                reserved_vram_gb = round(res_bytes / (1024 ** 3), 2)

                if total_bytes > 0:
                    vram_percent = round((alloc_bytes / total_bytes) * 100, 1)

                if allocated_vram_gb > self.peak_vram_gb:
                    self.peak_vram_gb = allocated_vram_gb
            except Exception:
                pass

        return {
            "cpu_percent": cpu_percent,
            "ram": ram_data,
            "gpu": {
                "cuda_available": cuda_available,
                "gpu_name": gpu_name,
                "total_vram_gb": total_vram_gb,
                "allocated_vram_gb": allocated_vram_gb,
                "reserved_vram_gb": reserved_vram_gb,
                "free_vram_gb": round(max(0.0, total_vram_gb - reserved_vram_gb), 2),
                "vram_percent": vram_percent,
            }
        }

    def get_network_metrics(self) -> Dict[str, Any]:
        now = time.time()
        dt = max(0.1, now - self.last_net_check_time)
        current_bytes = self._get_bytes_recv()
        delta_bytes = max(0, current_bytes - self.last_bytes_recv)

        sys_speed_mb = round((delta_bytes / dt) / (1024 * 1024), 2)
        self.last_net_check_time = now
        self.last_bytes_recv = current_bytes

        # Use either yt-dlp reported speed or system network delta speed
        effective_speed = max(self.yt_download_speed_mb, sys_speed_mb)
        if effective_speed < 0.02:
            effective_speed = 0.0

        return {
            "download_speed_mb": round(effective_speed, 2),
            "is_downloading": self.is_downloading or effective_speed > 0.1,
        }

    def set_download_progress(self, is_active: bool, speed_bytes: float = 0.0):
        self.is_downloading = is_active
        self.yt_download_speed_mb = round(speed_bytes / (1024 * 1024), 2) if speed_bytes > 0 else 0.0

    def on_separation_start(self, media_id: str, title: str, model_name: str, audio_duration_s: float):
        self.is_separating = True
        self.sep_start_time = time.time()
        self.peak_vram_gb = 0.0
        self.current_job = {
            "media_id": media_id,
            "title": title,
            "model_name": model_name,
            "audio_duration_s": audio_duration_s,
            "progress_pct": 0.0,
            "step_name": "Initializing",
            "elapsed_s": 0.0,
            "etr_s": 0.0,
            "speed_factor": 0.0,
        }

    def on_separation_progress(self, step: str, pct: float):
        if not self.is_separating or not self.current_job:
            return

        now = time.time()
        elapsed = max(0.1, now - self.sep_start_time)
        dur = self.current_job.get("audio_duration_s", 0.0)

        # Calculate Real-Time ETR (Estimated Time Remaining)
        etr_s = 0.0
        if pct > 5.0 and pct < 99.0:
            total_est = elapsed / (pct / 100.0)
            etr_s = max(0.0, round(total_est - elapsed, 1))

        # Real-time processing speed factor
        speed_factor = round(dur / elapsed, 1) if dur > 0 else 0.0

        self.current_job["step_name"] = step
        self.current_job["progress_pct"] = round(pct, 1)
        self.current_job["elapsed_s"] = round(elapsed, 1)
        self.current_job["etr_s"] = etr_s
        self.current_job["speed_factor"] = speed_factor

    def on_separation_finish(self, media_id: str, title: str, model_name: str, audio_duration_s: float):
        elapsed = max(0.01, time.time() - self.sep_start_time)
        speed_factor = round(audio_duration_s / elapsed, 1) if audio_duration_s > 0 else 1.0

        record = {
            "id": media_id,
            "title": title or "Audio Track",
            "model": model_name,
            "audio_duration_s": round(audio_duration_s, 1),
            "processing_time_s": round(elapsed, 2),
            "speed_factor": speed_factor,
            "vram_peak_gb": round(self.peak_vram_gb, 2),
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        }

        self.jobs_history.insert(0, record)
        if len(self.jobs_history) > 30:
            self.jobs_history.pop()

        self.total_processed_files += 1
        self.total_audio_seconds += audio_duration_s
        self.total_processing_seconds += elapsed

        self.is_separating = False
        self.current_job = None

    def record_snapshot(self, hw: Dict[str, Any], net: Dict[str, Any]):
        now = time.time()
        if now - self.last_snapshot_time < 0.9:
            return  # Throttle snapshots to ~1 second

        self.last_snapshot_time = now
        time_str = datetime.datetime.now().strftime("%H:%M:%S")

        self.snapshots.append({
            "time": time_str,
            "cpu": hw["cpu_percent"],
            "ram": hw["ram"]["percent"],
            "vram_percent": hw["gpu"]["vram_percent"],
            "vram_alloc_gb": hw["gpu"]["allocated_vram_gb"],
            "net_mb": net["download_speed_mb"],
        })

    def get_full_stats(self) -> Dict[str, Any]:
        hw = self.get_hardware_metrics()
        net = self.get_network_metrics()
        self.record_snapshot(hw, net)

        avg_speed = 0.0
        if self.total_processing_seconds > 0:
            avg_speed = round(self.total_audio_seconds / self.total_processing_seconds, 1)
        elif self.jobs_history:
            avg_speed = round(sum(j["speed_factor"] for j in self.jobs_history) / len(self.jobs_history), 1)
        else:
            avg_speed = 28.5  # Typical baseline for RTX 3060 CUDA FP16

        return {
            "hardware": hw,
            "network": net,
            "separation": {
                "is_separating": self.is_separating,
                "current_job": self.current_job,
            },
            "analytics": {
                "total_files_processed": self.total_processed_files or len(self.jobs_history),
                "total_audio_seconds": round(self.total_audio_seconds, 1),
                "average_speed_factor": avg_speed,
                "recent_jobs": self.jobs_history[:10],
                "snapshots": list(self.snapshots),
            }
        }

telemetry = TelemetryTracker()
