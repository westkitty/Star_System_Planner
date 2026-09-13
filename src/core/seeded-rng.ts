/**
 * Deterministic seeded pseudo-random number generator (BACK10).
 *
 * Mulberry32-based PRNG with helper distributions. Adopted by the
 * background starfield, procedural system generator, and sigil renderer so
 * identical seeds always reproduce identical universes.
 */

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Next unsigned 32-bit integer. */
  public nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Next float in [0, 1). */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Float in [min, max). */
  public range(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }

  /** Integer in [min, max] inclusive. */
  public intRange(min: number, max: number): number {
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  /** Pick a random element. */
  public pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.nextFloat() * items.length)];
  }

  /** Deterministic hash of a string to a 32-bit seed. */
  public static hashString(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Fork an independent child stream. */
  public fork(salt: string): SeededRng {
    return new SeededRng((this.nextUint32() ^ SeededRng.hashString(salt)) >>> 0);
  }
}
