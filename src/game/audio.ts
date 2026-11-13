/**
 * 引擎声：低频轰鸣 + 高频涡流 + 气流噪声。
 * 不用锯齿波——那是摩托车的来源。
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rumble: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private whine: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private airGain: GainNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.started = true;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    /* 低频轰鸣：两个略微失谐的正弦，叠加出「有重量」的底噪 */
    this.rumble = this.ctx.createOscillator();
    this.rumble.type = 'sine';
    this.rumble.frequency.value = 34;

    const rumble2 = this.ctx.createOscillator();
    rumble2.type = 'sine';
    rumble2.frequency.value = 51.5;

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0.001;

    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 160;
    rumbleFilter.Q.value = 0.6;

    this.rumble.connect(this.rumbleGain);
    rumble2.connect(this.rumbleGain);
    this.rumbleGain.connect(rumbleFilter).connect(this.master);

    /* 高频涡流：三角波 + 轻微颤音，像涡轮而不是引擎 */
    this.whine = this.ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = 220;

    const vibrato = this.ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 5.2;
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.value = 3.5;
    vibrato.connect(vibratoGain).connect(this.whine.frequency);

    this.whineGain = this.ctx.createGain();
    this.whineGain.gain.value = 0.0008;

    const whineFilter = this.ctx.createBiquadFilter();
    whineFilter.type = 'bandpass';
    whineFilter.frequency.value = 900;
    whineFilter.Q.value = 2.4;

    this.whine.connect(this.whineGain).connect(whineFilter).connect(this.master);

    /* 气流：带通噪声，速度越快越明显 */
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.45;

    const air = this.ctx.createBufferSource();
    air.buffer = buffer;
    air.loop = true;

    this.airGain = this.ctx.createGain();
    this.airGain.gain.value = 0.0004;

    this.airFilter = this.ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.frequency.value = 1200;
    this.airFilter.Q.value = 0.8;

    air.connect(this.airFilter).connect(this.airGain).connect(this.master);

    this.rumble.start();
    rumble2.start();
    this.whine.start();
    vibrato.start();
    air.start();
  }

  update(speed: number, throttle: number, boost: number): void {
    if (!this.ctx || !this.master || !this.rumble || !this.whine || !this.airGain || !this.airFilter) return;
    const t = this.ctx.currentTime;
    const load = Math.min(1, speed / 1800);
    const target = Math.max(throttle * 0.55, load);

    this.master.gain.setTargetAtTime(0.05 + target * 0.13 + boost * 0.05, t, 0.35);
    this.rumble.frequency.setTargetAtTime(30 + target * 16 + boost * 12, t, 0.4);
    this.whine.frequency.setTargetAtTime(180 + target * 420 + boost * 260, t, 0.35);
    this.whineGain?.gain.setTargetAtTime(0.0006 + target * 0.0032 + boost * 0.002, t, 0.4);
    this.airFilter.frequency.setTargetAtTime(700 + target * 1800, t, 0.5);
    this.airGain.gain.setTargetAtTime(0.0004 + target * 0.0034 + boost * 0.002, t, 0.4);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
