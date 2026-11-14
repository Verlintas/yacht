import type { WeaponType } from './ships';

/**
 * 引擎声：火箭爆轰 + 低频轰鸣。
 *
 * 关键不是加音量，而是「有纹理」：
 *  - 宽带噪声过低通 → 喷射底噪
 *  - 24Hz 幅度调制 → 爆轰的「突突」感，避免听起来像无人机
 *  - 高通噪声层 → 火焰尖啸
 *  - 两个略微失谐的正弦 → 低频重量
 *  - 软削波 → 增加粗糙度
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private rumbleA: OscillatorNode | null = null;
  private rumbleB: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private sfx: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.started = true;

    this.ctx = new AudioCtx();
    const ctx = this.ctx;

    // 总线 + 压缩，防止叠太多层爆音
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;

    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.82;
    const sfxComp = ctx.createDynamicsCompressor();
    sfxComp.threshold.value = -13;
    sfxComp.knee.value = 18;
    sfxComp.ratio.value = 9;
    sfxComp.attack.value = 0.002;
    sfxComp.release.value = 0.22;
    this.sfx.connect(sfxComp).connect(ctx.destination);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.4, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    this.sfx.connect(reverb).connect(wet).connect(sfxComp);

    /* 噪声源 */
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    this.noiseBuffer = buf;
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28; // 轻微低通，听起来更「厚」
      data[i] = last;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    /* 喷射底噪：低通 + 幅度调制 */
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 520;
    this.lowpass.Q.value = 0.9;

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.12;

    noise.connect(this.lowpass).connect(this.noiseGain).connect(this.master);

    // 24Hz 的爆轰脉动
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 23;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.075;
    lfo.connect(lfoDepth).connect(this.noiseGain.gain);
    lfo.start();

    /* 火焰尖啸：另一份噪声走高通 */
    const hiss = ctx.createBufferSource();
    hiss.buffer = buf;
    hiss.loop = true;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'bandpass';
    highpass.frequency.value = 1800;
    highpass.Q.value = 0.7;

    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.02;

    hiss.connect(highpass).connect(this.hissGain).connect(this.master);
    hiss.start();

    /* 低频重量：两个失谐正弦 */
    this.rumbleA = ctx.createOscillator();
    this.rumbleA.type = 'sine';
    this.rumbleA.frequency.value = 31;

    this.rumbleB = ctx.createOscillator();
    this.rumbleB.type = 'sine';
    this.rumbleB.frequency.value = 46.5;

    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.28;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 180;

    this.rumbleA.connect(this.rumbleGain);
    this.rumbleB.connect(this.rumbleGain);
    this.rumbleGain.connect(rumbleFilter).connect(this.master);

    this.rumbleA.start();
    this.rumbleB.start();
    noise.start();
  }

  update(speed: number, throttle: number, boost: number): void {
    if (!this.ctx || !this.master || !this.noiseGain || !this.hissGain || !this.lowpass) return;
    if (!this.rumbleA || !this.rumbleB || !this.rumbleGain) return;

    const t = this.ctx.currentTime;
    const load = Math.min(1, speed / 2600);
    const power = Math.max(throttle, load * 0.85);

    // 整体响度：明显比之前大
    this.master.gain.setTargetAtTime(0.16 + power * 0.22 + boost * 0.16, t, 0.25);

    // 爆轰底噪
    this.noiseGain.gain.setTargetAtTime(0.09 + power * 0.16 + boost * 0.12, t, 0.3);
    this.lowpass.frequency.setTargetAtTime(380 + power * 900 + boost * 700, t, 0.35);

    // 尖啸
    this.hissGain.gain.setTargetAtTime(0.012 + power * 0.05 + boost * 0.05, t, 0.4);

    // 低频
    this.rumbleA.frequency.setTargetAtTime(29 + power * 9 + boost * 7, t, 0.5);
    this.rumbleB.frequency.setTargetAtTime(44 + power * 12 + boost * 9, t, 0.5);
    this.rumbleGain.gain.setTargetAtTime(0.2 + power * 0.16 + boost * 0.1, t, 0.4);
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const env = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * env * (channel === 0 ? 1 : 0.86);
      }
    }
    return buffer;
  }

  private ensureSfx(): boolean {
    if (!this.ctx || !this.sfx) this.start();
    return Boolean(this.ctx && this.sfx);
  }

  private noiseLayer(opts: {
    duration: number;
    filter: BiquadFilterType;
    freq: number;
    q?: number;
    gain: number;
    volume?: number;
    delay?: number;
    pan?: number;
    rate?: number;
    sweepTo?: number;
    attack?: number;
  }): void {
    if (!this.ctx || !this.sfx || !this.noiseBuffer) return;
    const volume = Math.max(0.04, Math.min(1.5, opts.volume ?? 1));
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = opts.rate ?? (0.92 + Math.random() * 0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.sweepTo), t + opts.duration);
    filter.Q.value = opts.q ?? 0.8;
    const gain = this.ctx.createGain();
    const peak = Math.max(0.0001, opts.gain * volume);
    const attack = Math.max(0.002, opts.attack ?? 0.005);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    src.connect(filter).connect(gain).connect(panner).connect(this.sfx);
    src.start(t, Math.random() * 1.5, opts.duration + 0.08);
  }

  private toneLayer(opts: {
    from: number;
    to: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    volume?: number;
    delay?: number;
    pan?: number;
    detune?: number;
  }): void {
    if (!this.ctx || !this.sfx) return;
    const volume = Math.max(0.04, Math.min(1.5, opts.volume ?? 1));
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, opts.from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.duration);
    osc.detune.value = opts.detune ?? 0;
    const gain = this.ctx.createGain();
    const peak = Math.max(0.0001, opts.gain * volume);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    osc.connect(gain).connect(panner).connect(this.sfx);
    osc.start(t);
    osc.stop(t + opts.duration + 0.05);
  }

  /** 开火音色：多层瞬态 + 机械/电磁/低频 + 空间尾音 */
  weapon(type: WeaponType, volume = 1, pan = 0): void {
    if (!this.ensureSfx()) return;
    const v = volume * (0.9 + Math.random() * 0.2);
    const p = Math.max(-1, Math.min(1, pan));
    switch (type) {
      case 'railgun':
        this.toneLayer({ from: 82, to: 26, duration: 0.75, gain: 0.5, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.55, filter: 'lowpass', freq: 820, sweepTo: 180, q: 0.9, gain: 0.32, volume: v, pan: p });
        this.noiseLayer({ duration: 0.09, filter: 'highpass', freq: 2600, q: 0.6, gain: 0.38, volume: v, pan: p, delay: 0.004 });
        this.toneLayer({ from: 460, to: 70, duration: 0.38, gain: 0.2, type: 'sawtooth', volume: v, pan: p, delay: 0.008 });
        this.toneLayer({ from: 1500, to: 280, duration: 0.18, gain: 0.1, type: 'triangle', volume: v, pan: p, delay: 0.02 });
        break;
      case 'cannon':
        this.toneLayer({ from: 125, to: 44, duration: 0.22, gain: 0.34, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.16, filter: 'lowpass', freq: 680, q: 0.8, gain: 0.3, volume: v, pan: p });
        this.noiseLayer({ duration: 0.04, filter: 'highpass', freq: 2400, q: 0.5, gain: 0.16, volume: v, pan: p, delay: 0.003 });
        this.toneLayer({ from: 70, to: 32, duration: 0.3, gain: 0.15, type: 'triangle', volume: v, pan: p, delay: 0.01 });
        break;
      case 'laser':
        this.toneLayer({ from: 2200, to: 520, duration: 0.085, gain: 0.16, type: 'square', volume: v, pan: p });
        this.noiseLayer({ duration: 0.07, filter: 'highpass', freq: 3400, q: 0.5, gain: 0.15, volume: v, pan: p });
        this.toneLayer({ from: 900, to: 260, duration: 0.14, gain: 0.1, type: 'triangle', volume: v, pan: p, delay: 0.01 });
        this.noiseLayer({ duration: 0.18, filter: 'bandpass', freq: 1800, q: 1.1, gain: 0.07, volume: v, pan: p, delay: 0.02 });
        break;
      case 'plasma':
        this.toneLayer({ from: 160, to: 520, duration: 0.3, gain: 0.2, type: 'sawtooth', volume: v, pan: p });
        this.noiseLayer({ duration: 0.28, filter: 'bandpass', freq: 900, q: 0.9, gain: 0.18, volume: v, pan: p });
        this.noiseLayer({ duration: 0.12, filter: 'highpass', freq: 2400, q: 0.7, gain: 0.09, volume: v, pan: p, delay: 0.03 });
        this.toneLayer({ from: 56, to: 30, duration: 0.32, gain: 0.22, type: 'sine', volume: v, pan: p });
        break;
      case 'torpedo':
        this.noiseLayer({ duration: 0.55, filter: 'bandpass', freq: 320, sweepTo: 900, q: 0.8, gain: 0.28, volume: v, pan: p });
        this.toneLayer({ from: 78, to: 36, duration: 0.42, gain: 0.28, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.7, filter: 'highpass', freq: 1800, q: 0.6, gain: 0.08, volume: v, pan: p, delay: 0.1 });
        this.noiseLayer({ duration: 0.05, filter: 'highpass', freq: 3000, q: 0.5, gain: 0.1, volume: v, pan: p });
        break;
      case 'ion':
        for (let i = 0; i < 3; i += 1) {
          this.noiseLayer({ duration: 0.035, filter: 'highpass', freq: 2800 + i * 300, q: 0.8, gain: 0.12, volume: v, pan: p, delay: i * 0.028 });
        }
        this.toneLayer({ from: 720, to: 1150, duration: 0.14, gain: 0.1, type: 'triangle', volume: v, pan: p });
        this.toneLayer({ from: 90, to: 55, duration: 0.16, gain: 0.1, type: 'sine', volume: v, pan: p });
        break;
    }
  }

  /** 命中音色：金属/护盾/结构声分层 */
  impact(type: WeaponType, volume = 1, pan = 0): void {
    if (!this.ensureSfx()) return;
    const v = volume * (0.9 + Math.random() * 0.2);
    const p = Math.max(-1, Math.min(1, pan));
    switch (type) {
      case 'railgun':
        this.toneLayer({ from: 55, to: 20, duration: 0.8, gain: 0.45, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.42, filter: 'lowpass', freq: 500, sweepTo: 120, q: 0.9, gain: 0.4, volume: v, pan: p });
        this.noiseLayer({ duration: 0.08, filter: 'highpass', freq: 1900, q: 0.6, gain: 0.28, volume: v, pan: p });
        this.toneLayer({ from: 260, to: 48, duration: 0.3, gain: 0.12, type: 'sawtooth', volume: v, pan: p, delay: 0.01 });
        this.noiseLayer({ duration: 0.5, filter: 'bandpass', freq: 900, q: 0.8, gain: 0.12, volume: v, pan: p, delay: 0.12 });
        break;
      case 'torpedo':
        this.toneLayer({ from: 58, to: 22, duration: 0.9, gain: 0.45, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.75, filter: 'lowpass', freq: 420, sweepTo: 110, q: 0.8, gain: 0.45, volume: v, pan: p });
        this.noiseLayer({ duration: 0.35, filter: 'bandpass', freq: 850, q: 0.9, gain: 0.18, volume: v, pan: p, delay: 0.08 });
        this.toneLayer({ from: 120, to: 38, duration: 0.3, gain: 0.12, type: 'triangle', volume: v, pan: p });
        break;
      case 'plasma':
        this.noiseLayer({ duration: 0.25, filter: 'bandpass', freq: 1000, q: 0.9, gain: 0.22, volume: v, pan: p });
        this.toneLayer({ from: 300, to: 90, duration: 0.2, gain: 0.16, type: 'triangle', volume: v, pan: p });
        this.noiseLayer({ duration: 0.12, filter: 'highpass', freq: 2600, q: 0.7, gain: 0.1, volume: v, pan: p, delay: 0.02 });
        break;
      case 'cannon':
        this.toneLayer({ from: 90, to: 34, duration: 0.25, gain: 0.3, type: 'sine', volume: v, pan: p });
        this.noiseLayer({ duration: 0.18, filter: 'lowpass', freq: 600, q: 0.8, gain: 0.28, volume: v, pan: p });
        this.noiseLayer({ duration: 0.04, filter: 'highpass', freq: 2400, q: 0.6, gain: 0.14, volume: v, pan: p });
        break;
      case 'laser':
        this.noiseLayer({ duration: 0.08, filter: 'highpass', freq: 3200, q: 0.7, gain: 0.14, volume: v, pan: p });
        this.toneLayer({ from: 800, to: 300, duration: 0.08, gain: 0.1, type: 'sawtooth', volume: v, pan: p });
        this.noiseLayer({ duration: 0.18, filter: 'bandpass', freq: 1400, q: 1.2, gain: 0.07, volume: v, pan: p, delay: 0.01 });
        break;
      case 'ion':
        this.noiseLayer({ duration: 0.12, filter: 'bandpass', freq: 2600, q: 1.2, gain: 0.16, volume: v, pan: p });
        this.toneLayer({ from: 1300, to: 400, duration: 0.1, gain: 0.1, type: 'triangle', volume: v, pan: p });
        this.noiseLayer({ duration: 0.05, filter: 'highpass', freq: 3500, q: 0.8, gain: 0.1, volume: v, pan: p, delay: 0.04 });
        break;
    }
  }

  /** 爆炸：每次都有不同的低频/噪声/碎片/金属声，避免所有爆炸一个味 */
  explosion(power = 1): void {
    if (!this.ensureSfx()) return;
    const v = Math.max(0.1, Math.min(1.3, power));
    const r = 0.82 + Math.random() * 0.36;
    const pan = (Math.random() - 0.5) * 0.35;
    this.toneLayer({
      from: 82 * r, to: 20 + Math.random() * 10, duration: 1.2 + Math.random() * 0.9,
      gain: 0.36 + Math.random() * 0.16, type: 'sine', volume: v, pan,
    });
    this.noiseLayer({
      duration: 1.3 + Math.random() * 0.8, filter: 'lowpass', freq: 1200 * r,
      sweepTo: 120 + Math.random() * 160, q: 0.65 + Math.random() * 0.3,
      gain: 0.38 + Math.random() * 0.16, volume: v, pan,
    });
    this.noiseLayer({
      duration: 0.08 + Math.random() * 0.1, filter: 'highpass', freq: 1600 + Math.random() * 1200,
      q: 0.5, gain: 0.12 + Math.random() * 0.1, volume: v, pan,
    });
    this.noiseLayer({
      duration: 0.8 + Math.random() * 0.7, filter: 'bandpass', freq: 620 + Math.random() * 500,
      q: 0.55, gain: 0.1 + Math.random() * 0.1, volume: v, pan, delay: 0.08 + Math.random() * 0.12,
    });
    // 金属结构被撕开的声音
    this.toneLayer({
      from: 110 + Math.random() * 60, to: 26 + Math.random() * 20,
      duration: 1.0 + Math.random() * 0.7, gain: 0.06 + Math.random() * 0.06,
      type: 'triangle', volume: v, pan, delay: 0.08,
    });
    // 燃料二次冲击
    if (Math.random() > 0.35) {
      this.toneLayer({
        from: 52, to: 18, duration: 0.9 + Math.random() * 0.5,
        gain: 0.12 + Math.random() * 0.12, type: 'sine', volume: v, pan, delay: 0.3 + Math.random() * 0.35,
      });
    }
    // 碎片/电缆噼啪
    const crackles = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < crackles; i += 1) {
      this.noiseLayer({
        duration: 0.025 + Math.random() * 0.05,
        filter: Math.random() > 0.5 ? 'highpass' : 'bandpass',
        freq: 1400 + Math.random() * 2600,
        q: 0.8 + Math.random() * 0.8,
        gain: 0.06 + Math.random() * 0.08,
        volume: v,
        pan,
        delay: 0.25 + Math.random() * 0.9,
      });
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
