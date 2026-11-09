import React, { useState } from "react";
import {
  Cpu,
  HardDrive,
  Download,
  Zap,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
} from "lucide-react";
import type { FullTelemetry } from "../api";

interface StatusBarProps {
  stats: FullTelemetry | null;
  onOpenAnalytics: () => void;
  activeModelName?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  stats,
  onOpenAnalytics,
  activeModelName,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (!stats) return null;

  const { hardware, network, separation, analytics } = stats;
  const isCuda = hardware.gpu.cuda_available;
  const vramPercent = hardware.gpu.vram_percent;

  // Color gradient based on VRAM load
  const vramColor =
    vramPercent > 85 ? "#ef4444" : vramPercent > 65 ? "#f59e0b" : "#1ed760";

  // Color for CPU load
  const cpuColor =
    hardware.cpu_percent > 80 ? "text-red-400" : hardware.cpu_percent > 50 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="fixed bottom-3 inset-x-4 z-40 flex justify-center pointer-events-none transition-all duration-300">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/75 px-3.5 py-1.5 text-xs text-white/80 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-white/20">
        {/* Toggle Collapse/Expand */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand System Monitor" : "Minimize System Monitor"}
          className="grid h-6 w-6 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Collapsed minimal chip view */}
        {collapsed ? (
          <div
            onClick={() => setCollapsed(false)}
            className="flex cursor-pointer items-center gap-3 text-[11px]"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <span className={`h-2 w-2 rounded-full ${isCuda ? "bg-[#1ed760] animate-pulse" : "bg-amber-400"}`} />
              <span className="text-white/90">{hardware.gpu.gpu_name}</span>
            </div>
            <span className="text-white/40">|</span>
            <div className="font-mono text-white/70">
              VRAM: {hardware.gpu.allocated_vram_gb.toFixed(1)}GB ({vramPercent}%)
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenAnalytics();
              }}
              className="ml-1 flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/20"
            >
              <BarChart2 className="h-3 w-3 text-[#1ed760]" />
              Stats
            </button>
          </div>
        ) : (
          /* Full Expanded Live Status Bar */
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-[11px]">
            {/* GPU / VRAM Metric */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 font-semibold text-white/90">
                <span className={`h-2 w-2 rounded-full ${isCuda ? "bg-[#1ed760] animate-pulse" : "bg-amber-400"}`} />
                <span className="hidden lg:inline">{hardware.gpu.gpu_name}</span>
                <span className="lg:hidden">RTX 3060</span>
              </div>

              {/* VRAM Progress bar */}
              <div className="flex items-center gap-1.5 font-mono">
                <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, vramPercent)}%`, background: vramColor }}
                  />
                </div>
                <span className="text-white/70">
                  {hardware.gpu.allocated_vram_gb.toFixed(1)}/{hardware.gpu.total_vram_gb.toFixed(0)} GB
                </span>
              </div>
            </div>

            <span className="hidden sm:inline text-white/20">|</span>

            {/* CPU Load Metric */}
            <div className="flex items-center gap-1.5 font-mono">
              <Cpu className="h-3.5 w-3.5 text-white/50" />
              <span className="text-white/60">CPU:</span>
              <span className={`font-semibold ${cpuColor}`}>
                {hardware.cpu_percent.toFixed(0)}%
              </span>
            </div>

            <span className="hidden md:inline text-white/20">|</span>

            {/* RAM Metric */}
            <div className="hidden md:flex items-center gap-1.5 font-mono text-white/70">
              <HardDrive className="h-3.5 w-3.5 text-white/50" />
              <span className="text-white/60">RAM:</span>
              <span>
                {hardware.ram.used_gb.toFixed(1)}/{hardware.ram.total_gb.toFixed(0)} GB
              </span>
            </div>

            <span className="hidden sm:inline text-white/20">|</span>

            {/* Network Download Speed */}
            <div className="flex items-center gap-1.5 font-mono">
              <Download
                className={`h-3.5 w-3.5 ${
                  network.download_speed_mb > 0.05
                    ? "text-[#38bdf8] animate-bounce"
                    : "text-white/40"
                }`}
              />
              <span className="text-white/60">Net:</span>
              <span
                className={`font-semibold ${
                  network.download_speed_mb > 0.05 ? "text-[#38bdf8]" : "text-white/50"
                }`}
              >
                {network.download_speed_mb > 0.05
                  ? `${network.download_speed_mb.toFixed(1)} MB/s`
                  : "Idle"}
              </span>
            </div>

            {/* Active Separation Benchmark Pulse (If processing) */}
            {separation.is_separating && separation.current_job && (
              <>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 border border-violet-500/30">
                  <Activity className="h-3 w-3 animate-spin text-violet-400" />
                  <span>
                    Separating: {separation.current_job.progress_pct}%
                  </span>
                  {separation.current_job.etr_s > 0 && (
                    <span className="text-violet-200">
                      (ETR ~{separation.current_job.etr_s.toFixed(0)}s)
                    </span>
                  )}
                  {separation.current_job.speed_factor > 0 && (
                    <span className="text-emerald-400 font-mono">
                      {separation.current_job.speed_factor}x
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Speed Benchmark Metric (When idle) */}
            {!separation.is_separating && analytics.average_speed_factor > 0 && (
              <>
                <span className="hidden lg:inline text-white/20">|</span>
                <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <Zap className="h-3 w-3 fill-current" />
                  <span>Avg: {analytics.average_speed_factor}x Realtime</span>
                </div>
              </>
            )}

            {/* Analytics Dashboard Trigger Button */}
            <button
              onClick={onOpenAnalytics}
              title="Open Performance Analytics & Model Benchmarks"
              className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90 hover:bg-[#1ed760] hover:text-black transition-colors"
            >
              <BarChart2 className="h-3.5 w-3.5 text-[#1ed760]" />
              <span>Dashboard</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
