import React from "react";
import { Activity, X, Cpu, HardDrive, Monitor, Gauge } from "lucide-react";

interface DiagnosticsOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  playbackRate: number;
  listenMode: string;
  onClose: () => void;
}

export const DiagnosticsOverlay: React.FC<DiagnosticsOverlayProps> = ({
  videoRef,
  currentTime,
  duration,
  playbackRate,
  listenMode,
  onClose,
}) => {
  const video = videoRef.current;

  // Calculate resolution
  const videoWidth = video?.videoWidth || 0;
  const videoHeight = video?.videoHeight || 0;
  const resolutionStr =
    videoWidth > 0 ? `${videoWidth} × ${videoHeight}` : "Audio Stream (No Video)";

  // Calculate buffered seconds & percent
  let bufferedSeconds = 0;
  let bufferedPercent = 0;
  if (video && video.buffered.length > 0 && duration > 0) {
    try {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferedSeconds = Math.max(0, end - currentTime);
      bufferedPercent = Math.min(100, Math.round((end / duration) * 100));
    } catch {
      // safe fallback
    }
  }

  // Format with milliseconds
  const fmtMs = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00.000";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  };

  return (
    <div className="pointer-events-auto absolute left-4 top-14 z-30 w-72 rounded-xl border border-white/15 bg-black/85 p-3.5 text-xs text-white/80 shadow-2xl backdrop-blur-xl animate-[pop_.14s_ease-out]">
      <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 font-bold tracking-wide text-white">
          <Activity className="h-4 w-4 text-[#1ed760]" />
          <span>Stream Diagnostics</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 font-mono text-[11px]">
        {/* Timestamp */}
        <div className="flex items-center justify-between">
          <span className="text-white/50">Position:</span>
          <span className="text-emerald-400">{fmtMs(currentTime)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/50">Duration:</span>
          <span>{fmtMs(duration)}</span>
        </div>

        {/* Resolution */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-white/50">
            <Monitor className="h-3 w-3 text-sky-400" /> Resolution:
          </span>
          <span className="font-semibold text-white/90">{resolutionStr}</span>
        </div>

        {/* Playback Speed */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-white/50">
            <Gauge className="h-3 w-3 text-amber-400" /> Playback Rate:
          </span>
          <span className="text-amber-300">{playbackRate.toFixed(2)}x</span>
        </div>

        {/* Buffer Health */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-white/50">
            <HardDrive className="h-3 w-3 text-purple-400" /> Buffer Ahead:
          </span>
          <span className="text-purple-300">
            +{bufferedSeconds.toFixed(1)}s ({bufferedPercent}%)
          </span>
        </div>

        {/* Audio Engine */}
        <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
          <span className="flex items-center gap-1 text-white/50">
            <Cpu className="h-3 w-3 text-[#1ed760]" /> Stem Engine:
          </span>
          <span className="font-sans text-[10px] font-medium text-[#1ed760]">
            Dual-Stem · {listenMode.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};
