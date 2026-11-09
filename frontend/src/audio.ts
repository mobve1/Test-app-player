/**
 * StemAudioEngine - High-Performance Web Audio Multi-Stem Graph
 * Plays isolated vocals and instrumental stems synchronously with zero latency
 * and zero click/stutter on mode transitions.
 */

export class StemAudioEngine {
  private ctx: AudioContext | null = null;
  private vocalAudio: HTMLAudioElement;
  private musicAudio: HTMLAudioElement;
  private vocalGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  private isLoaded = false;

  constructor() {
    this.vocalAudio = new Audio();
    this.musicAudio = new Audio();
    this.vocalAudio.preload = "auto";
    this.musicAudio.preload = "auto";
  }

  private initGraph() {
    if (this.isInitialized) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    const vocalSrc = this.ctx.createMediaElementSource(this.vocalAudio);
    const musicSrc = this.ctx.createMediaElementSource(this.musicAudio);

    this.vocalGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();

    vocalSrc.connect(this.vocalGain);
    musicSrc.connect(this.musicGain);

    this.vocalGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);

    this.masterGain.connect(this.ctx.destination);
    this.isInitialized = true;
  }

  public async loadStems(vocalsUrlOrMediaId: string, instUrl?: string): Promise<void> {
    this.pause();
    this.isLoaded = false;
    this.initGraph();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }

    const formatUrl = (url: string) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      if (url.startsWith("/")) {
        return `http://127.0.0.1:8000${url}`;
      }
      return `http://127.0.0.1:8000/${url}`;
    };

    let vUrl: string;
    let iUrl: string;

    if (instUrl) {
      vUrl = formatUrl(vocalsUrlOrMediaId);
      iUrl = formatUrl(instUrl);
    } else if (vocalsUrlOrMediaId.startsWith("/") || vocalsUrlOrMediaId.startsWith("http")) {
      vUrl = formatUrl(vocalsUrlOrMediaId);
      iUrl = vUrl.replace(/vocals(\.wav)?/i, "instrumental$1");
    } else {
      vUrl = `http://127.0.0.1:8000/api/media/${vocalsUrlOrMediaId}/vocals`;
      iUrl = `http://127.0.0.1:8000/api/media/${vocalsUrlOrMediaId}/instrumental`;
    }

    const sep = (u: string) => (u.includes("?") ? "&" : "?");
    this.vocalAudio.src = `${vUrl}${sep(vUrl)}t=${Date.now()}`;
    this.musicAudio.src = `${iUrl}${sep(iUrl)}t=${Date.now()}`;

    this.vocalAudio.load();
    this.musicAudio.load();

    const waitCanPlay = (audio: HTMLAudioElement) =>
      new Promise<void>((resolve) => {
        if (audio.readyState >= 3) {
          resolve();
          return;
        }
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve();
          }
        };
        const cleanup = () => {
          audio.removeEventListener("canplay", done);
          audio.removeEventListener("canplaythrough", done);
          audio.removeEventListener("loadeddata", done);
          audio.removeEventListener("error", done);
        };
        audio.addEventListener("canplay", done);
        audio.addEventListener("canplaythrough", done);
        audio.addEventListener("loadeddata", done);
        audio.addEventListener("error", (e) => {
          console.warn("[audioEngine] Stem load error:", audio.src, e);
          done();
        });
        setTimeout(done, 2500);
      });

    await Promise.all([waitCanPlay(this.vocalAudio), waitCanPlay(this.musicAudio)]);
    this.isLoaded = true;
  }

  public hasStems(): boolean {
    return this.isLoaded && !!(this.vocalAudio.src && this.musicAudio.src);
  }

  public setMode(mode: "vocals" | "music" | "original") {
    if (!this.ctx || !this.vocalGain || !this.musicGain) return;
    const t = this.ctx.currentTime + 0.04; // 40ms anti-pop crossfade

    if (mode === "vocals") {
      this.vocalGain.gain.linearRampToValueAtTime(1.0, t);
      this.musicGain.gain.linearRampToValueAtTime(0.0, t);
    } else if (mode === "music") {
      this.vocalGain.gain.linearRampToValueAtTime(0.0, t);
      this.musicGain.gain.linearRampToValueAtTime(1.0, t);
    } else {
      // original (both stems mixed)
      this.vocalGain.gain.linearRampToValueAtTime(1.0, t);
      this.musicGain.gain.linearRampToValueAtTime(1.0, t);
    }
  }

  public setVolume(vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
  }

  public setPlaybackRate(rate: number) {
    const clamped = Math.max(0.25, Math.min(3.0, rate));
    this.vocalAudio.playbackRate = clamped;
    this.musicAudio.playbackRate = clamped;
  }

  public getPlaybackRate(): number {
    return this.vocalAudio.playbackRate || 1.0;
  }

  public async play(): Promise<void> {
    if (!this.hasStems()) {
      return;
    }
    this.initGraph();
    if (this.ctx?.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn("[audioEngine] AudioContext resume error:", err);
      }
    }
    try {
      const p1 = this.vocalAudio.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[audioEngine] vocal play error:", err);
        }
      });
      const p2 = this.musicAudio.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[audioEngine] music play error:", err);
        }
      });
      await Promise.all([p1, p2]);
    } catch {
      // Interrupted play handled safely without throwing
    }
  }

  public pause(): void {
    try {
      this.vocalAudio.pause();
    } catch {}
    try {
      this.musicAudio.pause();
    } catch {}
  }

  public seek(position: number): void {
    const p = Math.max(0, isNaN(position) ? 0 : position);
    try {
      this.vocalAudio.currentTime = p;
    } catch {}
    try {
      this.musicAudio.currentTime = p;
    } catch {}
  }

  public syncTo(targetTime: number, threshold = 0.08): void {
    if (!this.hasStems()) return;
    const current = this.vocalAudio.currentTime || 0;
    if (Math.abs(current - targetTime) > threshold) {
      this.seek(targetTime);
    }
  }

  public getCurrentTime(): number {
    return this.vocalAudio.currentTime || 0;
  }

  public getDuration(): number {
    return this.vocalAudio.duration || 1;
  }

  public onTimeUpdate(cb: (t: number) => void) {
    this.vocalAudio.ontimeupdate = () => cb(this.vocalAudio.currentTime);
  }

  public onEnded(cb: () => void) {
    this.vocalAudio.onended = cb;
  }
}

export const audioEngine = new StemAudioEngine();
