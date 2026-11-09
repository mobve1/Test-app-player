import React from "react";
import { Sliders, RotateCcw, Sun, Contrast, Sparkles, X } from "lucide-react";
import {
  type VideoFilterSettings,
  DEFAULT_FILTERS,
  FILTER_PRESETS,
} from "../../types/player";

interface VideoFXPanelProps {
  filters: VideoFilterSettings;
  onChange: (filters: VideoFilterSettings) => void;
  onClose?: () => void;
  className?: string;
}

export const VideoFXPanel: React.FC<VideoFXPanelProps> = ({
  filters,
  onChange,
  onClose,
  className = "",
}) => {
  const handleSliderChange = (
    key: "brightness" | "contrast" | "saturation",
    val: number
  ) => {
    onChange({
      ...filters,
      [key]: val,
      preset: "normal", // Custom adjustment clears predefined preset
    });
  };

  const handleApplyPreset = (presetKey: "normal" | "dark_boost" | "high_contrast") => {
    onChange({ ...FILTER_PRESETS[presetKey].filters });
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_FILTERS });
  };

  const isCustom =
    filters.brightness !== 100 ||
    filters.contrast !== 100 ||
    filters.saturation !== 100;

  return (
    <div
      className={`glass-panel rounded-2xl border border-white/15 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-xl ${className}`}
    >
      {/* Header */}
      <div className="mb-3.5 flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[#38bdf8]" />
          <span className="text-xs font-bold tracking-wide uppercase text-white/90">
            Video FX & Filters
          </span>
          {isCustom && (
            <span className="rounded-full bg-[#38bdf8]/20 px-2 py-0.5 text-[10px] font-semibold text-[#38bdf8]">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            title="Reset Filters to Default"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-medium text-white/50">
          Exposure & Gamma Presets
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["normal", "dark_boost", "high_contrast"] as const).map((pk) => {
            const active = filters.preset === pk && !isCustom && pk === "normal"
              ? true
              : filters.preset === pk && (pk !== "normal" || !isCustom);
            return (
              <button
                key={pk}
                onClick={() => handleApplyPreset(pk)}
                className={`rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition-all ${
                  active
                    ? "bg-[#38bdf8]/25 text-[#38bdf8] ring-1 ring-[#38bdf8]/50 shadow-sm"
                    : "bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {FILTER_PRESETS[pk].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {/* Brightness */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-white/70">
              <Sun className="h-3.5 w-3.5 text-amber-400" /> Brightness
            </span>
            <span className="font-mono text-[11px] text-white/90">
              {filters.brightness}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={filters.brightness}
            onChange={(e) => handleSliderChange("brightness", Number(e.target.value))}
            className="range w-full"
            style={
              {
                "--p": `${(filters.brightness / 200) * 100}%`,
                "--c": "#38bdf8",
              } as React.CSSProperties
            }
          />
        </div>

        {/* Contrast */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-white/70">
              <Contrast className="h-3.5 w-3.5 text-indigo-400" /> Contrast
            </span>
            <span className="font-mono text-[11px] text-white/90">
              {filters.contrast}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={filters.contrast}
            onChange={(e) => handleSliderChange("contrast", Number(e.target.value))}
            className="range w-full"
            style={
              {
                "--p": `${(filters.contrast / 200) * 100}%`,
                "--c": "#818cf8",
              } as React.CSSProperties
            }
          />
        </div>

        {/* Saturation */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-white/70">
              <Sparkles className="h-3.5 w-3.5 text-pink-400" /> Saturation
            </span>
            <span className="font-mono text-[11px] text-white/90">
              {filters.saturation}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={filters.saturation}
            onChange={(e) => handleSliderChange("saturation", Number(e.target.value))}
            className="range w-full"
            style={
              {
                "--p": `${(filters.saturation / 200) * 100}%`,
                "--c": "#f472b6",
              } as React.CSSProperties
            }
          />
        </div>
      </div>
    </div>
  );
};
