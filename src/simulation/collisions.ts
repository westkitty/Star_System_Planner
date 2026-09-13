/**
 * Collision detection and momentum-conserving merge resolution.
 */

import { CelestialBody, ConsequenceEvent, Vector3D } from './types';
import { createId } from '../core/id';

export interface CollisionEventDetail {
  timestampSec: number;
  survivorId: string;
  absorbedId: string;
  position: Vector3D;
  relativeSpeedKmS: number;
  /** Larger mass / smaller mass at impact (iteration 3, GAME05). */
  massRatio: number;
  /** Reduced-mass kinetic energy dissipated, joules. */
  energyJoules: number;
  event: ConsequenceEvent;
}

/** Human-scale impact energy for ledger forensics. */
export function formatImpactEnergy(joules: number): string {
  if (!Number.isFinite(joules) || joules < 0) return 'unknown energy';
  if (joules >= 1e30) return `${(joules / 1e30).toFixed(2)} \u00d710\u00b3\u2070 J`;
  if (joules >= 1e24) return `${(joules / 1e24).toFixed(2)} \u00d710\u00b2\u2074 J`;
  if (joules >= 1e18) return `${(joules / 1e18).toFixed(2)} EJ`;
  if (joules >= 1e12) return `${(joules / 1e12).toFixed(2)} TJ`;
  return `${joules.toExponential(2)} J`;
}

/** 1/2 \u00b7 reduced-mass \u00b7 v\u00b2 for a perfectly inelastic merger. */
export function impactEnergyJoules(massAKg: number, massBKg: number, relSpeedKmS: number): number {
  if (!(massAKg > 0) || !(massBKg > 0) || !(relSpeedKmS >= 0)) return 0;
  const reduced = (massAKg * massBKg) / (massAKg + massBKg);
  const v = relSpeedKmS * 1000;
  return 0.5 * reduced * v * v;
}

export interface CollisionDebrisParticle {
  id: string;
  position: Vector3D;
  velocity: Vector3D;
  color: string;
  lifetimeRemainingSec: number;
  initialLifetimeSec: number;
  sizeKm: number;
}

/**
 * Check and resolve physical collisions between celestial bodies.
 * Mutates `bodies` array in-place by absorbing smaller bodies into larger ones,
 * conserving total linear momentum.
 */
export function resolveCollisions(
  bodies: CelestialBody[],
  timestampSec: number,
  debrisSink?: CollisionDebrisParticle[]
): CollisionEventDetail[] {
  const collisions: CollisionEventDetail[] = [];
  const deadIds = new Set<string>();

  for (let i = 0; i < bodies.length; i++) {
    const bi = bodies[i];
    if (deadIds.has(bi.id)) continue;

    for (let j = i + 1; j < bodies.length; j++) {
      const bj = bodies[j];
      if (deadIds.has(bj.id)) continue;

      const dx = bj.position.x - bi.position.x;
      const dy = bj.position.y - bi.position.y;
      const dz = bj.position.z - bi.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Collision threshold is sum of physical radii
      const threshold = bi.radiusKm + bj.radiusKm;

      if (dist <= threshold) {
        // Relative velocity
        const rvx = bj.velocity.x - bi.velocity.x;
        const rvy = bj.velocity.y - bi.velocity.y;
        const rvz = bj.velocity.z - bi.velocity.z;
        const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);

        // Determine dominant body (by mass or fixed status)
        let survivor: CelestialBody;
        let absorbed: CelestialBody;

        if (bi.fixed && !bj.fixed) {
          survivor = bi;
          absorbed = bj;
        } else if (bj.fixed && !bi.fixed) {
          survivor = bj;
          absorbed = bi;
        } else if (bi.massKg >= bj.massKg) {
          survivor = bi;
          absorbed = bj;
        } else {
          survivor = bj;
          absorbed = bi;
        }

        deadIds.add(absorbed.id);

        // Perfectly inelastic collision: Conserve linear momentum
        // m_new = m1 + m2
        // v_new = (m1*v1 + m2*v2) / m_new
        const totalMass = survivor.massKg + absorbed.massKg;
        if (!survivor.fixed && totalMass > 0) {
          survivor.velocity.x = (survivor.massKg * survivor.velocity.x + absorbed.massKg * absorbed.velocity.x) / totalMass;
          survivor.velocity.y = (survivor.massKg * survivor.velocity.y + absorbed.massKg * absorbed.velocity.y) / totalMass;
          survivor.velocity.z = (survivor.massKg * survivor.velocity.z + absorbed.massKg * absorbed.velocity.z) / totalMass;
        }
        survivor.massKg = totalMass;

        // Combined radius based on volume conservation: V_new = V1 + V2
        // r_new = (r1^3 + r2^3)^(1/3)
        survivor.radiusKm = Math.cbrt(survivor.radiusKm ** 3 + absorbed.radiusKm ** 3);

        // Generate debris particles if sink provided
        if (debrisSink) {
          const particleCount = Math.min(24, Math.max(8, Math.round(relSpeed * 0.5)));
          for (let p = 0; p < particleCount; p++) {
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = (Math.random() - 0.5) * Math.PI;
            const ejectSpeed = (Math.random() * 0.5 + 0.2) * relSpeed + 5;
            debrisSink.push({
              id: createId('debris'),
              position: {
                x: survivor.position.x + (Math.random() - 0.5) * survivor.radiusKm,
                y: survivor.position.y + (Math.random() - 0.5) * survivor.radiusKm,
                z: survivor.position.z + (Math.random() - 0.5) * survivor.radiusKm,
              },
              velocity: {
                x: survivor.velocity.x + Math.cos(angle1) * Math.cos(angle2) * ejectSpeed,
                y: survivor.velocity.y + Math.sin(angle2) * ejectSpeed,
                z: survivor.velocity.z + Math.sin(angle1) * Math.cos(angle2) * ejectSpeed,
              },
              color: absorbed.color || '#ff8844',
              lifetimeRemainingSec: 15.0,
              initialLifetimeSec: 15.0,
              sizeKm: Math.max(10, survivor.radiusKm * 0.05),
            });
          }
        }

        const massRatio = Math.max(survivor.massKg, absorbed.massKg) / Math.max(1e-9, Math.min(survivor.massKg, absorbed.massKg));
        const energyJoules = impactEnergyJoules(survivor.massKg, absorbed.massKg, relSpeed);
        const event: ConsequenceEvent = {
          id: `col-${timestampSec}-${survivor.id}-${absorbed.id}`,
          timestampSec,
          type: 'collision',
          title: `Collision: ${absorbed.name} collided with ${survivor.name}`,
          description:
            `${absorbed.name} merged into ${survivor.name} at ${relSpeed.toFixed(1)} km/s impact speed. ` +
            `Total mass is now ${survivor.massKg.toExponential(2)} kg; mass ratio ${massRatio.toFixed(1)}:1; ` +
            `impact energy ${formatImpactEnergy(energyJoules)}.`,
          bodyIds: [survivor.id, absorbed.id],
          severity: 'catastrophe',
        };

        collisions.push({
          timestampSec,
          survivorId: survivor.id,
          absorbedId: absorbed.id,
          position: { ...survivor.position },
          relativeSpeedKmS: relSpeed,
          massRatio,
          energyJoules,
          event,
        });
      }
    }
  }

  // Remove dead bodies
  if (deadIds.size > 0) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      if (deadIds.has(bodies[i].id)) {
        bodies.splice(i, 1);
      }
    }
  }

  return collisions;
}

export interface ManualMergeResult {
  survivor: CelestialBody;
  absorbedId: string;
  relativeSpeedKmS: number;
  massRatio: number;
  energyJoules: number;
  event: ConsequenceEvent;
}

/**
 * Forecast-driven manual merge (GAME10): inelastically fuse two bodies on
 * demand — the same momentum/volume-conserving math as physical
 * collisions, invoked from the forecast banner instead of contact.
 */
export function mergeBodiesInelastic(
  bodyA: CelestialBody,
  bodyB: CelestialBody,
  timestampSec: number
): ManualMergeResult {
  const survivor = bodyA.massKg >= bodyB.massKg ? bodyA : bodyB;
  const absorbed = survivor === bodyA ? bodyB : bodyA;
  const rvx = absorbed.velocity.x - survivor.velocity.x;
  const rvy = absorbed.velocity.y - survivor.velocity.y;
  const rvz = absorbed.velocity.z - survivor.velocity.z;
  const relSpeed = Math.hypot(rvx, rvy, rvz);

  const totalMass = survivor.massKg + absorbed.massKg;
  if (!survivor.fixed && totalMass > 0) {
    survivor.velocity = {
      x: (survivor.massKg * survivor.velocity.x + absorbed.massKg * absorbed.velocity.x) / totalMass,
      y: (survivor.massKg * survivor.velocity.y + absorbed.massKg * absorbed.velocity.y) / totalMass,
      z: (survivor.massKg * survivor.velocity.z + absorbed.massKg * absorbed.velocity.z) / totalMass,
    };
    survivor.position = {
      x: (survivor.massKg * survivor.position.x + absorbed.massKg * absorbed.position.x) / totalMass,
      y: (survivor.massKg * survivor.position.y + absorbed.massKg * absorbed.position.y) / totalMass,
      z: (survivor.massKg * survivor.position.z + absorbed.massKg * absorbed.position.z) / totalMass,
    };
  }
  survivor.massKg = totalMass;
  survivor.radiusKm = Math.cbrt(survivor.radiusKm ** 3 + absorbed.radiusKm ** 3);

  const massRatio = Math.max(survivor.massKg, absorbed.massKg) / Math.max(1e-9, Math.min(survivor.massKg, absorbed.massKg));
  const energyJoules = impactEnergyJoules(survivor.massKg, absorbed.massKg, relSpeed);
  const event: ConsequenceEvent = {
    id: createId('merge'),
    timestampSec,
    type: 'collision',
    title: `Commanded merger: ${survivor.name} + ${absorbed.name}`,
    description:
      `The architect fused ${absorbed.name} into ${survivor.name} ahead of the forecast impact. ` +
      `Merged mass ${totalMass.toExponential(2)} kg; closing speed was ${relSpeed.toFixed(2)} km/s; ` +
      `mass ratio ${massRatio.toFixed(1)}:1; impact energy ${formatImpactEnergy(energyJoules)}.`,
    bodyIds: [survivor.id, absorbed.id],
    severity: 'caution',
  };
  return { survivor, absorbedId: absorbed.id, relativeSpeedKmS: relSpeed, massRatio, energyJoules, event };
}
