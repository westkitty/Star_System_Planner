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
  public isEnabled: boolean = false;

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
    }
    return this.isEnabled;
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
    gain.connect(ctx.destination);

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
      gain.connect(ctx.destination);

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
    gain.connect(ctx.destination);

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
    gain.connect(ctx.destination);

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
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 1.25);
  }
}

export const audioSynth = new AudioSynthesizer();
