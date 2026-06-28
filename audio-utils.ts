// ─── Audio Streamer (plays AI voice output) ──────────────────────────────────
// UPGRADE: Low-latency streaming with immediate scheduling, interruption support,
// and an onSpeakingChange callback for barge-in detection in App.tsx.

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeNodes: AudioBufferSourceNode[] = [];
  private isStopped = false;

  // Callback fires true when AI starts speaking, false when silent/stopped.
  // App.tsx uses this to detect barge-in moments.
  public onSpeakingChange?: (isSpeaking: boolean) => void;

  constructor(private sampleRate = 24000) {}

  private init() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      // Use currentTime immediately so first chunk plays with zero gap
      this.nextStartTime = this.audioContext.currentTime;
      this.isStopped = false;
    }
  }

  async resume() {
    this.init();
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async play(base64Data: string) {
    if (this.isStopped) return;
    await this.resume();
    if (!this.audioContext) return;

    // ── Decode PCM-16 → Float32 (in-place, no extra allocations) ──
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    const len = pcm16.length;
    for (let i = 0; i < len; i++) float32[i] = pcm16[i] * 3.0517578125e-5; // / 32768

    // ── Create buffer & source node ──
    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioContext.destination);

    // ── Schedule: start immediately if we're behind, else chain seamlessly ──
    const now = this.audioContext.currentTime;
    // LATENCY FIX: use 0.005s lookahead buffer (5ms) instead of 0
    // to avoid audio glitches, but never fall behind current time.
    const start = Math.max(this.nextStartTime, now + 0.005);
    src.start(start);
    this.nextStartTime = start + buffer.duration;

    // Track active nodes for instant cancellation during barge-in
    this.activeNodes.push(src);
    src.onended = () => {
      const idx = this.activeNodes.indexOf(src);
      if (idx !== -1) this.activeNodes.splice(idx, 1);
      // Notify when all nodes are done → AI stopped speaking
      if (this.activeNodes.length === 0) {
        this.onSpeakingChange?.(false);
      }
    };

    // Notify that AI is now speaking
    if (this.activeNodes.length === 1) {
      this.onSpeakingChange?.(true);
    }
  }

  // ── Barge-in: stop all queued audio immediately ──
  // Called from App.tsx when user mic input is detected mid-playback.
  interrupt() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.activeNodes.forEach(node => {
      try { node.stop(now); } catch {}
    });
    this.activeNodes = [];
    // Reset schedule so next AI response starts fresh
    this.nextStartTime = this.audioContext.currentTime;
    this.onSpeakingChange?.(false);
  }

  stop() {
    this.isStopped = true;
    this.interrupt();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.nextStartTime = 0;
  }
}

// ─── Audio Recorder (captures mic input) ─────────────────────────────────────
// UPGRADE: 512-sample buffer (was 2048) for ~32ms latency vs ~128ms.
// Adds energy-based voice activity detection (VAD) to trigger barge-in.
export class AudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  // Fires when the user starts speaking (energy above threshold).
  // App.tsx connects this to audioStreamer.interrupt() for barge-in.
  public onVoiceStart?: () => void;

  // Energy detection state
  private _vadActive = false;
  private VAD_THRESHOLD = 0.01;   // RMS threshold — adjust if too sensitive
  private VAD_HOLD_FRAMES = 8;    // Hold "active" for N frames after energy drops
  private _holdCounter = 0;

  constructor(private sampleRate = 16000) {}

  async start(onData: (b64: string) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: this.sampleRate,
      }
    });
    this.ctx = new AudioContext({ sampleRate: this.sampleRate });
    this.source = this.ctx.createMediaStreamSource(this.stream);

    // LATENCY UPGRADE: 512-sample buffer → ~32ms latency (was 2048 → ~128ms)
    this.processor = this.ctx.createScriptProcessor(512, 1, 1);

    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);

      // ── Voice Activity Detection (VAD) ──
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
      const rms = Math.sqrt(sumSq / input.length);

      if (rms > this.VAD_THRESHOLD) {
        this._holdCounter = this.VAD_HOLD_FRAMES;
        if (!this._vadActive) {
          this._vadActive = true;
          // 🔥 Barge-in trigger: fires when user starts speaking
          this.onVoiceStart?.();
        }
      } else if (this._holdCounter > 0) {
        this._holdCounter--;
      } else {
        this._vadActive = false;
      }

      // ── PCM-16 encoding → base64 ──
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-32767, Math.min(32767, input[i] * 32767));
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      onData(b64);
    };
  }

  // Adjust VAD sensitivity at runtime if needed
  setVADThreshold(threshold: number) {
    this.VAD_THRESHOLD = threshold;
  }

  stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.ctx?.close().catch(() => {});
    this.stream?.getTracks().forEach(t => t.stop());
    this.processor = null;
    this.source = null;
    this.ctx = null;
    this.stream = null;
    this._vadActive = false;
    this._holdCounter = 0;
  }
}
