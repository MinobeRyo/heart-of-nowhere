export class CityAudio {
  constructor() { this.context = null; this.enabled = false; }
  async setEnabled(enabled) {
    if (enabled && !this.context) this.create();
    if (enabled && this.context.state === 'suspended') await this.context.resume();
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? .25 : 0, this.context.currentTime, .5);
  }
  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // Quiet rain, distant electrical hum, and a slow minor chord; no audio files.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const rain = ctx.createBufferSource(); rain.buffer = buffer; rain.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1500;
    const rainGain = ctx.createGain(); rainGain.gain.value = .21;
    rain.connect(filter).connect(rainGain).connect(this.master); rain.start();
    for (const [i, freq] of [55, 82.4069, 110, 130.8128].entries()) {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const gain = ctx.createGain(); gain.gain.value = .025;
      const lfo = ctx.createOscillator(); lfo.frequency.value = .05 + i * .017;
      const modulation = ctx.createGain(); modulation.gain.value = .015;
      lfo.connect(modulation).connect(gain.gain); lfo.start();
      osc.connect(gain).connect(this.master); osc.start();
    }
  }
  chime() {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    for (const [i, frequency] of [440, 659.255, 880].entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const t = ctx.currentTime + i * .17; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.16, t + .025); gain.gain.exponentialRampToValueAtTime(.001, t + 2.4);
      osc.connect(gain).connect(this.master); osc.start(t); osc.stop(t + 2.5);
    }
  }
}
