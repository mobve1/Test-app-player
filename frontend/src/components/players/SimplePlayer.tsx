import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  FastForward,
  Rewind,
  Mic,
  Music,
  Waves,
} from "lucide-react";
import type { ListenMode } from "../../api";
import { SetVolume } from "../../api";
import { audioEngine } from "../../audio";

interface SimplePlayerProps {
  video: boolean;
  streamUrl: string;
  thumbnail: string;
  title: string;
  listen: ListenMode;
  listenLabel: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onListenChange?: (mode: ListenMode) => void;
}

export const SimplePlayer: React.FC<SimplePlayerProps> = ({
  video,
  streamUrl,
  thumbnail,
  title,
  listen,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  videoRef,
  containerRef,
  isFullscreen,
  onToggleFullscreen,
  onListenChange,
}) => {
  const [vol, setVol] = useState(70);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const targetVol = muted ? 0 : vol / 100;
    if (videoRef.current) {
      videoRef.current.volume = targetVol;
    }
    audioEngine.setVolume(targetVol);
    SetVolume(targetVol).catch(console.error);
  }, [vol, muted, videoRef]);

  const fmt = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const sv = muted ? 0 : vol;
  const VolIcon = sv === 0 ? VolumeX : sv < 50 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col overflow-hidden bg-[#0c0c0e] text-white ${
        isFullscreen ? "h-screen w-screen" : "aspect-video rounded-xl border border-white/10"
      }`}
    >
      {/* Media Display Area */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {thumbnail && (!video || !streamUrl) && (
          <img
            src={thumbnail}
            alt="Thumbnail"
            className="h-full w-full object-cover opacity-60"
          />
        )}

        {streamUrl && video && (
          <video
            ref={videoRef}
            src={streamUrl.startsWith("http") ? streamUrl : `http://127.0.0.1:8000${streamUrl}`}
            poster={thumbnail}
            muted
            playsInline
            onClick={onTogglePlay}
            className="h-full w-full object-contain cursor-pointer"
          />
        )}

        {!video && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Waves className="h-12 w-12 text-[#1ed760] opacity-80" />
            <span className="text-sm font-medium text-white/60">
              Audio Mode ({listen})
            </span>
          </div>
        )}

        {/* Minimal mode badge */}
        <div className="absolute left-3 top-3 rounded bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white/60">
          Simple Player
        </div>
      </div>

      {/* Minimal Lightweight Bottom Controls */}
      <div className="border-t border-white/10 bg-[#141416] p-2.5">
        {/* Scrubber slider */}
        <div className="mb-2 flex items-center gap-2">
          <span className="w-10 text-right text-[11px] tabular-nums text-white/60">
            {fmt(currentTime)}
          </span>
          <div
            role="slider"
            aria-valuenow={currentTime}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
              onSeek(p * duration);
            }}
            className="relative h-2 flex-1 cursor-pointer rounded bg-white/20"
          >
            <div
              className="absolute inset-y-0 left-0 rounded bg-[#1ed760]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-10 text-left text-[11px] tabular-nums text-white/60">
            {fmt(duration)}
          </span>
        </div>

        {/* Button Bar */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            {/* Play/Pause */}
            <button
              onClick={onTogglePlay}
              className="grid h-8 w-8 place-items-center rounded bg-white/10 hover:bg-white/20 text-white"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
            </button>

            {/* Seek -5s */}
            <button
              onClick={() => onSeek(Math.max(0, currentTime - 5))}
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white/70 hover:text-white"
              title="Seek -5s (Left Arrow)"
            >
              <Rewind className="h-4 w-4" />
            </button>

            {/* Seek +5s */}
            <button
              onClick={() => onSeek(Math.min(duration, currentTime + 5))}
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white/70 hover:text-white"
              title="Seek +5s (Right Arrow)"
            >
              <FastForward className="h-4 w-4" />
            </button>

            {/* Volume & Mute */}
            <div className="ml-2 flex items-center gap-1.5">
              <button
                onClick={() => setMuted((m) => !m)}
                className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white/70 hover:text-white"
                title={muted ? "Unmute (M)" : "Mute (M)"}
              >
                <VolIcon className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={sv}
                onChange={(e) => {
                  setVol(Number(e.target.value));
                  setMuted(false);
                }}
                className="range w-16"
                style={
                  {
                    "--p": `${sv}%`,
                    "--c": "#1ed760",
                  } as React.CSSProperties
                }
              />
            </div>
          </div>

          {/* Stem Selectors & Fullscreen */}
          <div className="flex items-center gap-2">
            {onListenChange && (
              <div className="flex rounded-md bg-white/[0.06] p-0.5 text-[11px]">
                <button
                  onClick={() => onListenChange("vocals")}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                    listen === "vocals" ? "bg-[#1ed760] text-black font-semibold" : "text-white/60 hover:text-white"
                  }`}
                >
                  <Mic className="h-3 w-3" /> Vocals
                </button>
                <button
                  onClick={() => onListenChange("music")}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                    listen === "music" ? "bg-[#38bdf8] text-black font-semibold" : "text-white/60 hover:text-white"
                  }`}
                >
                  <Music className="h-3 w-3" /> Music
                </button>
                <button
                  onClick={() => onListenChange("original")}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                    listen === "original" ? "bg-[#a855f7] text-black font-semibold" : "text-white/60 hover:text-white"
                  }`}
                >
                  <Waves className="h-3 w-3" /> Natural
                </button>
              </div>
            )}

            <button
              onClick={onToggleFullscreen}
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white/70 hover:text-white"
              title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
