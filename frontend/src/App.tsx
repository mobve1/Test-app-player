import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPE, type ReactNode } from "react";
import {
  Check, ChevronDown, Cpu, EyeOff, Globe, Headphones, Languages, Layers, Link2, Loader2, Lock, Maximize,
  Mic, Minimize, Music, Pause, PictureInPicture2, Play, ShieldCheck, SkipBack, SkipForward, Sparkles,
  Trash2, Video, Volume1, Volume2, VolumeX, Waves, X, Zap, Settings, PanelLeftOpen } from "lucide-react";

import { StartStream, StopStream, ChangeMode } from "../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";

type Listen = "vocals" | "music" | "original";
type MediaType = "audio" | "video";
type Opt = { label: string; hint?: string };

const opts = (a: string[]): Opt[] => a.map((label) => ({ label }));
const MODELS = opts(["Demucs v4 (htdemucs_ft)", "MDX-Net Voc FT"]);
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
                <span>{o.label}</span>
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

/* ------------------------------- player --------------------------------- */

function Player({ video, listen, listenLabel, streamUrl }: { video: boolean; listen: Listen; listenLabel: string; streamUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(1);
  const [vol, setVol] = useState(70);
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const [pip, setPip] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const color = TINT[listen];
  const pipOn = pip && video;

  useEffect(() => {
    if (videoRef.current) {
      if (playing) videoRef.current.play().catch(console.error);
      else videoRef.current.pause();
    }
  }, [playing]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : vol / 100;
    }
  }, [vol, muted]);

  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggle = () => setPlaying((p) => !p);
  
  const seek = (e: RPE<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const newT = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    videoRef.current.currentTime = newT;
    setT(newT);
  };
  
  const pct = dur > 0 ? (t / dur) * 100 : 0;
  const sv = muted ? 0 : vol;
  const VolIcon = sv === 0 ? VolumeX : sv < 50 ? Volume1 : Volume2;
  const PlayIcon = playing ? Pause : Play;

  const handleTimeUpdate = () => {
    if (videoRef.current) setT(videoRef.current.currentTime);
  };
  const handleDurationChange = () => {
    if (videoRef.current && !isNaN(videoRef.current.duration)) setDur(videoRef.current.duration);
  };
  const handleTogglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPip(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setPip(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const controls = (
    <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-12">
      <div role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
        onPointerMove={(e) => e.buttons === 1 && seek(e)}
        onKeyDown={(e) => {
          if (!videoRef.current) return;
          if (e.key === "ArrowRight") videoRef.current.currentTime = Math.min(dur, t + 5);
          if (e.key === "ArrowLeft") videoRef.current.currentTime = Math.max(0, t - 5);
        }}
        className="group/bar flex h-4 cursor-pointer items-center">
        <div className="relative h-1 w-full rounded-full bg-white/15 transition-all group-hover/bar:h-1.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${Math.min(100, pct + 22)}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
          <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
            style={{ left: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-0.5 text-white">
        <IconBtn label="Back to start" onClick={() => videoRef.current && (videoRef.current.currentTime = 0)}><SkipBack className={ic} /></IconBtn>
        <button aria-label={playing ? "Pause" : "Play"} onClick={toggle}
          className="mx-1 grid h-10 w-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105">
          <PlayIcon className="h-5 w-5" fill="currentColor" />
        </button>
        <IconBtn label="Forward 10 seconds" onClick={() => videoRef.current && (videoRef.current.currentTime += 10)}><SkipForward className={ic} /></IconBtn>
        <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}><VolIcon className={ic} /></IconBtn>
        <input type="range" min={0} max={100} value={sv} aria-label="Volume" className="range w-20"
          onChange={(e) => { setVol(+e.target.value); setMuted(false); }} style={{ "--p": `${sv}%`, "--c": color } as CSSProperties} />
        <span className="ml-3 text-xs tabular-nums text-white/70">{fmt(t)} / {fmt(dur)}</span>
        <div className="flex-1" />
        {video && (
          <>
            <IconBtn label={pip ? "Exit picture-in-picture" : "Picture-in-picture"} active={pip} onClick={handleTogglePiP}><PictureInPicture2 className={ic} /></IconBtn>
            <IconBtn label={full ? "Exit fullscreen" : "Fullscreen"} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}>
              {full ? <Minimize className={ic} /> : <Maximize className={ic} />}
            </IconBtn>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div ref={box} className={`group relative overflow-hidden bg-black shadow-2xl ${full ? "h-screen w-screen" : "aspect-video rounded-2xl border border-white/10"}`}>
        <div className="absolute inset-0 transition-[background] duration-700" style={{ background: poster(color), display: video && streamUrl ? 'none' : 'block' }} />
        
        {streamUrl && (
          <video 
            ref={videoRef}
            src={streamUrl}
            muted={true}
            autoPlay={true}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            className={`absolute inset-0 w-full h-full object-cover ${!video ? 'opacity-0 pointer-events-none' : ''}`} 
          />
        )}

        {pipOn ? (
          <div className="absolute inset-0 grid place-items-center bg-[#0f0f11]">
            <div className="text-center">
              <PictureInPicture2 className="mx-auto h-8 w-8 text-white/40" />
              <p className="mt-3 text-sm text-white/60">Playing in picture-in-picture</p>
              <button onClick={handleTogglePiP} className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Return to player</button>
            </div>
          </div>
        ) : (
          <>
            {!video && (
              <div className="absolute inset-x-8 bottom-24 top-14 flex items-end gap-1" aria-hidden>
                {Array.from({ length: 40 }, (_, i) => (
                  <span key={i} className="eq-bar" style={{ background: color, opacity: 0.85, animationDelay: `${(i * 83) % 700}ms`, animationDuration: `${600 + ((i * 47) % 500)}ms`, animationPlayState: playing ? "running" : "paused" }} />
                ))}
              </div>
            )}
            <button aria-label={playing ? "Pause" : "Play"} onClick={toggle} className="absolute inset-0 w-full cursor-pointer" />
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: playing ? 1 : 0.5 }} />{listenLabel}
            </div>
            {video && !playing && !streamUrl && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid h-[72px] w-[72px] place-items-center rounded-full text-black shadow-2xl ring-8 ring-white/10" style={{ background: color }}>
                  <Play className="ml-1 h-8 w-8" fill="currentColor" />
                </span>
              </div>
            )}
            <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 focus-within:opacity-100 ${playing && video ? "opacity-0 group-hover:opacity-100" : ""}`}>{controls}</div>
          </>
        )}
      </div>
    </>
  );
}

/* --------------------------------- app ---------------------------------- */

export default function App() {
  const [side, setSide] = useState(false);
  const [beautiful, setBeautiful] = useState(true);
  const [media, setMedia] = useState<MediaType>("video");
  const [listen, setListen] = useState<Listen>("vocals");
  const [proc, setProc] = useState(PROCESSING[0].label);
  const [model, setModel] = useState(MODELS[0].label);
  const [language, setLanguage] = useState("English");
  const [proxy, setProxy] = useState("");
  const [antiTrack, setAntiTrack] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [cache, setCache] = useState<"idle" | "clearing" | "done">("idle");
  const [streamUrl, setStreamUrl] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    EventsOn("status", (data: unknown) => {
      const d = data as { state: string; message: string };
      if (d.message) setStatusMsg(d.message);
      if (d.state === "error") {
        setProgress(null);
      } else if (d.state === "idle") {
        setProgress(null);
      } else if (d.state === "loading" || d.state === "buffering") {
        setProgress((p) => Math.min(95, (p || 0) + 10));
      } else if (d.state === "playing") {
        setProgress(100);
      }
    });
    return () => EventsOff("status");
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
  
  const go = async () => {
    if (!url.trim() || busy) return;
    setProgress(5);
    setStatusMsg("Starting...");
    try {
      const su = await StartStream(url.trim(), listen);
      setStreamUrl(su);
    } catch (err) {
      console.error(err);
      setProgress(null);
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
            <div><Label>Model</Label><Dropdown value={model} options={MODELS} onChange={setModel} icon={<Cpu className="h-4 w-4" />} /></div>
            <div><Label>Language</Label><Dropdown value={language} options={LANGS} onChange={setLanguage} icon={<Languages className="h-4 w-4" />} /></div>
          </Group>

          <Group title="Privacy & security">
            <ToggleRow icon={<ShieldCheck className="h-4 w-4" />} title="DNS over HTTPS (DoH)" hint="Always on. Lookups stay encrypted."><Switch checked locked label="DNS over HTTPS, always on" /></ToggleRow>
            <ToggleRow icon={<EyeOff className="h-4 w-4" />} title="Anti-Tracking / No-Cookies" hint="Blocks trackers and stores no cookies."><Switch checked={antiTrack} locked label="Anti-tracking and no cookies" /></ToggleRow>
            <ToggleRow icon={<Lock className="h-4 w-4" />} title="Encrypt Cached Files" hint="Protects processed audio on disk."><Switch checked={encrypt} onChange={setEncrypt} label="Encrypt cached files" /></ToggleRow>
          </Group>

          <Group title="Performance">
            <ToggleRow icon={beautiful ? <Sparkles className="h-4 w-4 text-[#1ed760]" /> : <Zap className="h-4 w-4 text-amber-300" />}
              title={beautiful ? "Beautiful Mode" : "Lite Mode"} hint={beautiful ? "Blur, glass and animations are on." : "Blur and animations are off for speed."}>
              <Switch checked={beautiful} onChange={setBeautiful} label="Beautiful Mode" />
            </ToggleRow>
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
      <main className="scroll relative z-10 min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <IconBtn label="Open settings" onClick={() => setSide(true)}><PanelLeftOpen className="h-[18px] w-[18px]" /></IconBtn>
            <div className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-[#1ed760]" />Stemwave</div>
          </div>
          {/* 1. URL bar */}
          <div>
            <div className="glass-panel flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-[#1ed760]/50">
              <Link2 className="h-4 w-4 shrink-0 text-white/40" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste YouTube or media link..." spellCheck={false}
                className="min-w-0 flex-1 select-text bg-transparent text-sm outline-none placeholder:text-white/35" />
              {url && <button aria-label="Clear link" onClick={() => { setUrl(""); setProgress(null); }} className="grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}
              <button disabled={!url.trim() || busy} onClick={go}
                className="flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-black transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: isolating ? VIOLET : "#1ed760" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isolating ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
                {busy ? "Isolating" : isolating ? "Isolate" : "Play"}
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

          {/* 2. Player */}
          <Player video={media === "video"} listen={listen} listenLabel={listenLabel} streamUrl={streamUrl} />

          {/* 3. Media type */}
          <div>
            <Label>Media type</Label>
            <Segmented value={media} onChange={setMedia} accent="#1ed760" options={[
              { id: "audio", label: "Audio Only", icon: <Headphones className="h-4 w-4" /> },
              { id: "video", label: "Video + Audio", icon: <Video className="h-4 w-4" /> },
            ]} />
          </div>

          {/* 4. Listening mode */}
          <div><Label>Listening mode</Label><Segmented options={listenOptions} value={listen} onChange={(v) => { setListen(v); ChangeMode(v); }} accent={TINT[listen]} /></div>

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
    </div>
  );
}
