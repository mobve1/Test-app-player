import React from "react";
import {
  X,
  Activity,
  Cpu,
  HardDrive,
  Download,
  Zap,
  Clock,
  Sparkles,
  Layers,
  Award,
  TrendingUp,
} from "lucide-react";
import type { FullTelemetry, ModelInfo } from "../api";

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: FullTelemetry | null;
  models: ModelInfo[];
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  models,
}) => {
  if (!isOpen || !stats) return null;

  const { hardware, network, separation, analytics } = stats;
  const isCuda = hardware.gpu.cuda_available;

  const fmtDur = (sec: number) => {
    if (!sec || isNaN(sec)) return "0m 0s";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  };

  const snapshots = analytics.snapshots || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-[pop_.15s_ease-out]">
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0f0f13]/95 text-white shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1ed760]/15 text-[#1ed760] border border-[#1ed760]/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                System & AI Telemetry Dashboard
                <span className="rounded-full bg-[#1ed760]/20 px-2 py-0.5 text-[11px] font-semibold text-[#1ed760]">
                  Live
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Hardware resource monitor, separation benchmarks, and model accuracy indices.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="scroll flex-1 space-y-6 overflow-y-auto p-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Speed Benchmark */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-white/50 text-xs mb-1">
                <span>Speed Factor</span>
                <Zap className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {analytics.average_speed_factor.toFixed(1)}x
              </div>
              <div className="text-[11px] text-white/40 mt-1">
                Realtime Acceleration
              </div>
            </div>

            {/* GPU VRAM Load */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-white/50 text-xs mb-1">
                <span>VRAM Usage</span>
                <HardDrive className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white/90">
                {hardware.gpu.vram_percent}%
              </div>
              <div className="text-[11px] text-white/40 mt-1">
                {hardware.gpu.allocated_vram_gb.toFixed(1)} / {hardware.gpu.total_vram_gb.toFixed(0)} GB
              </div>
            </div>

            {/* CPU Utilization */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-white/50 text-xs mb-1">
                <span>CPU Load</span>
                <Cpu className="h-4 w-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white/90">
                {hardware.cpu_percent.toFixed(0)}%
              </div>
              <div className="text-[11px] text-white/40 mt-1">
                RAM: {hardware.ram.used_gb.toFixed(1)} / {hardware.ram.total_gb.toFixed(0)} GB
              </div>
            </div>

            {/* Total Stems Separated */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-white/50 text-xs mb-1">
                <span>Completed Tracks</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-300">
                {analytics.total_files_processed}
              </div>
              <div className="text-[11px] text-white/40 mt-1">
                {fmtDur(analytics.total_audio_seconds)} audio
              </div>
            </div>
          </div>

          {/* Real-time Hardware History Chart */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#1ed760]" />
                <h3 className="text-sm font-semibold text-white">
                  Real-time Utilization Timeline (Last 30 Snapshots)
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#1ed760]" />
                  <span className="text-white/60">VRAM %</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  <span className="text-white/60">CPU %</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-400" />
                  <span className="text-white/60">RAM %</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Waveform Timeline */}
            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-black/40 p-2">
              {snapshots.length > 1 ? (
                <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 300 100">
                  {/* Grid Lines */}
                  <line x1="0" y1="25" x2="300" y2="25" stroke="rgba(255,255,255,0.08)" strokeDasharray="4" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.08)" strokeDasharray="4" />
                  <line x1="0" y1="75" x2="300" y2="75" stroke="rgba(255,255,255,0.08)" strokeDasharray="4" />

                  {/* VRAM Polyline */}
                  <polyline
                    fill="none"
                    stroke="#1ed760"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={snapshots
                      .map((p, i) => `${(i / (snapshots.length - 1)) * 300},${100 - (p.vram_percent || 0)}`)
                      .join(" ")}
                  />

                  {/* CPU Polyline */}
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={snapshots
                      .map((p, i) => `${(i / (snapshots.length - 1)) * 300},${100 - (p.cpu || 0)}`)
                      .join(" ")}
                  />

                  {/* RAM Polyline */}
                  <polyline
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={snapshots
                      .map((p, i) => `${(i / (snapshots.length - 1)) * 300},${100 - (p.ram || 0)}`)
                      .join(" ")}
                  />
                </svg>
              ) : (
                <div className="grid h-full place-items-center text-xs text-white/40">
                  Sampling system telemetry timeline...
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-white/40">
              <span>Past (~45s ago)</span>
              <span>Current</span>
            </div>
          </div>

          {/* Model Accuracy & SDR Rating Index */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">
                  Model Accuracy & SDR Benchmark Index
                </h3>
              </div>
              <span className="text-xs text-white/50">
                Signal-to-Distortion Ratio (Higher dB = Cleaner Stems)
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => {
                const sdrVal = m.sdr || 10.0;
                const isGold = sdrVal >= 12.8;
                return (
                  <div
                    key={m.name}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isGold
                        ? "border-[#1ed760]/30 bg-[#1ed760]/[0.04]"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                        {m.family}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isGold
                            ? "bg-[#1ed760]/20 text-[#1ed760]"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {m.sdrRating || `${sdrVal.toFixed(2)} dB`}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50 line-clamp-2">
                      {m.description}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/40">
                      <span>VRAM: ~{m.estimatedMemoryGB} GB</span>
                      <span className="text-emerald-400 font-medium">FP16 CUDA</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Separation Processing History */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Recent Separation Processing History
                </h3>
              </div>
              <span className="text-xs text-white/50">
                Benchmarked speed factor & wall-clock times
              </span>
            </div>

            {analytics.recent_jobs && analytics.recent_jobs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Track Title</th>
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Audio Length</th>
                      <th className="pb-2 font-medium">Wall-Clock</th>
                      <th className="pb-2 font-medium">Speed Factor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono text-[11px]">
                    {analytics.recent_jobs.map((job, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 text-white/50">{job.timestamp}</td>
                        <td className="py-2.5 font-sans font-medium text-white/90 max-w-[180px] truncate">
                          {job.title}
                        </td>
                        <td className="py-2.5 text-white/60 truncate max-w-[140px]">
                          {job.model.split(".")[0]}
                        </td>
                        <td className="py-2.5 text-white/80">{job.audio_duration_s}s</td>
                        <td className="py-2.5 text-white/80">{job.processing_time_s}s</td>
                        <td className="py-2.5 text-emerald-400 font-bold">
                          {job.speed_factor}x Realtime
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid place-items-center py-8 text-center text-xs text-white/40">
                <Clock className="mb-2 h-8 w-8 text-white/20" />
                No separation jobs completed in this session yet.
                <br />
                Process a video or audio URL to populate live benchmarks.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
