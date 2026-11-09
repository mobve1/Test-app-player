import type { ListenMode } from "../api";
import type { PlaybackState } from "../api";

export type PlayerMode = "simple" | "standard" | "pro";

export type VideoQuality = "Auto" | "1080p" | "720p" | "480p" | "360p" | "144p" | "Audio Only";

export interface VideoFilterSettings {
  brightness: number; // 0 - 200%
  contrast: number;   // 0 - 200%
  saturation: number; // 0 - 200%
  preset: "normal" | "dark_boost" | "high_contrast";
}

export const DEFAULT_FILTERS: VideoFilterSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  preset: "normal"
};

export const FILTER_PRESETS: Record<"normal" | "dark_boost" | "high_contrast", {
  label: string;
  filters: VideoFilterSettings;
}> = {
  normal: {
    label: "Normal",
    filters: { brightness: 100, contrast: 100, saturation: 100, preset: "normal" }
  },
  dark_boost: {
    label: "Dark Scene Boost",
    filters: { brightness: 135, contrast: 115, saturation: 110, preset: "dark_boost" }
  },
  high_contrast: {
    label: "High Contrast",
    filters: { brightness: 105, contrast: 140, saturation: 120, preset: "high_contrast" }
  }
};

export function getFilterCss(f: VideoFilterSettings): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%)`;
}

export interface DiagnosticStats {
  resolution: string;
  fps: number;
  playbackRate: number;
  bufferedPercent: number;
  bufferedSecondsAhead: number;
  currentTimeFormatted: string;
  durationFormatted: string;
  audioState: string;
  audioSampleRate: number;
}

export interface PlayerSharedProps {
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
  onPlayerModeChange?: (mode: PlayerMode) => void;
}
