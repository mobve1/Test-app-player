import React, { useRef, useState, useEffect, useCallback } from "react";
import type { ListenMode, PlaybackState } from "../../api";
import { ConfirmPlayback } from "../../api";
import { audioEngine } from "../../audio";
import type { PlayerMode } from "../../types/player";
import { useGlobalHotkeys } from "../../hooks/useGlobalHotkeys";
import { SimplePlayer } from "./SimplePlayer";
import { StandardGlassPlayer } from "./StandardGlassPlayer";
import { ProFastStreamPlayer } from "./ProFastStreamPlayer";

export interface MultiPlayerProps {
  video: boolean;
  listen: ListenMode;
  listenLabel: string;
  streamUrl: string;
  thumbnail: string;
  title: string;
  isPlaying: boolean;
  playback: PlaybackState | null;
  onPauseAt: (position: number) => void;
  onResumeAt: (position: number) => void;
  onSeekTo: (position: number) => void;
  playerMode: PlayerMode;
  onListenChange?: (mode: ListenMode) => void;
}

export const MultiPlayer: React.FC<MultiPlayerProps> = ({
  video,
  listen,
  listenLabel,
  streamUrl,
  thumbnail,
  title,
  isPlaying,
  playback,
  onPauseAt,
  onResumeAt,
  onSeekTo,
  playerMode,
  onListenChange,
}) => {
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(1);
  const [full, setFull] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const confirmedGeneration = useRef(0);

  // Safe play/pause helpers to avoid DOMException play/pause promise collision
  const safePlayVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el || !video || !streamUrl) return;
    try {
      const p = el.play();
      if (p !== undefined) {
        playPromiseRef.current = p;
        p.catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[video] play blocked:", err);
          }
        });
      }
    } catch {
      // safe fallback
    }
  }, [video, streamUrl]);

  const safePauseVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playPromiseRef.current) {
      playPromiseRef.current
        .then(() => el.pause())
        .catch(() => el.pause());
    } else {
      el.pause();
    }
  }, []);

  // ── Master sync: Python backend & Web Audio Multi-Stem Engine ──────────
  useEffect(() => {
    const el = videoRef.current;
    if (!playback) return;

    if (playback.state === "ready" && playback.generation > confirmedGeneration.current) {
      confirmedGeneration.current = playback.generation;
      if (el) {
        el.pause();
        el.currentTime = playback.position;
      }

      const vocalsUrl = playback.vocals;
      const instUrl = playback.instrumental;
      const mediaId =
        playback.media_id ||
        (streamUrl.includes("/cache/") ? streamUrl.split("/cache/")[1]?.split("/")[0] : undefined) ||
        (streamUrl.includes("/api/media/") ? streamUrl.split("/api/media/")[1]?.split("/")[0] : undefined) ||
        "current";

      const loadPromise =
        vocalsUrl && instUrl
          ? audioEngine.loadStems(vocalsUrl, instUrl)
          : audioEngine.loadStems(mediaId);

      loadPromise
        .then(() => {
          audioEngine.seek(playback.position);
          audioEngine.setMode(listen);
          ConfirmPlayback(playback.generation);
          if (isPlaying) {
            safePlayVideo();
            audioEngine.play();
          }
        })
        .catch((err) => {
          console.warn("[audioEngine] Stem load fallback:", err);
          ConfirmPlayback(playback.generation);
        });
      return;
    }

    if (playback.state === "idle" || playback.state === "error") {
      safePauseVideo();
      audioEngine.pause();
    }
  }, [playback, streamUrl, listen, isPlaying, safePlayVideo, safePauseVideo]);

  // Seamless 40ms crossfade on mode change
  useEffect(() => {
    audioEngine.setMode(listen);
  }, [listen]);

  // Reset timestamps when new stream loads
  useEffect(() => {
    setT(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    audioEngine.seek(0);
  }, [streamUrl]);

  // Sync Video timeupdate, durationchange, waiting, playing, ended
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handleTime = () => {
      setT(v.currentTime);
      // Continuous clock sync: lock audio stems to video clock
      if (isPlaying && audioEngine.hasStems()) {
        audioEngine.syncTo(v.currentTime, 0.08);
      }
    };

    const handleDur = () => {
      if (!isNaN(v.duration) && v.duration > 0) {
        setDur(v.duration);
      }
    };

    const handleWaiting = () => {
      // Video is buffering: pause audio to prevent desync
      audioEngine.pause();
    };

    const handlePlaying = () => {
      // Video resumed: sync and resume stems
      if (isPlaying && audioEngine.hasStems()) {
        audioEngine.syncTo(v.currentTime);
        audioEngine.play();
      }
    };

    const handleEnded = () => {
      safePauseVideo();
      audioEngine.pause();
      onPauseAt(v.duration || dur);
    };

    v.addEventListener("timeupdate", handleTime);
    v.addEventListener("durationchange", handleDur);
    v.addEventListener("waiting", handleWaiting);
    v.addEventListener("playing", handlePlaying);
    v.addEventListener("ended", handleEnded);

    return () => {
      v.removeEventListener("timeupdate", handleTime);
      v.removeEventListener("durationchange", handleDur);
      v.removeEventListener("waiting", handleWaiting);
      v.removeEventListener("playing", handlePlaying);
      v.removeEventListener("ended", handleEnded);
    };
  }, [videoRef, streamUrl, isPlaying, dur, onPauseAt, safePauseVideo]);

  // Audio Engine time update fallback if video is disabled
  useEffect(() => {
    if (!video) {
      audioEngine.onTimeUpdate((time) => setT(time));
      audioEngine.onEnded(() => {
        audioEngine.pause();
        onPauseAt(dur);
      });
    }
  }, [video, dur, onPauseAt]);

  // Fullscreen change listener
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      containerRef.current?.requestFullscreen().catch(console.error);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const pos = videoRef.current?.currentTime ?? (audioEngine.hasStems() ? audioEngine.getCurrentTime() : t);
    if (isPlaying) {
      safePauseVideo();
      audioEngine.pause();
      onPauseAt(pos);
    } else {
      safePlayVideo();
      if (audioEngine.hasStems()) {
        audioEngine.seek(pos);
        audioEngine.play();
      }
      onResumeAt(pos);
    }
  }, [isPlaying, t, safePlayVideo, safePauseVideo, onPauseAt, onResumeAt]);

  const seekTo = useCallback(
    (position: number) => {
      const next = Math.max(0, Math.min(dur, position));
      setT(next);
      if (videoRef.current) {
        videoRef.current.currentTime = next;
      }
      audioEngine.seek(next);
      onSeekTo(next);
    },
    [dur, onSeekTo]
  );

  const seekRelative = useCallback(
    (delta: number) => {
      const current = videoRef.current?.currentTime ?? (audioEngine.hasStems() ? audioEngine.getCurrentTime() : t);
      seekTo(current + delta);
    },
    [t, seekTo]
  );

  // Frame stepping: 1 frame ~ 1/30 = 0.0333s
  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      const current = videoRef.current?.currentTime ?? (audioEngine.hasStems() ? audioEngine.getCurrentTime() : t);
      const frameDuration = 1 / 30;
      seekTo(current + direction * frameDuration);
    },
    [t, seekTo]
  );

  const changeSpeedRelative = useCallback((delta: number) => {
    setPlaybackRate((prev) => {
      const next = Math.max(0.25, Math.min(3.0, Math.round((prev + delta) * 10) / 10));
      return next;
    });
  }, []);

  const setExactSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.25, Math.min(3.0, speed));
    setPlaybackRate(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
    const current = audioEngine.getPlaybackRate();
    if (current) {
      // Toggle handled in player volume state
    }
  }, []);

  // ── Unified Global Hotkeys Hook ──────────────────────────────────────────
  const { toast } = useGlobalHotkeys({
    onTogglePlay: togglePlay,
    onSeekRelative: seekRelative,
    onStepFrame: stepFrame,
    onChangeSpeedRelative: changeSpeedRelative,
    onToggleFullscreen: toggleFullscreen,
    onToggleMute: toggleMute,
    isPlaying,
    isPaused: !isPlaying,
    enabled: true,
  });

  return (
    <div className="relative">
      {/* Hotkey Toast OSD (YouTube / VLC style) */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-50 -translate-x-1/2 animate-[pop_.12s_ease-out]">
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/80 px-4 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-[#1ed760] animate-pulse" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Dynamic Player Mode Switcher */}
      {playerMode === "simple" && (
        <SimplePlayer
          video={video}
          streamUrl={streamUrl}
          thumbnail={thumbnail}
          title={title}
          listen={listen}
          listenLabel={listenLabel}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          currentTime={t}
          duration={dur}
          onSeek={seekTo}
          videoRef={videoRef}
          containerRef={containerRef}
          isFullscreen={full}
          onToggleFullscreen={toggleFullscreen}
          onListenChange={onListenChange}
        />
      )}

      {playerMode === "standard" && (
        <StandardGlassPlayer
          video={video}
          streamUrl={streamUrl}
          thumbnail={thumbnail}
          title={title}
          listen={listen}
          listenLabel={listenLabel}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          currentTime={t}
          duration={dur}
          onSeek={seekTo}
          videoRef={videoRef}
          containerRef={containerRef}
          isFullscreen={full}
          onToggleFullscreen={toggleFullscreen}
        />
      )}

      {playerMode === "pro" && (
        <ProFastStreamPlayer
          video={video}
          streamUrl={streamUrl}
          thumbnail={thumbnail}
          title={title}
          listen={listen}
          listenLabel={listenLabel}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          currentTime={t}
          duration={dur}
          onSeek={seekTo}
          onStepFrame={stepFrame}
          playbackRate={playbackRate}
          onSpeedChange={setExactSpeed}
          videoRef={videoRef}
          containerRef={containerRef}
          isFullscreen={full}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
};
