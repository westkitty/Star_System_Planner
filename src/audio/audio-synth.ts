/**
 * Web Audio Local Synthesizer for Tactile System Audio.
 * 
 * Invariants:
 * - OFF by default. Does not autoplay before user interaction.
 * - Generates all sound effects dynamically via native Web Audio API oscillators and gain nodes.
 * - No external sound assets or bandwidth required.
 */

export class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceNodes: OscillatorNode[] = [];
  private ambienceFilter: BiquadFilterNode | null = null;
  public isEnabled: boolean = false;
  private volume = 0.8;
  private lastMicroMs = 0;

  /** Live master volume 0..1 (UI15 settings). */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  private output(): AudioNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(ctx.destination);
    }
    return this.masterGain;
  }

  private getContext(): AudioContext | null {
    if (!this.isEnabled) return null;
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.getContext();
      this.playTick();
      this.startAmbience();
    } else {
      this.stopAmbience();
    }
    return this.isEnabled;
  }

  /**
   * Generative ambient drone (ASSET06): a detuned low triad through a
   * wandering lowpass — the sound of deep time. Intensity follows the
   * time acceleration via setAmbienceIntensity.
   */
  public startAmbience(): void {
    const ctx = this.getContext();
    if (!ctx || this.ambienceNodes.length > 0) return;
    const out = this.output();
    if (!out) return;
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0;
    this.ambienceGain.gain.setTargetAtTime(0.05, ctx.currentTime, 2.5);
    this.ambienceFilter = ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.value = 320;
    this.ambienceFilter.Q.value = 0.8;
    this.ambienceGain.connect(this.ambienceFilter);
    this.ambienceFilter.connect(out);
    for (const [freq, detune] of [[55, 0], [82.4, 4], [110, -5], [164.8, 7]] as Array<[number, number]>) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(this.ambienceGain);
      osc.start();
      this.ambienceNodes.push(osc);
    }
    // Slow filter wander via LFO.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambienceFilter.frequency);
    lfo.start();
    this.ambienceNodes.push(lfo);
  }

  public stopAmbience(): void {
    if (!this.ctx || this.ambienceNodes.length === 0) return;
    const t = this.ctx.currentTime;
    this.ambienceGain?.gain.setTargetAtTime(0, t, 0.4);
    const nodes = this.ambienceNodes;
    this.ambienceNodes = [];
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
        n.disconnect();
      }
    }, 1500);
    this.ambienceGain = null;
    this.ambienceFilter = null;
  }

  /** Brighten and lift the drone as time acceleration climbs (0..1). */
  public setAmbienceIntensity(intensity01: number): void {
    if (!this.ctx || !this.ambienceGain || !this.ambienceFilter) return;
    const k = Math.max(0, Math.min(1, intensity01));
    const t = this.ctx.currentTime;
    this.ambienceGain.gain.setTargetAtTime(0.04 + k * 0.05, t, 0.8);
    this.ambienceFilter.frequency.setTargetAtTime(320 + k * 900, t, 0.8);
  }

  /** Rate-limit micro feedback so slider drags don't machine-gun. */
  private microReady(minGapMs = 90): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastMicroMs < minGapMs) return false;
    this.lastMicroMs = now;
    return true;
  }

  private blip(freq: number, durSec: number, gainValue: number, type: OscillatorType = 'sine'): void {
    const ctx = this.getContext();
    if (!ctx || !this.microReady()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durSec);
    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + durSec + 0.02);
  }

  /** UI micro-sound set (ASSET07): modality-aware tactile feedback. */
  public playModalOpen(): void {
    this.blip(520, 0.09, 0.06, 'triangle');
  }

  public playModalClose(): void {
    const ctx = this.getContext();
    if (!ctx || !this.microReady()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.055, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  public playToggle(on: boolean): void {
    this.blip(on ? 660 : 440, 0.07, 0.05, 'square');
  }

  public playSliderTick(): void {
    this.blip(880, 0.03, 0.025);
  }

  public playAssistChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const out = this.output();
    if (!out) return;
    [660, 880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t0 = ctx.currentTime + i * 0.09;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }

  public playTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.02);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);

    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  }

  public playOrbitLock(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    // Harmonic dual triad (440Hz and 660Hz)
    const freqs = [523.25, 659.25, 783.99]; // C-major chord chime
    const now = ctx.currentTime;

    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);

      gain.gain.setValueAtTime(0.05, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 + i * 0.04);

      osc.connect(gain);
      const out = this.output();
    if (out) gain.connect(out);

      osc.start(now + i * 0.04);
      osc.stop(now + 0.4 + i * 0.04);
    }
  }

  public playResonance(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4 warm bell
    osc.frequency.exponentialRampToValueAtTime(329.63, ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }

  public playCollisionWarning(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(65, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  public playStarCollapse(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    // Deep sub-bass descending drone with sudden cutoff
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 1.2);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.0, ctx.currentTime + 1.2); // Sudden void cutoff

    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);

    osc.start();
    osc.stop(ctx.currentTime + 1.25);
  }

  /** Bright ascending chime for branch forks and challenge completion. */
  public playSuccess(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const freqs = [659.25, 830.61, 987.77, 1318.5];
    const now = ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.0001, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.09, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
      osc.connect(gain);
      const out = this.output();
      if (out) gain.connect(out);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.4);
    }
  }

  /** Low percussive thump for collision mergers. */
  public playCollisionThump(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  }

  /** Urgent dual-pulse siren for imminent forecast impacts. */
  public playImpactSiren(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.22;
      osc.type = 'square';
      osc.frequency.setValueAtTime(620, t0);
      osc.frequency.linearRampToValueAtTime(880, t0 + 0.16);
      gain.gain.setValueAtTime(0.045, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain);
      const out = this.output();
      if (out) gain.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }

  /** Soft confirmation blip for selections and toggles. */
  public playSelect(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain);
    const out = this.output();
    if (out) gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  /** Hushed eclipse chord: low veil plus a high shimmer (iteration 3, ASSET14). */
  public playEclipseHush(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const out = this.output();
    if (!out) return;
    const now = ctx.currentTime;
    const parts: Array<{ freq: number; dur: number; gain: number; type: OscillatorType }> = [
      { freq: 196, dur: 0.9, gain: 0.06, type: 'sine' },
      { freq: 1470, dur: 0.5, gain: 0.02, type: 'triangle' },
    ];
    for (const part of parts) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = part.type;
      osc.frequency.setValueAtTime(part.freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(part.gain, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + part.dur);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + part.dur + 0.05);
    }
  }

  /** Warm rising chord for gravitational captures (iteration 3, ASSET14). */
  public playCaptureChord(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const out = this.output();
    if (!out) return;
    const freqs = [392, 523.25, 659.25];
    const now = ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.0001, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.07, now + i * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.5);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.55);
    }
  }

  /** Contract fanfare: a longer, brighter success arc (iteration 3, ASSET14). */
  public playContractFanfare(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const out = this.output();
    if (!out) return;
    const freqs = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const now = ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.0001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.4);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.45);
    }
  }

  /** Warm preset/postcard shimmer retained for the forensic modal flow. */
  public playPresetShimmer(): void {
    const ctx = this.getContext();
    const out = this.output();
    if (!ctx || !out) return;
    [196, 246.94, 293.66, 392].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.06;
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency * (index % 2 ? 1.003 : 1);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
      oscillator.connect(gain);
      gain.connect(out);
      oscillator.start(start);
      oscillator.stop(start + 1.5);
    });
  }
}

export const audioSynth = new AudioSynthesizer();
