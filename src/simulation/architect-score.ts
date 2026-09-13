/**
 * Composite architect score (iteration 3, GAME14).
 *
 * Missions, contracts, codex discoveries, and live dynamical stability
 * fold into a single 0–100 readout with a named band — the long-session
 * answer to "how am I doing as an architect?" Every input is already
 * measured elsewhere; this module only weighs them honestly.
 */

export interface ArchitectScoreInput {
  missionsDone: number;
  missionsTotal: number;
  contractsDone: number;
  contractsTotal: number;
  codexKinds: number;
  codexSightings: number;
  /** Live dynamical stability, 0..100. */
  stabilityScore: number;
}

export interface ArchitectScoreBreakdown {
  missions: number;
  contracts: number;
  discovery: number;
  stability: number;
}

export interface ArchitectScore {
  score: number;
  band: string;
  breakdown: ArchitectScoreBreakdown;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function bandForScore(score: number): string {
  if (score >= 90) return 'Grand Architect';
  if (score >= 70) return 'Master Architect';
  if (score >= 45) return 'Journeyman Architect';
  return 'Nascent Architect';
}

export function computeArchitectScore(input: ArchitectScoreInput): ArchitectScore {
  const missionFrac = input.missionsTotal > 0 ? input.missionsDone / input.missionsTotal : 0;
  const contractFrac = input.contractsTotal > 0 ? input.contractsDone / input.contractsTotal : 0;
  const discoveryFrac = clamp01(input.codexKinds / 6) * 0.6 + clamp01(input.codexSightings / 25) * 0.4;
  const stabilityFrac = clamp01(input.stabilityScore / 100);
  const breakdown: ArchitectScoreBreakdown = {
    missions: Math.round(40 * clamp01(missionFrac)),
    contracts: Math.round(25 * clamp01(contractFrac)),
    discovery: Math.round(20 * discoveryFrac),
    stability: Math.round(15 * stabilityFrac),
  };
  const score = breakdown.missions + breakdown.contracts + breakdown.discovery + breakdown.stability;
  return { score, band: bandForScore(score), breakdown };
}
