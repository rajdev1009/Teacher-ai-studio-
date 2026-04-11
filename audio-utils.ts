// ─── Audio Streamer (plays AI voice output) ─────────────────────────────────
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;

  constructor(private sampleRate = 24000) {}

  private init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  async resume() {
    this.init();
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
  }

  async play(base64Data: string) {
    await this.resume();
    if (!this.audioContext) return;

    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;

    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioContext.destination);

    const start = Math.max(this.nextStartTime, this.audioContext.currentTime);
    src.start(start);
    this.nextStartTime = start + buffer.duration;
  }

  stop() {
    this.audioContext?.close();
    this.audioContext = null;
    this.nextStartTime = 0;
  }
}

// ─── Audio Recorder (captures mic input) ────────────────────────────────────
export class AudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private sampleRate = 16000) {}

  async start(onData: (b64: string) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext({ sampleRate: this.sampleRate });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(2048, 1, 1); // smaller buffer = faster

    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      onData(b64);
    };
  }

  stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.ctx?.close();
    this.stream?.getTracks().forEach(t => t.stop());
    this.processor = null;
    this.source = null;
    this.ctx = null;
    this.stream = null;
  }
}
