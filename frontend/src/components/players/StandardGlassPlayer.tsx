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
} from "lucide-react";
import type { ListenMode } from "../../api";
import { SetVolume } from "../../api";
import { audioEngine } from "../../audio";

const TINT: Record<ListenMode, string> = {
  vocals: "#1ed760",
  music: "#38bdf8",
  original: "#a855f7",
};

interface StandardGlassPlayerProps {
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
}

export const StandardGlassPlayer: React.FC<StandardGlassPlayerProps> = ({
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
  videoRef,
  containerRef,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [vol, setVol] = useState(70);
  const [muted, setMuted] = useState(false);
  const [pip, setPip] = useState(false);

  const color = TINT[listen];
  const pipOn = pip && video;

  useEffect(() => {
    const targetVol = muted ? 0 : vol / 100;
    if (videoRef.current) {
      videoRef.current.volume = targetVol;
    }
    audioEngine.setVolume(targetVol);
    SetVolume(targetVol).catch(console.error);
  }, [vol, muted, videoRef]);

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

  const fmt = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
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
            background: `radial-gradient(ellipse at 50% 40%, ${color}22 0%, rgba(10,10,12,0.95) 75%)`,
            display: video && streamUrl ? "none" : "block",
          }}
        />
      )}

      {/* Video Element */}
      {streamUrl && video && (
        <video
          ref={videoRef}
          src={streamUrl.startsWith("http") ? streamUrl : `http://127.0.0.1:8000${streamUrl}`}
          poster={thumbnail}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
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
              {Array.from({ length: 40 }, (_, i) => (
                <span
                  key={i}
                  className="eq-bar"
                  style={{
                    background: color,
                    opacity: 0.85,
                    animationDelay: `${(i * 83) % 700}ms`,
                    animationDuration: `${600 + ((i * 47) % 500)}ms`,
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

          {/* Active Stem Tag */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs backdrop-blur-md">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: color, opacity: isPlaying ? 1 : 0.5 }}
            />
            {listenLabel}
          </div>

          {/* Center Play Button Overlay */}
          {!isPlaying && !streamUrl && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span
                className="grid h-[72px] w-[72px] place-items-center rounded-full text-black shadow-2xl ring-8 ring-white/10"
                style={{ background: color }}
              >
                <Play className="ml-1 h-8 w-8 fill-current" />
              </span>
            </div>
          )}

          {/* Glass Controls Overlay Bar */}
          <div
            className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 focus-within:opacity-100 ${
              isPlaying && video ? "opacity-0 group-hover:opacity-100" : ""
            }`}
          >
            <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-12">
              {/* Scrubber Bar */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seekFromPointer(e);
                }}
                onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
                className="group/bar flex h-4 cursor-pointer items-center"
              >
                <div className="relative h-1 w-full rounded-full bg-white/15 transition-all group-hover/bar:h-1.5">
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

              {/* Bottom Buttons */}
              <div className="mt-1 flex items-center gap-0.5 text-white">
                <button
                  aria-label="Back to start"
                  onClick={() => onSeek(0)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <SkipBack className="h-4 w-4" />
                </button>

                <button
                  aria-label={isPlaying ? "Pause" : "Play"}
                  onClick={onTogglePlay}
                  className="mx-1 grid h-10 w-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
                >
                  <PlayIcon className="h-5 w-5 fill-current" />
                </button>

                <button
                  aria-label="Forward 10 seconds"
                  onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                  className="grid h-9 w-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

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
                  className="range w-20"
                  onChange={(e) => {
                    setVol(Number(e.target.value));
                    setMuted(false);
                  }}
                  style={{ "--p": `${sv}%`, "--c": color } as React.CSSProperties}
                />

                <span className="ml-3 text-xs tabular-nums text-white/70">
                  {fmt(currentTime)} / {fmt(duration)}
                </span>

                {title && (
                  <span className="ml-4 max-w-[200px] truncate text-xs text-white/50">
                    {title}
                  </span>
                )}

                <div className="flex-1" />

                {video && (
                  <>
                    <button
                      aria-label={pip ? "Exit picture-in-picture" : "Picture-in-picture"}
                      onClick={handleTogglePiP}
                      className={`grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-white/10 ${
                        pip ? "bg-white/15 text-white" : "text-white/75 hover:text-white"
                      }`}
                    >
                      <PictureInPicture2 className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
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
        </>
      )}
    </div>
  );
};
