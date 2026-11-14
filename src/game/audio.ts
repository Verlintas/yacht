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

    /* 噪声源 */
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
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

  /** 爆炸：宽带噪声 + 低频冲击 */
  explosion(power = 1): void {
    if (!this.ctx || !this.master) {
      this.start();
      if (!this.ctx || !this.master) return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const duration = 1.5;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.84 + white * 0.16;
      const env = Math.pow(1 - i / data.length, 2.4);
      data[i] = last * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 1.1);
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1.2, 0.9 * power);
    src.connect(lp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + duration);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(64, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 0.7);
    const og = ctx.createGain();
    og.gain.setValueAtTime(Math.min(0.7, 0.5 * power), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 1);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
