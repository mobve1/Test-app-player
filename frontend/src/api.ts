/**
 * Stemwave V2 IPC Bridge
 * Replaces fragile Wails RPC with robust WebSocket + HTTP REST communication.
 * Provides identical function signatures and event semantics for seamless frontend preservation.
 */

const API_BASE = "http://127.0.0.1:8000";
const WS_BASE = "ws://127.0.0.1:8000/ws";

export type ListenMode = "vocals" | "music" | "original";
export type MediaType = "audio" | "video";

export type ModelInfo = {
  name: string;
  path: string;
  family: string;
  compatibility: string;
  recommendation: string;
  estimatedMemoryGB: number;
  description?: string;
  sdr?: number;
  sdrRating?: string;
};

export type HardwareSpecs = {
  cpuCores: number;
  ramGB: number;
  executionProvider: string;
  gpuName: string;
  vramGB: number;
};

export interface HardwareTelemetry {
  cpu_percent: number;
  ram: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent: number;
  };
  gpu: {
    cuda_available: boolean;
    gpu_name: string;
    total_vram_gb: number;
    allocated_vram_gb: number;
    reserved_vram_gb: number;
    free_vram_gb: number;
    vram_percent: number;
  };
}

export interface NetworkTelemetry {
  download_speed_mb: number;
  is_downloading: boolean;
}

export interface SeparationTelemetry {
  is_separating: boolean;
  current_job: {
    media_id: string;
    title: string;
    model_name: string;
    audio_duration_s: number;
    progress_pct: number;
    step_name: string;
    elapsed_s: number;
    etr_s: number;
    speed_factor: number;
  } | null;
}

export interface JobRecord {
  id: string;
  title: string;
  model: string;
  audio_duration_s: number;
  processing_time_s: number;
  speed_factor: number;
  vram_peak_gb: number;
  timestamp: string;
}

export interface SnapshotPoint {
  time: string;
  cpu: number;
  ram: number;
  vram_percent: number;
  vram_alloc_gb: number;
  net_mb: number;
}

export interface AnalyticsTelemetry {
  total_files_processed: number;
  total_audio_seconds: number;
  average_speed_factor: number;
  recent_jobs: JobRecord[];
  snapshots: SnapshotPoint[];
}

export interface FullTelemetry {
  hardware: HardwareTelemetry;
  network: NetworkTelemetry;
  separation: SeparationTelemetry;
  analytics: AnalyticsTelemetry;
}

export type PlaybackState = {
  generation: number;
  state: string;
  position: number;
  message: string;
  vocals?: string;
  instrumental?: string;
  media_id?: string;
};

// ── Event Hub (Replacement for Wails EventsOn / EventsOff) ──────────────────
type EventCallback = (data: unknown) => void;
const listeners = new Map<string, Set<EventCallback>>();
let ws: WebSocket | null = null;
let reconnectTimer: any = null;

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    ws = new WebSocket(WS_BASE);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: evtName, data } = payload;
        const set = listeners.get(evtName);
        if (set) {
          set.forEach((cb) => cb(data));
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };
    ws.onclose = () => {
      ws = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, 1500);
    };
    ws.onerror = () => {
      ws?.close();
    };
  } catch (e) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  }
}

connectWebSocket();

export function EventsOn(event: string, callback: EventCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(callback);
  return () => EventsOff(event, callback);
}

export function EventsOff(event: string, callback?: EventCallback) {
  if (!callback) {
    listeners.delete(event);
  } else {
    listeners.get(event)?.delete(callback);
  }
}

// ── RPC Client Methods (Direct Wails Replacements) ──────────────────────────

export async function StartStream(
  url: string,
  listenMode: string,
  mediaFormat: string,
  quality: string = "Auto"
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/stream/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, listenMode, mediaFormat, quality }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Network error" }));
    throw new Error(err.detail || "Failed to start stream");
  }
  return "";
}

export async function StopStream(): Promise<void> {
  await fetch(`${API_BASE}/api/stream/stop`, { method: "POST" });
}

export async function ConfirmPlayback(generation: number): Promise<void> {
  await fetch(`${API_BASE}/api/playback/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generation }),
  });
}

export async function SeekStream(position: number): Promise<void> {
  await fetch(`${API_BASE}/api/stream/seek`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  }).catch(() => {});
}

export async function PauseStreamAt(position: number): Promise<void> {
  await fetch(`${API_BASE}/api/stream/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  }).catch(() => {});
}

export async function ResumeStreamAt(position: number): Promise<void> {
  await fetch(`${API_BASE}/api/stream/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  }).catch(() => {});
}

export async function ChangeMode(mode: string): Promise<void> {
  await fetch(`${API_BASE}/api/stream/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export async function SetVolume(volume: number): Promise<void> {
  await fetch(`${API_BASE}/api/stream/volume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volume }),
  });
}

export async function GetModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/models`);
  return res.json();
}

export async function SelectModel(name: string): Promise<void> {
  await fetch(`${API_BASE}/api/models/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function GetHardwareSpecs(): Promise<HardwareSpecs> {
  const res = await fetch(`${API_BASE}/api/hardware`);
  return res.json();
}

export async function GetStats(): Promise<FullTelemetry> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) {
    throw new Error("Failed to fetch system telemetry");
  }
  return res.json();
}

// ── Window Controls ─────────────────────────────────────────────────────────
export function WindowMinimise() {
  // Supported in pywebview via window.pywebview or browser
  if ((window as any).pywebview) {
    (window as any).pywebview.api.minimize?.();
  }
}

export function WindowToggleMaximise() {
  if ((window as any).pywebview) {
    (window as any).pywebview.api.toggle_maximize?.();
  }
}

export function Quit() {
  if ((window as any).pywebview) {
    (window as any).pywebview.api.close?.();
  } else {
    window.close();
  }
}
