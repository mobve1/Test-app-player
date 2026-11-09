import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPE, type ReactNode } from "react";
import {
  Check, ChevronDown, Cpu, EyeOff, Globe, Headphones, Languages, Layers, Link2, Loader2, Lock, Maximize,
  Mic, Minimize, Music, Pause, PictureInPicture2, Play, ShieldCheck, SkipBack, SkipForward, Sparkles,
  Trash2, Video, Volume1, Volume2, VolumeX, Waves, X, Zap, Settings, PanelLeftOpen, Sliders, Gauge, Activity,
  BarChart2
} from "lucide-react";

import {
  StartStream, StopStream, ChangeMode, ConfirmPlayback, PauseStreamAt, ResumeStreamAt,
  SetVolume, SeekStream, GetModels, GetHardwareSpecs, SelectModel, GetStats,
  EventsOn, EventsOff, WindowMinimise, WindowToggleMaximise, Quit,
  type ModelInfo, type HardwareSpecs, type PlaybackState, type FullTelemetry
} from "./api";
import { audioEngine } from "./audio";
import { MultiPlayer } from "./components/players/MultiPlayer";
import { StatusBar } from "./components/StatusBar";
import { StatsModal } from "./components/StatsModal";
import type { PlayerMode, VideoQuality } from "./types/player";

type Listen = "vocals" | "music" | "original";
type MediaType = "audio" | "video";
type Opt = { label: string; hint?: string };

const opts = (a: string[]): Opt[] => a.map((label) => ({ label }));
const LANGS = opts(["English", "العربية"]);
const PROCESSING = [
  { label: "Full Pre-processing", hint: "Best quality. Plays when finished.", icon: Layers },
  { label: "Live Processing", hint: "Instant start. Uses more CPU.", icon: Zap },
  { label: "Partial Pre-processing", hint: "Starts after the first minute.", icon: Sparkles },
];
const TINT: Record<Listen, string> = { vocals: "#1ed760", music: "#8b6cff", original: "#a1a1aa" };
const VIOLET = "#8b6cff";
const ic = "h-[18px] w-[18px]";
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
const poster = (c: string) =>
  `radial-gradient(120% 90% at 25% 15%, ${c}40, transparent 60%), radial-gradient(90% 80% at 85% 95%, #3b1d8f66, transparent 60%), linear-gradient(160deg,#1a1a24,#050507)`;

function getYouTubeThumbnail(u: string): string {
  const m = u.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : "";
}

/* ------------------------------ primitives ------------------------------ */

function Dropdown({ value, options, onChange, icon }: { value: string; options: Opt[]; onChange: (v: string) => void; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="field flex w-full items-center gap-2.5">
        <span className="text-white/45">{icon}</span>
        <span className="flex-1 truncate text-left">{value}</span>
        <ChevronDown className={`h-4 w-4 text-white/45 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul role="listbox" className="menu absolute left-0 right-0 top-full z-50 mt-2">
          {options.map((o) => (
            <li key={o.label} role="option" aria-selected={o.label === value}>
              <button className="menu-item" onClick={() => { onChange(o.label); setOpen(false); }}>
                <span><span className="block">{o.label}</span>{o.hint && <span className="block text-xs text-white/40">{o.hint}</span>}</span>
                {o.label === value && <Check className="h-4 w-4 text-[#1ed760]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, accent }: {
  options: { id: T; label: string; icon: ReactNode }[]; value: T; onChange: (v: T) => void; accent: string;
}) {
  const i = options.findIndex((o) => o.id === value);
  return (
    <div role="radiogroup" className="relative flex rounded-xl border border-white/[0.06] bg-black/40 p-1">
      <span aria-hidden className="seg-thumb absolute inset-y-1 left-1 rounded-lg"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${i * 100}%)`, background: accent }} />
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)}
          className={`relative z-10 flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${o.id === value ? "text-black" : "text-white/60 hover:text-white"}`}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, locked }: { checked: boolean; onChange?: (v: boolean) => void; label: string; locked?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} aria-disabled={locked} onClick={() => !locked && onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-[#1ed760]" : "bg-white/15"} ${locked ? "cursor-not-allowed opacity-60" : ""}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3"><h3 className="text-sm font-semibold text-white">{title}</h3>{children}</section>
);
const Label = ({ children }: { children: ReactNode }) => <div className="mb-1.5 text-xs font-medium text-white/50">{children}</div>;
const ToggleRow = ({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex gap-3"><span className="mt-0.5 shrink-0 text-white/45">{icon}</span>
      <div><div className="text-sm">{title}</div><div className="text-xs text-white/40">{hint}</div></div></div>
    {children}
  </div>
);
const IconBtn = ({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) => (
  <button aria-label={label} title={label} onClick={onClick}
    className={`grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-white/10 ${active ? "bg-white/15 text-white" : "text-white/75 hover:text-white"}`}>
    {children}
  </button>
);

/* ------------------------------- player configurations --------------------------------- */

const QUALITY_OPTIONS: Opt[] = [
  { label: "Auto (Best Available)", hint: "Highest resolution stream" },
  { label: "1080p (Full HD)", hint: "1920x1080 crisp video" },
  { label: "720p (HD)", hint: "1280x720 balanced performance" },
  { label: "480p (Standard)", hint: "854x480 standard definition" },
  { label: "360p (Data Saver)", hint: "640x360 lightweight stream" },
  { label: "144p (Ultra Low)", hint: "256x144 minimal bandwidth" },
  { label: "Audio Only (Lossless WAV)", hint: "Skip video download entirely" },
];

const QUALITY_MAP: Record<string, VideoQuality> = {
  "Auto (Best Available)": "Auto",
  "1080p (Full HD)": "1080p",
  "720p (HD)": "720p",
  "480p (Standard)": "480p",
  "360p (Data Saver)": "360p",
  "144p (Ultra Low)": "144p",
  "Audio Only (Lossless WAV)": "Audio Only",
};

const QUALITY_REVERSE_MAP: Record<string, string> = {
  Auto: "Auto (Best Available)",
  "1080p": "1080p (Full HD)",
  "720p": "720p (HD)",
  "480p": "480p (Standard)",
  "360p": "360p (Data Saver)",
  "144p": "144p (Ultra Low)",
  "Audio Only": "Audio Only (Lossless WAV)",
};

/* --------------------------------- app ---------------------------------- */

export default function App() {
  const [side, setSide] = useState(false);
  const [beautiful, setBeautiful] = useState(true);
  const [media, setMedia] = useState<MediaType>("video");
  const [listen, setListen] = useState<Listen>("vocals");
  const [proc, setProc] = useState(PROCESSING[0].label);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<Opt[]>([]);
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);
  const [language, setLanguage] = useState("English");
  const [proxy, setProxy] = useState("");
  const [antiTrack, setAntiTrack] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [url, setUrl] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [cache, setCache] = useState<"idle" | "clearing" | "done">("idle");
  const [streamUrl, setStreamUrl] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);

  // System dashboard & Telemetry states
  const [stats, setStats] = useState<FullTelemetry | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showStatusBar, setShowStatusBar] = useState<boolean>(() => {
    try {
      return localStorage.getItem("stemwave_show_statusbar") !== "false";
    } catch {
      return true;
    }
  });
  const [rawModels, setRawModels] = useState<ModelInfo[]>([]);

  // Multi-Player mode and Stream Quality with localStorage persistence
  const [playerMode, setPlayerMode] = useState<PlayerMode>(() => {
    try {
      const saved = localStorage.getItem("stemwave_player_mode");
      return (saved as PlayerMode) || "standard";
    } catch {
      return "standard";
    }
  });

  const [quality, setQuality] = useState<VideoQuality>(() => {
    try {
      const saved = localStorage.getItem("stemwave_quality");
      return (saved as VideoQuality) || "Auto";
    } catch {
      return "Auto";
    }
  });

  const handlePlayerModeChange = (mode: PlayerMode) => {
    setPlayerMode(mode);
    try {
      localStorage.setItem("stemwave_player_mode", mode);
    } catch {
      // safe fallback
    }
  };

  const handleQualityChange = (q: VideoQuality) => {
    setQuality(q);
    try {
      localStorage.setItem("stemwave_quality", q);
    } catch {
      // safe fallback
    }
  };

  const handleToggleStatusBar = (enabled: boolean) => {
    setShowStatusBar(enabled);
    try {
      localStorage.setItem("stemwave_show_statusbar", String(enabled));
    } catch {
      // safe fallback
    }
  };

  useEffect(() => {
    GetModels().then((items: ModelInfo[]) => {
      setRawModels(items);
      const found = items.map((item) => ({ label: item.name, hint: `${item.family} · ${item.compatibility.replace("_", " ")}` }));
      setModels(found);
      if (found.length) setModel(found[0].label);
    }).catch(console.error);
  }, []);

  // Real-time telemetry polling hook (1.5s interval)
  useEffect(() => {
    let mounted = true;
    const poll = () => {
      GetStats().then((data) => {
        if (mounted) setStats(data);
      }).catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => { GetHardwareSpecs().then((specs: HardwareSpecs) => setHardware(specs)).catch(console.error); }, []);

  // Auto-detect YouTube thumbnail as soon as user types or pastes URL
  useEffect(() => {
    const thumb = getYouTubeThumbnail(url);
    if (thumb) {
      setThumbnail(thumb);
    }
  }, [url]);

  useEffect(() => {
    EventsOn("status", (data: unknown) => {
      const d = data as { state: string; message: string };
      if (d.message) setStatusMsg(d.message);
      if (d.state === "error") {
        setProgress(null);
        setIsPlaying(false);
      } else if (d.state === "idle") {
        setProgress(null);
        setIsPlaying(false);
      } else if (d.state === "paused") {
        setIsPlaying(false);
      } else if (d.state === "loading" || d.state === "buffering") {
        setProgress((p) => Math.min(95, (p || 0) + 15));
      } else if (d.state === "playing") {
        setProgress(100);
        setIsPlaying(true);
      }
    });

    EventsOn("mediaInfo", (data: unknown) => {
      const d = data as { videoUrl?: string; thumbnail?: string; title?: string };
      if (d.thumbnail) setThumbnail(d.thumbnail);
      if (d.title) setTitle(d.title);
      if (d.videoUrl) {
        const fullUrl = d.videoUrl.startsWith("http")
          ? d.videoUrl
          : `http://127.0.0.1:8000${d.videoUrl.startsWith("/") ? "" : "/"}${d.videoUrl}`;
        setStreamUrl(fullUrl);
      }
    });

    EventsOn("playbackState", (data: unknown) => {
      setPlayback(data as PlaybackState);
    });

    return () => {
      EventsOff("status");
      EventsOff("mediaInfo");
      EventsOff("playbackState");
    };
  }, []);

  const clearCache = () => {
    if (cache !== "idle") return;
    setCache("clearing");
    setTimeout(() => { setCache("done"); setTimeout(() => setCache("idle"), 2500); }, 1200);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && setSide(false);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const busy = progress !== null && progress < 100;
  const isolating = listen !== "original";
  const listenOptions = [
    { id: "vocals" as const, label: "Vocals Only", icon: <Mic className="h-4 w-4" /> },
    { id: "music" as const, label: "Music Only", icon: <Music className="h-4 w-4" /> },
    { id: "original" as const, label: "Original (Natural)", icon: <Waves className="h-4 w-4" /> },
  ];
  const listenLabel = listenOptions.find((o) => o.id === listen)!.label;

  const handlePauseAt = async (position: number) => {
    setIsPlaying(false);
    await PauseStreamAt(position).catch(console.error);
  };

  const handleResumeAt = async (position: number) => {
    setIsPlaying(true);
    await ResumeStreamAt(position).catch(console.error);
  };

  const handleSeekTo = async (position: number) => {
    await SeekStream(position).catch(console.error);
  };

  const handleClear = async () => {
    setUrl("");
    setStreamUrl("");
    setThumbnail("");
    setTitle("");
    setProgress(null);
    setIsPlaying(false);
    await StopStream().catch(console.error);
  };

  const go = async () => {
    if (!url.trim() || busy) return;
    setProgress(5);
    setStatusMsg("Starting stream...");
    setIsPlaying(false);
    try {
      // Pass URL, listening mode, media format, and quality to backend
      const su = await StartStream(url.trim(), listen, media, quality);
      if (media === "video" && su) {
        const fullUrl = su.startsWith("http")
          ? su
          : `http://127.0.0.1:8000${su.startsWith("/") ? "" : "/"}${su}`;
        setStreamUrl(fullUrl);
      } else if (media !== "video") {
        setStreamUrl("");
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(String(err));
      setProgress(null);
      setIsPlaying(false);
    }
  };

  return (
    <div className={`${beautiful ? "beautiful" : "lite"} app-bg relative flex h-screen w-screen overflow-hidden text-white`}>
      {beautiful && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/3 h-96 w-96 rounded-full opacity-25 blur-[110px] transition-colors duration-700" style={{ background: TINT[listen] }} />
          <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[#5b3df5] opacity-20 blur-[110px]" />
        </div>
      )}

      {/* Settings drawer */}
      <div aria-hidden onClick={() => setSide(false)} className="absolute inset-0 z-30 bg-black/55 transition-opacity duration-300"
        style={{ opacity: side ? 1 : 0, pointerEvents: side ? "auto" : "none" }} />
      <aside data-open={side} aria-label="Settings" className="sidebar absolute inset-y-0 left-0 z-40 flex h-full w-[300px] flex-col shadow-2xl"
        style={{ transform: side ? "none" : "translateX(-100%)" }}>
        <div className="scroll flex-1 space-y-7 overflow-y-auto p-5">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="h-5 w-5 text-white/60" />Settings</h2><IconBtn label="Close settings" onClick={() => setSide(false)}><X className="h-[18px] w-[18px]" /></IconBtn></div>

          {/* Player Architecture Switcher */}
          <Group title="Player & Display Engine">
            <div>
              <Label>Player Architecture</Label>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.06] bg-black/40 p-1">
                {(["simple", "standard", "pro"] as const).map((m) => {
                  const active = playerMode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => handlePlayerModeChange(m)}
                      className={`rounded-lg py-2 text-center text-xs font-semibold capitalize transition-all ${
                        active
                          ? "bg-[#1ed760] text-black shadow-md font-bold"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      {m === "simple" ? "Simple" : m === "standard" ? "Glass" : "Pro"}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-white/40">
                {playerMode === "simple" && "Ultra-lightweight minimal HTML5 controls."}
                {playerMode === "standard" && "Glassmorphism design with stem-control sliders."}
                {playerMode === "pro" && "Video FX filters, frame-by-frame stepping & HUD diagnostics."}
              </p>
            </div>
          </Group>

          {/* Granular Quality Settings */}
          <Group title="Stream & Download Quality">
            <div>
              <Label>Default Quality Preference</Label>
              <Dropdown
                value={QUALITY_REVERSE_MAP[quality] || "Auto (Best Available)"}
                options={QUALITY_OPTIONS}
                onChange={(selectedLabel) => {
                  const mapped = QUALITY_MAP[selectedLabel] || "Auto";
                  handleQualityChange(mapped);
                }}
                icon={<Sliders className="h-4 w-4" />}
              />
              <p className="mt-1.5 text-xs text-white/40">
                Stored in local storage. Commands yt-dlp to request chosen resolution stream.
              </p>
            </div>
          </Group>

          <Group title="Network">
            <div>
              <Label>Proxy server</Label>
              <div className="field flex items-center gap-2.5 focus-within:ring-2 focus-within:ring-[#1ed760]/60">
                <Globe className="h-4 w-4 text-white/45" />
                <input value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="http://127.0.0.1:7890" spellCheck={false}
                  className="min-w-0 flex-1 select-text bg-transparent outline-none placeholder:text-white/30" />
              </div>
            </div>
          </Group>

          <Group title="AI & language">
            <div><Label>Model</Label><Dropdown value={model || "No ONNX models found"} options={models} onChange={(next) => { setModel(next); SelectModel(next).catch(console.error); }} icon={<Cpu className="h-4 w-4" />} /></div>
            {hardware && <div className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-xs text-white/60"><div className="mb-1.5 flex items-center justify-between text-sm text-white/85"><span>Hardware profile</span><span className={hardware.executionProvider === "CPU" ? "text-amber-300" : "text-[#1ed760]"}>{hardware.executionProvider}</span></div><div>{hardware.cpuCores} logical cores · {hardware.ramGB ? `${hardware.ramGB.toFixed(1)} GB RAM` : "RAM unavailable"}</div><div className="mt-1 truncate">{hardware.gpuName || "GPU unavailable"}{hardware.vramGB ? ` · ${hardware.vramGB.toFixed(1)} GB VRAM` : ""}</div></div>}
            <div><Label>Language</Label><Dropdown value={language} options={LANGS} onChange={setLanguage} icon={<Languages className="h-4 w-4" />} /></div>
          </Group>

          <Group title="Privacy & security">
            <ToggleRow icon={<ShieldCheck className="h-4 w-4" />} title="DNS over HTTPS (DoH)" hint="Always on. Lookups stay encrypted."><Switch checked locked label="DNS over HTTPS, always on" /></ToggleRow>
            <ToggleRow icon={<EyeOff className="h-4 w-4" />} title="Anti-Tracking / No-Cookies" hint="Blocks trackers and stores no cookies."><Switch checked={antiTrack} locked label="Anti-tracking and no cookies" /></ToggleRow>
            <ToggleRow icon={<Lock className="h-4 w-4" />} title="Encrypt Cached Files" hint="Protects processed audio on disk."><Switch checked={encrypt} onChange={setEncrypt} label="Encrypt cached files" /></ToggleRow>
          </Group>

          <Group title="Performance & Monitoring">
            <ToggleRow icon={beautiful ? <Sparkles className="h-4 w-4 text-[#1ed760]" /> : <Zap className="h-4 w-4 text-amber-300" />}
              title={beautiful ? "Beautiful Mode" : "Lite Mode"} hint={beautiful ? "Blur, glass and animations are on." : "Blur and animations are off for speed."}>
              <Switch checked={beautiful} onChange={setBeautiful} label="Beautiful Mode" />
            </ToggleRow>
            <ToggleRow icon={<Activity className="h-4 w-4 text-[#1ed760]" />}
              title="System Telemetry Bar" hint="Live VRAM, CPU, RAM & download meters at screen bottom.">
              <Switch checked={showStatusBar} onChange={handleToggleStatusBar} label="System Telemetry Bar" />
            </ToggleRow>
            <div className="pt-1">
              <button
                onClick={() => {
                  setSide(false);
                  setShowStatsModal(true);
                }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-white/90 transition-all hover:bg-white/10 hover:border-white/20 active:scale-[0.98]"
              >
                <BarChart2 className="h-4 w-4 text-[#1ed760]" />
                Open AI & Hardware Analytics
              </button>
            </div>
          </Group>

          <Group title="Maintenance">
            <button onClick={clearCache} disabled={cache === "clearing"}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${cache === "done" ? "border-[#1ed760]/40 bg-[#1ed760]/10 text-[#1ed760]" : "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"}`}>
              {cache === "clearing" ? <Loader2 className="h-4 w-4 animate-spin" /> : cache === "done" ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              {cache === "clearing" ? "Clearing…" : cache === "done" ? "Cache cleared" : "Clear Cache & Temp Files"}
            </button>
            <p className="text-xs text-white/40">Deletes downloaded and processed audio. Your settings are kept.</p>
          </Group>
        </div>
      </aside>

      {/* Main */}
      <main className="scroll relative z-10 min-w-0 flex-1 overflow-y-auto px-6 pt-6 pb-20">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div className="drag-region flex h-10 items-center justify-between">
            <div className="no-drag flex items-center gap-3">
              <IconBtn label="Open settings" onClick={() => setSide(true)}><PanelLeftOpen className="h-[18px] w-[18px]" /></IconBtn>
              <div className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-[#1ed760]" />Stemwave</div>
            </div>
            <div className="no-drag flex items-center gap-2">
              <button
                onClick={() => setShowStatsModal(true)}
                title="System & AI Analytics Dashboard"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
              >
                <BarChart2 className="h-3.5 w-3.5 text-[#1ed760]" />
                <span className="hidden sm:inline">Analytics</span>
              </button>
              <div className="flex gap-1">
                <IconBtn label="Minimize window" onClick={WindowMinimise}><Minimize className={ic}/></IconBtn>
                <IconBtn label="Maximize window" onClick={WindowToggleMaximise}><Maximize className={ic}/></IconBtn>
                <IconBtn label="Close window" onClick={Quit}><X className={ic}/></IconBtn>
              </div>
            </div>
          </div>

          {/* 1. URL bar */}
          <div>
            <div className="glass-panel flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-[#1ed760]/50">
              <Link2 className="h-4 w-4 shrink-0 text-white/40" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste YouTube or media link..." spellCheck={false}
                className="min-w-0 flex-1 select-text bg-transparent text-sm outline-none placeholder:text-white/35" />
              {url && (
                <button aria-label="Clear link" onClick={handleClear} className="grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button disabled={!url.trim() || busy} onClick={go}
                className="flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-black transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: isolating ? VIOLET : "#1ed760" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isolating ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
                {busy ? "Processing" : isolating ? "Isolate" : "Play"}
              </button>
            </div>
            {progress !== null && (
              <div className="mt-3 px-3">
                <div className="mb-1.5 flex justify-between text-xs text-white/55">
                  <span className="truncate">{statusMsg || (busy ? `Processing with ${model.split(" ")[0]}...` : "Stems ready")}</span>
                  <span className="tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full transition-[width] duration-200 ${busy ? "shimmer" : ""}`} style={{ width: `${progress}%`, background: VIOLET }} />
                </div>
              </div>
            )}
          </div>

          {/* 2. Multi-Player System (Simple, Standard Glass, Pro FastStream) */}
          <MultiPlayer
            video={media === "video"}
            listen={listen}
            listenLabel={listenLabel}
            streamUrl={streamUrl}
            thumbnail={thumbnail}
            title={title}
            isPlaying={isPlaying}
            playback={playback}
            onPauseAt={handlePauseAt}
            onResumeAt={handleResumeAt}
            onSeekTo={handleSeekTo}
            playerMode={playerMode}
            onListenChange={(m) => {
              setListen(m);
              ChangeMode(m).catch(console.error);
            }}
          />

          {/* 3. Media type & Stream Quality */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Media type</Label>
              <Segmented value={media} onChange={setMedia} accent="#1ed760" options={[
                { id: "audio", label: "Audio Only", icon: <Headphones className="h-4 w-4" /> },
                { id: "video", label: "Video + Audio", icon: <Video className="h-4 w-4" /> },
              ]} />
            </div>

            <div>
              <Label>Stream Quality</Label>
              <Dropdown
                value={QUALITY_REVERSE_MAP[quality] || "Auto (Best Available)"}
                options={QUALITY_OPTIONS}
                onChange={(selectedLabel) => {
                  const mapped = QUALITY_MAP[selectedLabel] || "Auto";
                  handleQualityChange(mapped);
                }}
                icon={<Sliders className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* 4. Listening mode */}
          <div>
            <Label>Listening mode</Label>
            <Segmented
              options={listenOptions}
              value={listen}
              onChange={(v) => {
                setListen(v);
                ChangeMode(v).catch(console.error);
              }}
              accent={TINT[listen]}
            />
          </div>

          {/* 5. Processing mode */}
          <div>
            <Label>Processing mode</Label>
            <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
              {PROCESSING.map((p) => {
                const on = proc === p.label;
                return (
                  <button key={p.label} role="radio" aria-checked={on} onClick={() => setProc(p.label)}
                    className={`glass-panel rounded-xl p-3.5 text-left transition-shadow ${on ? "ring-2 ring-[#8b6cff]" : "hover:ring-1 hover:ring-white/25"}`}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <p.icon className="h-4 w-4 shrink-0" style={{ color: on ? VIOLET : "rgba(255,255,255,.45)" }} />{p.label}
                    </div>
                    <div className="mt-1.5 text-xs text-white/45">{p.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Real-Time Hardware & Separation Status Bar */}
      {showStatusBar && (
        <StatusBar
          stats={stats}
          onOpenAnalytics={() => setShowStatsModal(true)}
          activeModelName={model}
        />
      )}

      {/* Model Analytics & Hardware History Dashboard Modal */}
      <StatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        stats={stats}
        models={rawModels}
      />
    </div>
  );
}
