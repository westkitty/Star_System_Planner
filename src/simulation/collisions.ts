/**
 * Collision detection and momentum-conserving merge resolution.
 */

import { CelestialBody, ConsequenceEvent, Vector3D } from './types';

export interface CollisionEventDetail {
  timestampSec: number;
  survivorId: string;
  absorbedId: string;
  position: Vector3D;
  relativeSpeedKmS: number;
  event: ConsequenceEvent;
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
      const distSq = dx * dx + dy * dy + dz * dz;

      // Collision threshold is sum of physical radii (squared-space gate avoids sqrt)
      const threshold = bi.radiusKm + bj.radiusKm;

      if (distSq <= threshold * threshold) {
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
              id: `debris-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

        const event: ConsequenceEvent = {
          id: `col-${timestampSec}-${survivor.id}-${absorbed.id}`,
          timestampSec,
          type: 'collision',
          title: `Collision: ${absorbed.name} collided with ${survivor.name}`,
          description: `${absorbed.name} merged into ${survivor.name} at ${relSpeed.toFixed(1)} km/s impact speed. Total mass is now ${survivor.massKg.toExponential(2)} kg.`,
          bodyIds: [survivor.id, absorbed.id],
          severity: 'catastrophe',
        };

        collisions.push({
          timestampSec,
          survivorId: survivor.id,
          absorbedId: absorbed.id,
          position: { ...survivor.position },
          relativeSpeedKmS: relSpeed,
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
