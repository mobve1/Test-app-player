import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Sliders,
  Activity,
  Gauge,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ListenMode } from "../../api";
import { SetVolume } from "../../api";
import { audioEngine } from "../../audio";
import {
  type VideoFilterSettings,
  DEFAULT_FILTERS,
  getFilterCss,
} from "../../types/player";
import { VideoFXPanel } from "./VideoFXPanel";
import { DiagnosticsOverlay } from "./DiagnosticsOverlay";

const TINT: Record<ListenMode, string> = {
  vocals: "#1ed760",
  music: "#38bdf8",
  original: "#a855f7",
};

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

interface ProFastStreamPlayerProps {
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
  onStepFrame: (direction: -1 | 1) => void;
  playbackRate: number;
  onSpeedChange: (speed: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const ProFastStreamPlayer: React.FC<ProFastStreamPlayerProps> = ({
  video,
  streamUrl,
  thumbnail,
  title,
  listen,
  listenLabel,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  onStepFrame,
  playbackRate,
  onSpeedChange,
  videoRef,
  containerRef,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [vol, setVol] = useState(70);
  const [muted, setMuted] = useState(false);
  const [pip, setPip] = useState(false);
  const [showFX, setShowFX] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Persistent Video Filters
  const [filters, setFilters] = useState<VideoFilterSettings>(() => {
    try {
      const saved = localStorage.getItem("stemwave_video_filters");
      return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
    } catch {
      return DEFAULT_FILTERS;
    }
  });

  const color = TINT[listen];
  const pipOn = pip && video;

  const handleFilterChange = (newFilters: VideoFilterSettings) => {
    setFilters(newFilters);
    try {
      localStorage.setItem("stemwave_video_filters", JSON.stringify(newFilters));
    } catch {
      // safe fallback
    }
  };

  useEffect(() => {
    const targetVol = muted ? 0 : vol / 100;
    if (videoRef.current) {
      videoRef.current.volume = targetVol;
    }
    audioEngine.setVolume(targetVol);
    SetVolume(targetVol).catch(console.error);
  }, [vol, muted, videoRef]);

  // Sync playback rate with audio & video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
    audioEngine.setPlaybackRate(playbackRate);
  }, [playbackRate, videoRef]);

  // Native PiP event listeners
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);

    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter);
      el.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [streamUrl, videoRef]);

  const handleTogglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("[pip]", err);
    }
  };

  // High precision time formatting with milliseconds
  const fmtPrecision = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00.00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(2, "0")}`;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const sv = muted ? 0 : vol;
  const VolIcon = sv === 0 ? VolumeX : sv < 50 ? Volume1 : Volume2;
  const PlayIcon = isPlaying ? Pause : Play;

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const newT = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    onSeek(newT);
  };

  const hasFilterApplied =
    filters.brightness !== 100 ||
    filters.contrast !== 100 ||
    filters.saturation !== 100 ||
    filters.preset !== "normal";

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden bg-black shadow-2xl transition-all duration-300 ${
        isFullscreen ? "h-screen w-screen" : "aspect-video rounded-2xl border border-white/10"
      }`}
    >
      {/* Real Thumbnail Background */}
      {thumbnail ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={thumbnail}
            alt="Media thumbnail"
            className={`h-full w-full object-cover transition-all duration-700 ${
              !video ? "scale-105 opacity-40 blur-md" : streamUrl ? "opacity-0" : "opacity-80"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        </div>
      ) : (
        <div
          className="absolute inset-0 transition-[background] duration-700"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${color}28 0%, rgba(8,8,10,0.96) 80%)`,
            display: video && streamUrl ? "none" : "block",
          }}
        />
      )}

      {/* Video Element with Real-Time CSS Filters */}
      {streamUrl && video && (
        <video
          ref={videoRef}
          src={streamUrl.startsWith("http") ? streamUrl : `http://127.0.0.1:8000${streamUrl}`}
          poster={thumbnail}
          muted
          playsInline
          style={{
            filter: getFilterCss(filters),
            transition: "filter 0.15s ease-out",
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {/* Diagnostics HUD Overlay */}
      {showDiagnostics && (
        <DiagnosticsOverlay
          videoRef={videoRef}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          listenMode={listen}
          onClose={() => setShowDiagnostics(false)}
        />
      )}

      {/* Video FX Settings Drawer */}
      {showFX && (
        <div className="pointer-events-auto absolute right-4 top-14 z-30 w-80 animate-[pop_.14s_ease-out]">
          <VideoFXPanel
            filters={filters}
            onChange={handleFilterChange}
            onClose={() => setShowFX(false)}
          />
        </div>
      )}

      {/* PiP Active State */}
      {pipOn ? (
        <div className="absolute inset-0 grid place-items-center bg-[#0f0f11]">
          <div className="text-center">
            <PictureInPicture2 className="mx-auto h-8 w-8 text-white/40" />
            <p className="mt-3 text-sm text-white/60">Playing in picture-in-picture</p>
            <button
              onClick={handleTogglePiP}
              className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20 text-white"
            >
              Return to player
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Audio Visualizer Bars */}
          {!video && (
            <div className="absolute inset-x-8 bottom-24 top-14 flex items-end gap-1" aria-hidden>
              {Array.from({ length: 44 }, (_, i) => (
                <span
                  key={i}
                  className="eq-bar"
                  style={{
                    background: color,
                    opacity: 0.85,
                    animationDelay: `${(i * 71) % 650}ms`,
                    animationDuration: `${550 + ((i * 41) % 450)}ms`,
                    animationPlayState: isPlaying ? "running" : "paused",
                  }}
                />
              ))}
            </div>
          )}

          {/* Click to play/pause hit area */}
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={onTogglePlay}
            className="absolute inset-0 w-full cursor-pointer"
          />

          {/* Pro Mode Badges Header */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md border border-white/10">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span>{listenLabel}</span>
            </div>
            <div className="rounded-full bg-indigo-500/20 px-2.5 py-1 text-[10px] font-bold tracking-wider text-indigo-300 border border-indigo-500/30">
              PRO FASTSTREAM
            </div>
          </div>

          {/* Top-Right Quick Tool Buttons */}
          <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5">
            {/* Diagnostics Button */}
            <button
              onClick={() => setShowDiagnostics((prev) => !prev)}
              title="Toggle Diagnostics HUD (Stats for Nerds)"
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                showDiagnostics
                  ? "bg-[#1ed760] text-black shadow-lg"
                  : "bg-black/60 text-white/70 hover:bg-black/80 hover:text-white border border-white/10 backdrop-blur-md"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Stats</span>
            </button>

            {/* Video FX Toggle Button */}
            {video && (
              <button
                onClick={() => setShowFX((prev) => !prev)}
                title="Video FX & Real-time Filters"
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  showFX || hasFilterApplied
                    ? "bg-[#38bdf8] text-black shadow-lg"
                    : "bg-black/60 text-white/70 hover:bg-black/80 hover:text-white border border-white/10 backdrop-blur-md"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>FX</span>
                {hasFilterApplied && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            )}
          </div>

          {/* Controls Bar */}
          <div
            className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 focus-within:opacity-100 ${
              isPlaying && video && !showFX && !showDiagnostics && !showSpeedMenu
                ? "opacity-0 group-hover:opacity-100"
                : ""
            }`}
          >
            <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-3 pt-12">
              {/* Scrubber Bar */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuenow={currentTime}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seekFromPointer(e);
                }}
                onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
                className="group/bar flex h-4 cursor-pointer items-center"
              >
                <div className="relative h-1 w-full rounded-full bg-white/15 transition-all group-hover/bar:h-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                    style={{ width: `${Math.min(100, pct + 22)}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                  <div
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Pro Control Row */}
              <div className="mt-1 flex items-center justify-between text-white">
                <div className="flex items-center gap-1">
                  {/* Skip to start */}
                  <button
                    aria-label="Back to start"
                    onClick={() => onSeek(0)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                    title="Return to start (0:00)"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>

                  {/* Frame Step Back (When Paused) */}
                  {!isPlaying && (
                    <button
                      onClick={() => onStepFrame(-1)}
                      className="grid h-8 w-8 place-items-center rounded-md text-sky-400 hover:bg-sky-400/20"
                      title="Step 1 Frame Backward (hotkey: comma ,)"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}

                  {/* Play/Pause */}
                  <button
                    aria-label={isPlaying ? "Pause" : "Play"}
                    onClick={onTogglePlay}
                    className="mx-1 grid h-10 w-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
                  >
                    <PlayIcon className="h-5 w-5 fill-current" />
                  </button>

                  {/* Frame Step Forward (When Paused) */}
                  {!isPlaying && (
                    <button
                      onClick={() => onStepFrame(1)}
                      className="grid h-8 w-8 place-items-center rounded-md text-sky-400 hover:bg-sky-400/20"
                      title="Step 1 Frame Forward (hotkey: period .)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}

                  {/* Forward +10s */}
                  <button
                    aria-label="Forward 10 seconds"
                    onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                    title="Forward 10s (Right Arrow)"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>

                  {/* Volume & Mute */}
                  <div className="ml-1 flex items-center gap-1.5">
                    <button
                      aria-label={muted ? "Unmute" : "Mute"}
                      onClick={() => setMuted((m) => !m)}
                      className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      <VolIcon className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sv}
                      aria-label="Volume"
                      className="range w-16"
                      onChange={(e) => {
                        setVol(Number(e.target.value));
                        setMuted(false);
                      }}
                      style={{ "--p": `${sv}%`, "--c": color } as React.CSSProperties}
                    />
                  </div>

                  {/* Precision Milliseconds Timestamp */}
                  <div className="ml-2 font-mono text-[11px] tabular-nums text-white/70">
                    <span className="text-white/95">{fmtPrecision(currentTime)}</span>
                    <span className="text-white/40"> / </span>
                    <span>{fmtPrecision(duration)}</span>
                  </div>

                  {title && (
                    <span className="ml-3 hidden max-w-[150px] truncate text-xs text-white/45 md:inline">
                      {title}
                    </span>
                  )}
                </div>

                {/* Right Side Pro Tools */}
                <div className="flex items-center gap-1.5">
                  {/* Playback Speed Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedMenu((p) => !p)}
                      title="Playback Speed ([ / ] hotkeys)"
                      className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/20"
                    >
                      <Gauge className="h-3 w-3 text-amber-400" />
                      <span>{playbackRate.toFixed(1)}x</span>
                    </button>

                    {showSpeedMenu && (
                      <div className="absolute bottom-full right-0 mb-2 w-32 rounded-xl border border-white/15 bg-black/90 p-1 shadow-2xl backdrop-blur-xl">
                        <div className="px-2 py-1 text-[10px] font-bold text-white/40">
                          Playback Speed
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {SPEED_OPTIONS.map((rate) => (
                            <button
                              key={rate}
                              onClick={() => {
                                onSpeedChange(rate);
                                setShowSpeedMenu(false);
                              }}
                              className={`rounded px-1.5 py-1 text-center text-[11px] font-medium transition-colors ${
                                Math.abs(playbackRate - rate) < 0.05
                                  ? "bg-amber-400 text-black font-bold"
                                  : "text-white/70 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PiP & Fullscreen */}
                  {video && (
                    <>
                      <button
                        aria-label="Picture-in-picture"
                        onClick={handleTogglePiP}
                        className={`grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-white/10 ${
                          pip ? "bg-white/15 text-white" : "text-white/75 hover:text-white"
                        }`}
                      >
                        <PictureInPicture2 className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Fullscreen"
                        onClick={onToggleFullscreen}
                        className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                      >
                        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
