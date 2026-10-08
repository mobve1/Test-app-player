package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/cmplx"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/madelynnblue/go-dsp/fft"
	ort "github.com/yalue/onnxruntime_go"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/ebitengine/oto/v3"
)

// ────────────────────────────────────────────────────────────────
// Audio & STFT constants — must match model training config
// ────────────────────────────────────────────────────────────────
const (
	sampleRate      = 44100
	channelCount    = 2
	bitDepth        = 16
	bytesPerSample  = bitDepth / 8 * channelCount

	stftNFFT  = 4096
	stftHop   = 1024
	stftBins  = stftNFFT/2 + 1 // 2049

	// Fixed to 100: umxl_vocals.onnx hardcodes nb_frames=100 in internal Reshape ops.
	stftFrames       = 100
	pcmFramesPerChunk = stftFrames * stftHop  // 102400 samples/ch
	pcmBytesPerChunk  = pcmFramesPerChunk * bytesPerSample
	ffmpegChunkBytes  = 8192 * bytesPerSample

	rawRingCap = 32
	pcmRingCap = 32
)

// ────────────────────────────────────────────────────────────────
// Mode
// ────────────────────────────────────────────────────────────────
const (
	modeBypass uint32 = 0
	modeVocals uint32 = 1
	modeMusic  uint32 = 2
)

func parseMode(s string) uint32 {
	switch strings.ToLower(s) {
	case "vocals":
		return modeVocals
	case "music":
		return modeMusic
	default:
		return modeBypass
	}
}

// ────────────────────────────────────────────────────────────────
// Security: YouTube URL validation (prevents command injection)
// ────────────────────────────────────────────────────────────────
var ytURLPattern = regexp.MustCompile(
	`^https?://(www\.)?(youtube\.com/watch\?(?:[^&]*&)*v=[\w-]{11}|youtu\.be/[\w-]{11})[\w=&?%-]*$`,
)

func validateYouTubeURL(rawURL string) (string, error) {
	u := strings.TrimSpace(rawURL)
	// Strip anything after a newline or shell special character
	for _, bad := range []string{"\n", "\r", ";", "&", "|", "`", "$", "(", ")", "<", ">"} {
		if i := strings.Index(u, bad); i != -1 {
			u = u[:i]
		}
	}
	if !ytURLPattern.MatchString(u) {
		return "", fmt.Errorf("invalid YouTube URL")
	}
	return u, nil
}

// ────────────────────────────────────────────────────────────────
// DoH client
// ────────────────────────────────────────────────────────────────
type dohResponse struct {
	Answer []struct {
		Type int    `json:"type"`
		Data string `json:"data"`
	} `json:"Answer"`
}

var bootstrapDohClient = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS13},
		ForceAttemptHTTP2: true,
		DialContext: (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
	},
	Timeout: 10 * time.Second,
}

func queryDoH(ctx context.Context, domain, recordType string) (string, error) {
	u := fmt.Sprintf("https://1.1.1.1/dns-query?name=%s&type=%s", domain, recordType)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/dns-json")
	req.Host = "cloudflare-dns.com"
	resp, err := bootstrapDohClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var dr dohResponse
	if err := json.NewDecoder(resp.Body).Decode(&dr); err != nil {
		return "", err
	}
	for _, ans := range dr.Answer {
		if ans.Type == 1 || ans.Type == 28 { // A or AAAA
			return ans.Data, nil
		}
	}
	return "", fmt.Errorf("doh: no A or AAAA record for %s", domain)
}

func resolveDoH(ctx context.Context, domain string) (string, error) {
	if ip, err := queryDoH(ctx, domain, "A"); err == nil && ip != "" {
		return ip, nil
	}
	return queryDoH(ctx, domain, "AAAA")
}

func buildStealthClient() *http.Client {
	dialer := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS13},
			ForceAttemptHTTP2:   true,
			DisableKeepAlives:   false,
			MaxIdleConnsPerHost: 4,
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(addr)
				if err != nil {
					return dialer.DialContext(ctx, network, addr)
				}
				if net.ParseIP(host) != nil {
					return dialer.DialContext(ctx, network, addr)
				}
				ip, err := resolveDoH(ctx, host)
				if err != nil {
					return dialer.DialContext(ctx, network, addr)
				}
				return dialer.DialContext(ctx, network, net.JoinHostPort(ip, port))
			},
		},
		Timeout: 0,
	}
}

// ────────────────────────────────────────────────────────────────
// yt-dlp extraction
// ────────────────────────────────────────────────────────────────
func extractStreamURL(ctx context.Context, youtubeURL string) (string, error) {
	var stdout, stderr bytes.Buffer
	// Format: prioritize best pre-merged, then audio fallback, or any valid stream.
	// We avoid strict "best" because modern YouTube 1080p+ videos often don't have a single pre-merged stream.
	cmd := exec.CommandContext(ctx, "yt-dlp",
		"--no-playlist",
		"--format", "ba/b/best",
		"-g",
		"--", youtubeURL, // "--" prevents arg injection
	)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errDetails := strings.TrimSpace(stderr.String())
		if errDetails == "" {
			errDetails = err.Error()
		}
		return "", fmt.Errorf("yt-dlp error: %s", errDetails)
	}

	// -g may return multiple URLs (e.g. video and audio on separate lines)
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return "", fmt.Errorf("yt-dlp returned empty stream URL")
	}

	// Pick the last URL if multiple are provided (in separate video+audio streams, audio is typically second)
	// or the first one if only one is returned.
	chosenURL := strings.TrimSpace(lines[len(lines)-1])
	return chosenURL, nil
}

// ────────────────────────────────────────────────────────────────
// Ring buffer — bounded blocking SPSC queue
// ────────────────────────────────────────────────────────────────
type ringBuffer struct {
	slots    [][]byte
	cap      int
	head     int
	tail     int
	mu       sync.Mutex
	notEmpty *sync.Cond
	notFull  *sync.Cond
	closed   bool
}

func newRingBuffer(capacity, slotSize int) *ringBuffer {
	rb := &ringBuffer{slots: make([][]byte, capacity), cap: capacity}
	rb.notEmpty = sync.NewCond(&rb.mu)
	rb.notFull = sync.NewCond(&rb.mu)
	for i := range rb.slots {
		rb.slots[i] = make([]byte, slotSize)
	}
	return rb
}

func (rb *ringBuffer) write(data []byte) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	for !rb.closed && (rb.head-rb.tail) >= rb.cap {
		rb.notFull.Wait()
	}
	if rb.closed {
		return
	}
	idx := rb.head % rb.cap
	if cap(rb.slots[idx]) < len(data) {
		rb.slots[idx] = make([]byte, len(data))
	}
	rb.slots[idx] = rb.slots[idx][:len(data)]
	copy(rb.slots[idx], data)
	rb.head++
	rb.notEmpty.Signal()
}

func (rb *ringBuffer) read() ([]byte, bool) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	for rb.head == rb.tail {
		if rb.closed {
			return nil, false
		}
		rb.notEmpty.Wait()
	}
	idx := rb.tail % rb.cap
	out := make([]byte, len(rb.slots[idx]))
	copy(out, rb.slots[idx])
	rb.tail++
	rb.notFull.Signal()
	return out, true
}

func (rb *ringBuffer) close() {
	rb.mu.Lock()
	rb.closed = true
	rb.notEmpty.Broadcast()
	rb.notFull.Broadcast()
	rb.mu.Unlock()
}

func (rb *ringBuffer) WaitForMin(minChunks int) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	for !rb.closed && (rb.head-rb.tail) < minChunks {
		rb.notEmpty.Wait()
	}
}

// ────────────────────────────────────────────────────────────────
// Hann window (periodic, matches librosa/PyTorch default)
// ────────────────────────────────────────────────────────────────
var hannWindow []float64

func initHannWindow() {
	hannWindow = make([]float64, stftNFFT)
	for i := range hannWindow {
		hannWindow[i] = 0.5 * (1.0 - math.Cos(2*math.Pi*float64(i)/float64(stftNFFT)))
	}
}

// ────────────────────────────────────────────────────────────────
// STFT — centre-padded, zero-alloc per call
// ────────────────────────────────────────────────────────────────
func stft(
	pcm []float32,
	paddedBuf []float64,
	frameBuf []complex128,
	out [][stftBins]complex128,
) {
	pad := stftNFFT / 2
	for i := 0; i < pad; i++ {
		paddedBuf[i] = float64(pcm[pad-1-i])
	}
	for i, v := range pcm {
		paddedBuf[pad+i] = float64(v)
	}
	tail := len(pcm)
	for i := 0; i < pad; i++ {
		paddedBuf[pad+tail+i] = float64(pcm[tail-1-i])
	}
	totalLen := len(paddedBuf)
	for frame := 0; frame < stftFrames; frame++ {
		start := frame * stftHop
		if start+stftNFFT > totalLen {
			break
		}
		for k := 0; k < stftNFFT; k++ {
			frameBuf[k] = complex(paddedBuf[start+k]*hannWindow[k], 0)
		}
		spec := fft.FFT(frameBuf)
		for b := 0; b < stftBins; b++ {
			out[frame][b] = spec[b]
		}
	}
}

// ────────────────────────────────────────────────────────────────
// ISTFT — OLA with proper sum-of-squared-windows normalisation
// ────────────────────────────────────────────────────────────────
func istft(
	spec [][stftBins]complex128,
	fullSpec []complex128,
	ifftOut []complex128,
	olaAccum []float64,
	olaWindow []float64,
	out []float32,
) {
	for i := range olaAccum {
		olaAccum[i] = 0
	}
	for i := range olaWindow {
		olaWindow[i] = 0
	}
	for frame, bins := range spec {
		for b := 0; b < stftBins; b++ {
			fullSpec[b] = bins[b]
		}
		for b := 1; b < stftNFFT/2; b++ {
			fullSpec[stftNFFT-b] = cmplx.Conj(bins[b])
		}
		copy(ifftOut, fft.IFFT(fullSpec))
		start := frame * stftHop
		for k := 0; k < stftNFFT; k++ {
			w := hannWindow[k]
			olaAccum[start+k] += real(ifftOut[k]) * w
			olaWindow[start+k] += w * w // correct OLA normalisation
		}
	}
	pad := stftNFFT / 2
	for i := 0; i < len(out); i++ {
		denom := olaWindow[pad+i]
		if denom < 1e-8 {
			denom = 1e-8
		}
		v := float32(olaAccum[pad+i] / denom)
		if v > 1 {
			v = 1
		} else if v < -1 {
			v = -1
		}
		out[i] = v
	}
}

// ────────────────────────────────────────────────────────────────
// ONNX DSP session wrapper
// umxl_vocals.onnx: in=[1,2,2049,100] float32 / out=[1,2,2049,100]
// ────────────────────────────────────────────────────────────────
type onnxDSP struct {
	session  *ort.DynamicAdvancedSession
	inData   []float32
	outData  []float32
	inShape  ort.Shape
	outShape ort.Shape
}

func newOnnxDSP(modelPath, ortLib string) (*onnxDSP, error) {
	if _, err := os.Stat(ortLib); err == nil {
		if abs, err := filepath.Abs(ortLib); err == nil {
			ortLib = abs
		}
	}
	ort.SetSharedLibraryPath(ortLib)
	if !ort.IsInitialized() {
		if err := ort.InitializeEnvironment(); err != nil {
			return nil, fmt.Errorf("ort init: %w", err)
		}
	}
	opts, err := ort.NewSessionOptions()
	if err != nil {
		return nil, fmt.Errorf("ort session opts: %w", err)
	}
	defer opts.Destroy()
	_ = opts.AppendExecutionProviderDirectML(0) // GPU; silent fallback
	_ = opts.SetIntraOpNumThreads(4)
	_ = opts.SetInterOpNumThreads(4)
	_ = opts.SetCpuMemArena(true)

	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		[]string{"spectrogram"},
		[]string{"masked_spectrogram"},
		opts,
	)
	if err != nil {
		return nil, fmt.Errorf("ort session: %w", err)
	}
	tensorLen := 1 * channelCount * stftBins * stftFrames
	shape := ort.NewShape(1, int64(channelCount), int64(stftBins), int64(stftFrames))
	return &onnxDSP{
		session:  session,
		inData:   make([]float32, tensorLen),
		outData:  make([]float32, tensorLen),
		inShape:  shape,
		outShape: shape,
	}, nil
}

func (d *onnxDSP) destroy() {
	if d.session != nil {
		d.session.Destroy()
	}
}

func (d *onnxDSP) runONNX() error {
	inT, err := ort.NewTensor(d.inShape, d.inData)
	if err != nil {
		return fmt.Errorf("ort in tensor: %w", err)
	}
	defer inT.Destroy()
	outT, err := ort.NewTensor(d.outShape, d.outData)
	if err != nil {
		return fmt.Errorf("ort out tensor: %w", err)
	}
	defer outT.Destroy()
	if err := d.session.Run([]ort.ArbitraryTensor{inT}, []ort.ArbitraryTensor{outT}); err != nil {
		return fmt.Errorf("ort run: %w", err)
	}
	copy(d.outData, outT.GetData())
	return nil
}

// ────────────────────────────────────────────────────────────────
// DSP Worker — STFT → ONNX → ISTFT
// ────────────────────────────────────────────────────────────────
func runDSPWorker(ctx context.Context, rawRing, pcmRing *ringBuffer, dsp *onnxDSP, modeRef *atomic.Uint32) {
	defer pcmRing.close()
	mode := modeRef.Load()
	if mode == modeBypass || dsp == nil {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			chunk, ok := rawRing.read()
			if !ok {
				return
			}
			pcmRing.write(chunk)
		}
	}

	padLen := pcmFramesPerChunk + stftNFFT
	pcmChL  := make([]float32, pcmFramesPerChunk)
	pcmChR  := make([]float32, pcmFramesPerChunk)
	paddedL := make([]float64, padLen)
	paddedR := make([]float64, padLen)
	frameBuf := make([]complex128, stftNFFT)
	specL   := make([][stftBins]complex128, stftFrames)
	specR   := make([][stftBins]complex128, stftFrames)
	fullSpec := make([]complex128, stftNFFT)
	ifftOut  := make([]complex128, stftNFFT)
	olaAccum := make([]float64, padLen)
	olaWin   := make([]float64, padLen)
	outL    := make([]float32, pcmFramesPerChunk)
	outR    := make([]float32, pcmFramesPerChunk)
	outPCM  := make([]byte, pcmBytesPerChunk)
	accumBuf := make([]byte, 0, pcmBytesPerChunk*2)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		mode = modeRef.Load() // hot-swap mode without restart
		chunk, ok := rawRing.read()
		if !ok {
			return
		}
		accumBuf = append(accumBuf, chunk...)
		for len(accumBuf) >= pcmBytesPerChunk {
			processSTFTChunk(dsp, accumBuf[:pcmBytesPerChunk], mode,
				pcmChL, pcmChR, paddedL, paddedR,
				frameBuf, specL, specR,
				fullSpec, ifftOut, olaAccum, olaWin,
				outL, outR, outPCM, pcmRing)
			accumBuf = accumBuf[pcmBytesPerChunk:]
		}
	}
}

func processSTFTChunk(
	dsp *onnxDSP, pcmIn []byte, mode uint32,
	pcmChL, pcmChR []float32, paddedL, paddedR []float64,
	frameBuf []complex128,
	specL, specR [][stftBins]complex128,
	fullSpec, ifftOut []complex128,
	olaAccum, olaWin []float64,
	outL, outR []float32, outPCM []byte,
	pcmRing *ringBuffer,
) {
	n := len(pcmIn) / bytesPerSample
	for i := 0; i < n; i++ {
		sL := int16(binary.LittleEndian.Uint16(pcmIn[i*bytesPerSample : i*bytesPerSample+2]))
		sR := int16(binary.LittleEndian.Uint16(pcmIn[i*bytesPerSample+2 : i*bytesPerSample+4]))
		pcmChL[i] = float32(sL) / 32768.0
		pcmChR[i] = float32(sR) / 32768.0
	}

	stft(pcmChL, paddedL, frameBuf, specL)
	stft(pcmChR, paddedR, frameBuf, specR)

	// Pack magnitude spectrogram into tensor: [1, 2, stftBins, stftFrames]
	for ch, sp := range [][]ort.ArbitraryTensor(nil) { // range trick below
		_ = ch; _ = sp // loop body below
	}
	for _, pair := range []struct {
		ch int
		sp [][stftBins]complex128
	}{{0, specL}, {1, specR}} {
		base := pair.ch * stftBins * stftFrames
		for b := 0; b < stftBins; b++ {
			for f := 0; f < stftFrames; f++ {
				dsp.inData[base+b*stftFrames+f] = float32(cmplx.Abs(pair.sp[f][b]))
			}
		}
	}

	if err := dsp.runONNX(); err != nil {
		log.Printf("[DSP] ONNX error: %v — bypass", err)
		pcmRing.write(pcmIn)
		return
	}

	// Phase-reconstruct from masked magnitude + original phase
	for _, pair := range []struct {
		ch int
		sp [][stftBins]complex128
	}{{0, specL}, {1, specR}} {
		base := pair.ch * stftBins * stftFrames
		for b := 0; b < stftBins; b++ {
			for f := 0; f < stftFrames; f++ {
				maskedMag := float64(dsp.outData[base+b*stftFrames+f])
				orig := pair.sp[f][b]
				origMag := cmplx.Abs(orig)
				var recon complex128
				if origMag < 1e-10 {
					recon = complex(maskedMag, 0)
				} else {
					recon = complex(maskedMag, 0) * orig / complex(origMag, 0)
				}
				pair.sp[f][b] = recon
			}
		}
	}

	istft(specL, fullSpec, ifftOut, olaAccum, olaWin, outL)
	istft(specR, fullSpec, ifftOut, olaAccum, olaWin, outR)

	if mode == modeMusic {
		for i := range outL {
			outL[i] = pcmChL[i] - outL[i]
			outR[i] = pcmChR[i] - outR[i]
		}
	}

	for i := 0; i < pcmFramesPerChunk; i++ {
		lc := outL[i]; if lc > 1 { lc = 1 } else if lc < -1 { lc = -1 }
		rc := outR[i]; if rc > 1 { rc = 1 } else if rc < -1 { rc = -1 }
		binary.LittleEndian.PutUint16(outPCM[i*bytesPerSample:],   uint16(int16(lc*math.MaxInt16)))
		binary.LittleEndian.PutUint16(outPCM[i*bytesPerSample+2:], uint16(int16(rc*math.MaxInt16)))
	}
	pcmRing.write(outPCM)
}

// ────────────────────────────────────────────────────────────────
// FFmpeg pipeline
// ────────────────────────────────────────────────────────────────
func runFFmpegPipeline(ctx context.Context, body io.ReadCloser, rawRing *ringBuffer) error {
	defer body.Close()
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-hide_banner", "-loglevel", "error",
		"-i", "pipe:0",
		"-vn",
		"-acodec", "pcm_s16le",
		"-ar", fmt.Sprintf("%d", sampleRate),
		"-ac", fmt.Sprintf("%d", channelCount),
		"-f", "s16le",
		"pipe:1",
	)
	cmd.Stdin = body
	ffOut, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("ffmpeg stdout: %w", err)
	}
	if err = cmd.Start(); err != nil {
		return fmt.Errorf("ffmpeg start: %w", err)
	}
	buf := make([]byte, ffmpegChunkBytes)
	reader := bufio.NewReaderSize(ffOut, ffmpegChunkBytes*4)
	for {
		_, err := io.ReadFull(reader, buf)
		if err != nil {
			break
		}
		rawRing.write(buf)
	}
	rawRing.close()
	return cmd.Wait()
}

// ────────────────────────────────────────────────────────────────
// Playback (oto/v3 WASAPI)
// ────────────────────────────────────────────────────────────────
func runPlayback(ctx context.Context, pcmRing *ringBuffer) error {
	pcmRing.WaitForMin(2)
	otoCtx, readyCh, err := oto.NewContext(&oto.NewContextOptions{
		SampleRate:   sampleRate,
		ChannelCount: channelCount,
		Format:       oto.FormatSignedInt16LE,
		BufferSize:   0,
	})
	if err != nil {
		return fmt.Errorf("oto context: %w", err)
	}
	<-readyCh
	pr, pw := io.Pipe()
	player := otoCtx.NewPlayer(pr)
	defer func() {
		player.Close()
		pw.Close()
		pr.Close()
	}()
	player.Play()
	for {
		select {
		case <-ctx.Done():
			pw.Close()
			return nil
		default:
		}
		chunk, ok := pcmRing.read()
		if !ok {
			pw.Close()
			return nil
		}
		if _, err := pw.Write(chunk); err != nil {
			return fmt.Errorf("playback write: %w", err)
		}
	}
}

// ────────────────────────────────────────────────────────────────
// Wails App struct
// ────────────────────────────────────────────────────────────────
type App struct {
	ctx       context.Context
	cancelFn  context.CancelFunc
	mu        sync.Mutex
	streaming bool
	dsp       *onnxDSP
	mode      atomic.Uint32
	modelPath string
	ortLib    string
	pip       bool
}

func NewApp(modelPath, ortLib string) *App {
	initHannWindow()
	return &App{modelPath: modelPath, ortLib: ortLib}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) emitStatus(state, message string) {
	runtime.EventsEmit(a.ctx, "status", map[string]string{
		"state":   state,
		"message": message,
	})
}

// StartStream validates the URL, extracts stream, loads ONNX if needed, starts the pipeline.
func (a *App) StartStream(rawURL, modeStr string) (string, error) {
	a.mu.Lock()
	if a.streaming {
		a.mu.Unlock()
		return "", fmt.Errorf("already streaming — call StopStream first")
	}

	url, err := validateYouTubeURL(rawURL)
	if err != nil {
		a.mu.Unlock()
		a.emitStatus("error", err.Error())
		return "", err
	}

	m := parseMode(modeStr)
	a.mode.Store(m)

	a.emitStatus("loading", "Extracting stream URL...")
	streamURL, err := extractStreamURL(a.ctx, url)
	if err != nil {
		a.mu.Unlock()
		a.emitStatus("error", err.Error())
		return "", err
	}

	// Load ONNX model once (or reuse existing)
	if m != modeBypass && a.dsp == nil {
		a.emitStatus("loading", "Loading ONNX model...")
		dsp, err := newOnnxDSP(a.modelPath, a.ortLib)
		if err != nil {
			log.Printf("[DSP] ONNX initialization failed: %v. Safe fallback to bypass mode.", err)
			a.emitStatus("warning", fmt.Sprintf("AI Model init warning: %v. Playing in bypass mode.", err))
			a.mode.Store(modeBypass)
		} else {
			a.dsp = dsp
		}
	}

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelFn = cancel
	a.streaming = true
	a.mu.Unlock()

	go func() {
		if err := a.runPipeline(ctx, streamURL); err != nil {
			log.Printf("[pipeline] %v", err)
			a.emitStatus("error", err.Error())
		}
		a.mu.Lock()
		a.streaming = false
		a.mu.Unlock()
		a.emitStatus("idle", "")
	}()
	return streamURL, nil
}

func (a *App) runPipeline(ctx context.Context, streamURL string) error {

	a.emitStatus("loading", "Connecting to stream...")
	client := buildStealthClient()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch stream: %w", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		resp.Body.Close()
		return fmt.Errorf("unexpected HTTP %d", resp.StatusCode)
	}

	rawRing := newRingBuffer(rawRingCap, ffmpegChunkBytes)
	pcmRing := newRingBuffer(pcmRingCap, pcmBytesPerChunk)

	var wg sync.WaitGroup
	errCh := make(chan error, 3)

	wg.Add(1)
	go func() {
		defer wg.Done()
		if e := runFFmpegPipeline(ctx, resp.Body, rawRing); e != nil {
			errCh <- e
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		runDSPWorker(ctx, rawRing, pcmRing, a.dsp, &a.mode)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		a.emitStatus("buffering", "Buffering audio...")
		if e := runPlayback(ctx, pcmRing); e != nil {
			errCh <- e
		}
	}()

	// Signal playing once buffering is done (playback goroutine calls WaitForMin then starts)
	go func() {
		// small heuristic: emit "playing" 1s after buffering status
		time.Sleep(1 * time.Second)
		a.mu.Lock()
		streaming := a.streaming
		a.mu.Unlock()
		if streaming {
			a.emitStatus("playing", "")
		}
	}()

	go func() { wg.Wait(); close(errCh) }()
	for e := range errCh {
		if e != nil {
			return e
		}
	}
	return nil
}

// StopStream cancels the active pipeline context.
func (a *App) StopStream() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancelFn != nil {
		a.cancelFn()
		a.cancelFn = nil
	}
	a.streaming = false
}

// ChangeMode hot-swaps the DSP mode without restarting.
func (a *App) ChangeMode(modeStr string) {
	a.mode.Store(parseMode(modeStr))
}

// TogglePiP resizes the window for picture-in-picture / full mode.
func (a *App) TogglePiP() {
	a.pip = !a.pip
	if a.pip {
		runtime.WindowSetSize(a.ctx, 360, 120)
		runtime.WindowSetAlwaysOnTop(a.ctx, true)
	} else {
		runtime.WindowSetSize(a.ctx, 420, 540)
		runtime.WindowSetAlwaysOnTop(a.ctx, false)
	}
}
