/** 程序化引擎声：两个低频振荡器 + 滤波噪声，音量跟着速度走。 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private noiseGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.started = true;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 420;
    this.filter.Q.value = 1.2;
    this.filter.connect(this.master);

    this.oscA = this.ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscA.frequency.value = 42;
    const gainA = this.ctx.createGain();
    gainA.gain.value = 0.16;
    this.oscA.connect(gainA).connect(this.filter);

    this.oscB = this.ctx.createOscillator();
    this.oscB.type = 'sine';
    this.oscB.frequency.value = 63;
    const gainB = this.ctx.createGain();
    gainB.gain.value = 0.22;
    this.oscB.connect(gainB).connect(this.filter);

    // 噪声：用 2 秒的白噪声循环
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.05;
    noise.connect(this.noiseGain).connect(this.filter);

    this.oscA.start();
    this.oscB.start();
    noise.start();
  }

  update(speed: number, throttle: number, boost: number): void {
    if (!this.ctx || !this.master || !this.oscA || !this.oscB || !this.filter || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    const load = Math.min(1, speed / 1400);

    this.master.gain.setTargetAtTime(0.018 + load * 0.05 + boost * 0.03, t, 0.25);
    this.oscA.frequency.setTargetAtTime(38 + load * 46 + boost * 22, t, 0.2);
    this.oscB.frequency.setTargetAtTime(61 + load * 38 + boost * 18, t, 0.2);
    this.filter.frequency.setTargetAtTime(320 + load * 1100 + throttle * 260, t, 0.3);
    this.noiseGain.gain.setTargetAtTime(0.02 + load * 0.07 + boost * 0.04, t, 0.3);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
