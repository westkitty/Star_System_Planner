/**
 * AUDIBLE ORRERY — Orbital Sonification Engine.
 *
 * Maps the physical architecture of the system into an evolving harmonic field:
 *
 *   - Each orbiting body drives one muted drone voice.
 *   - Voice pitch follows orbital mean motion: fast inner worlds sing high,
 *     slow outer giants hum in the depths (log-mapped, 5-octave span).
 *   - Voice gain follows body radius (giants carry more weight than stations).
 *   - The luminous star breathes a warm sub-bass root via a slow LFO.
 *   - Collisions and Roche fragmentations strike a filtered percussive thump.
 *   - Time-warp sweeps shift a master filter cutoff so acceleration is *heard*.
 *
 * Fully synthesized via Web Audio oscillators — zero audio assets, honors the
 * offline-first invariant. Off by default; tuned to stay around -30 dBFS.
 */

import { CelestialBody } from '../simulation/types';
import { findDominantPrimary, calculateOsculatingElements } from '../simulation/orbital-mechanics';

const MAX_VOICES = 7;
const BASE_GAIN = 0.028;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  bodyId: string;
}

export class AudibleOrrery {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private voices: Map<string, Voice> = new Map();
  private rootOsc: OscillatorNode | null = null;
  private rootLfo: OscillatorNode | null = null;
  private rootGain: GainNode | null = null;
  public enabled: boolean = false;

  private ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 1200;
      this.masterFilter.Q.value = 0.4;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      this.masterFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.4);
    if (!on) {
      // Fade out then silence voices on the next sync
      window.setTimeout(() => {
        if (!this.enabled) this.silenceAll();
      }, 800);
    }
  }

  private silenceAll(): void {
    for (const [, v] of this.voices) {
      try {
        v.osc.stop();
      } catch { /* already stopped */ }
      v.osc.disconnect();
      v.gain.disconnect();
    }
    this.voices.clear();
    if (this.rootOsc) {
      try {
        this.rootOsc.stop();
        this.rootLfo?.stop();
      } catch { /* ignore */ }
      this.rootOsc.disconnect();
      this.rootLfo?.disconnect();
      this.rootGain?.disconnect();
      this.rootOsc = null;
      this.rootLfo = null;
      this.rootGain = null;
    }
  }

  /**
   * Map mean motion (rad/s) to a musical frequency: claw-hammer log curve,
   * n = 2π/T. Earth's n ≈ 2e-7 rad/s -> ~110 Hz (A2). Octave per decade.
   */
  private pitchFromMeanMotion(n: number): number {
    if (n <= 0) return 55;
    const decades = Math.log10(n) + 7; // Earth-like period -> ~0
    return 110 * Math.pow(2, Math.max(-2, Math.min(3, decades)));
  }

  /** Sync voices with the current system state (call ~2 Hz). */
  public sync(bodies: CelestialBody[], timeScale: number): void {
    if (!this.enabled || !this.masterFilter) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterFilter || !this.masterGain) return;
    const t = ctx.currentTime;

    // Master filter follows time-warp: faster time -> brighter field
    const brightness = Math.min(1, Math.log10(Math.max(1, timeScale)) / 5);
    this.masterFilter.frequency.setTargetAtTime(600 + brightness * 2600, t, 0.4);

    // --- Star root breath ---
    const star = bodies.find(b => b.type === 'star');
    if (star && !this.rootOsc) {
      this.rootOsc = ctx.createOscillator();
      this.rootOsc.type = 'sine';
      this.rootOsc.frequency.value = 44; // deep root
      this.rootLfo = ctx.createOscillator();
      this.rootLfo.type = 'sine';
      this.rootLfo.frequency.value = 0.083; // ~12 s breath
      this.rootGain = ctx.createGain();
      this.rootGain.gain.value = BASE_GAIN * 1.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = BASE_GAIN * 0.7;
      this.rootLfo.connect(lfoGain);
      lfoGain.connect(this.rootGain.gain);
      this.rootOsc.connect(this.rootGain);
      this.rootGain.connect(this.masterFilter);
      this.rootOsc.start();
      this.rootLfo.start();
    } else if (!star && this.rootOsc) {
      this.silenceAll();
    }

    // --- Planet voices ---
    const orbiters = bodies
      .filter(b => b.type === 'planet' || b.type === 'moon' || b.type === 'dwarf_planet')
      .map(b => {
        const primary = findDominantPrimary(b, bodies);
        if (!primary) return null;
        const el = calculateOsculatingElements(b, primary);
        return { body: b, n: el.isBound ? el.meanMotionRadSec : 0 };
      })
      .filter((x): x is { body: CelestialBody; n: number } => !!x && x.n > 0)
      .sort((a, b) => b.body.radiusKm - a.body.radiusKm)
      .slice(0, MAX_VOICES);

    const activeIds = new Set(orbiters.map(o => o.body.id));
    for (const [id, v] of this.voices) {
      if (!activeIds.has(id)) {
        try {
          v.gain.gain.setTargetAtTime(0, t, 0.4);
          v.osc.stop(t + 1.5);
        } catch { /* ignore */ }
        v.gain.disconnect();
        this.voices.delete(id);
      }
    }

    for (const { body, n } of orbiters) {
      const freq = this.pitchFromMeanMotion(n);
      // Gain carries planetary weight class, quietly
      const weight = Math.min(1, Math.max(0.25, Math.log10(body.radiusKm) - 2.6));
      const targetGain = BASE_GAIN * weight;
      let voice = this.voices.get(body.id);
      if (!voice) {
        const osc = ctx.createOscillator();
        osc.type = body.type === 'moon' ? 'triangle' : 'sine';
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.masterFilter!);
        osc.start();
        voice = { osc, gain, bodyId: body.id };
        this.voices.set(body.id, voice);
      }
      // Exponential approach avoids pitch zipper
      voice.osc.frequency.setTargetAtTime(freq, t, 0.6);
      voice.gain.gain.setTargetAtTime(targetGain, t, 0.8);
    }
  }

  /** Percussive impact: filtered noise thump. */
  public strike(strength: number = 0.5): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterFilter) return;

    const dur = 0.24;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const thumpFilter = ctx.createBiquadFilter();
    thumpFilter.type = 'lowpass';
    thumpFilter.frequency.value = 320 + strength * 900;

    const g = ctx.createGain();
    g.gain.value = 0.1 + strength * 0.2;

    src.connect(thumpFilter);
    thumpFilter.connect(g);
    g.connect(this.masterFilter);
    src.start();
  }

  public dispose(): void {
    this.silenceAll();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const audibleOrrery = new AudibleOrrery();
