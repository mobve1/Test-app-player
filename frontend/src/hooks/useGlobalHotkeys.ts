import { useEffect, useState, useCallback, useRef } from "react";

export interface HotkeyActions {
  onTogglePlay: () => void;
  onSeekRelative: (seconds: number) => void;
  onStepFrame: (direction: -1 | 1) => void;
  onChangeSpeedRelative: (delta: number) => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  enabled?: boolean;
}

export interface HotkeyFeedback {
  message: string;
  icon?: string;
  id: number;
}

export function useGlobalHotkeys({
  onTogglePlay,
  onSeekRelative,
  onStepFrame,
  onChangeSpeedRelative,
  onToggleFullscreen,
  onToggleMute,
  isPaused,
  enabled = true,
}: HotkeyActions) {
  const [toast, setToast] = useState<HotkeyFeedback | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, icon?: string) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    const id = Date.now();
    setToast({ message, icon, id });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 1400);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture hotkeys if the user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore if Control or Meta (Cmd) is pressed to avoid breaking browser shortcuts (like Ctrl+R, Ctrl+F, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key;
      const shift = e.shiftKey;

      // 1. Play / Pause toggle: Space or 'k' / 'K'
      if (key === " " || key === "k" || key === "K") {
        e.preventDefault();
        onTogglePlay();
        showToast(isPaused ? "Play" : "Pause");
        return;
      }

      // 2. Mute toggle: 'm' / 'M'
      if (key === "m" || key === "M") {
        e.preventDefault();
        onToggleMute();
        showToast("Mute toggled", "volume");
        return;
      }

      // 3. Fullscreen toggle: 'f' / 'F'
      if (key === "f" || key === "F") {
        e.preventDefault();
        onToggleFullscreen();
        showToast("Fullscreen toggled", "screen");
        return;
      }

      // 4. Seek backward / forward:
      // Shift + Left/Right: 1s precision seek
      // ArrowLeft / ArrowRight or 'j' / 'l': 5s seek
      if (key === "ArrowLeft" || key === "j" || key === "J") {
        e.preventDefault();
        const delta = shift ? -1 : -5;
        onSeekRelative(delta);
        showToast(`Seek ${delta}s`);
        return;
      }

      if (key === "ArrowRight" || key === "l" || key === "L") {
        e.preventDefault();
        const delta = shift ? 1 : 5;
        onSeekRelative(delta);
        showToast(`Seek +${delta}s`);
        return;
      }

      // 5. Playback Speed: '[' (decrease -0.1x) / ']' (increase +0.1x)
      if (key === "[") {
        e.preventDefault();
        onChangeSpeedRelative(-0.1);
        showToast("Speed -0.1x");
        return;
      }

      if (key === "]") {
        e.preventDefault();
        onChangeSpeedRelative(0.1);
        showToast("Speed +0.1x");
        return;
      }

      // 6. Frame stepping when paused: ',' (step back) / '.' (step forward)
      if (key === ",") {
        e.preventDefault();
        onStepFrame(-1);
        showToast("Frame -1 (1/30s)");
        return;
      }

      if (key === ".") {
        e.preventDefault();
        onStepFrame(1);
        showToast("Frame +1 (1/30s)");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [
    enabled,
    onTogglePlay,
    onSeekRelative,
    onStepFrame,
    onChangeSpeedRelative,
    onToggleFullscreen,
    onToggleMute,
    isPaused,
    showToast,
  ]);

  return { toast };
}
