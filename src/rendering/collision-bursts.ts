/**
 * Collision-burst particle VFX pool (ASSET10).
 *
 * GPU-light THREE.Points bursts spawned at merger sites: flash core,
 * expanding debris shell, and slow ember drift with per-particle life.
 * The pool caps concurrent bursts so cataclysm chains never tank the GPU.
 */

import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  active: boolean;
}

const MAX_BURSTS = 12;
const PARTICLES_PER_BURST = 220;

export class CollisionBurstPool {
  private group: THREE.Group;
  private bursts: Burst[] = [];
  private cursor = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CollisionBurstPool';
    for (let i = 0; i < MAX_BURSTS; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(PARTICLES_PER_BURST * 3);
      const colors = new Float32Array(PARTICLES_PER_BURST * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 2.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const points = new THREE.Points(geometry, material);
      points.visible = false;
      points.frustumCulled = false;
      this.group.add(points);
      this.bursts.push({
        points,
        velocities: new Float32Array(PARTICLES_PER_BURST * 3),
        life: 0,
        maxLife: 2.4,
        active: false,
      });
    }
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  /** Ignite a burst at a display-space position with a tint. */
  public spawn(displayPos: THREE.Vector3, tintHex = '#ffb35c', energy = 1): void {
    const burst = this.bursts[this.cursor];
    this.cursor = (this.cursor + 1) % this.bursts.length;

    const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = burst.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const tint = new THREE.Color(tintHex);
    const white = new THREE.Color('#ffffff');

    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      positions.setXYZ(i, displayPos.x, displayPos.y, displayPos.z);
      // Random shell direction with outward bias.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = (6 + Math.random() * 26) * energy;
      burst.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      burst.velocities[i * 3 + 1] = Math.cos(phi) * speed * 0.7;
      burst.velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      const c = white.clone().lerp(tint, 0.35 + Math.random() * 0.65);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    burst.life = burst.maxLife;
    burst.active = true;
    burst.points.visible = true;
    (burst.points.material as THREE.PointsMaterial).opacity = 0.95;
  }

  public update(deltaSec: number): void {
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.life -= deltaSec;
      if (burst.life <= 0) {
        burst.active = false;
        burst.points.visible = false;
        continue;
      }
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const drag = Math.max(0, 1 - deltaSec * 0.9);
      for (let i = 0; i < PARTICLES_PER_BURST; i++) {
        burst.velocities[i * 3] *= drag;
        burst.velocities[i * 3 + 1] *= drag;
        burst.velocities[i * 3 + 2] *= drag;
        positions.setXYZ(
          i,
          positions.getX(i) + burst.velocities[i * 3] * deltaSec,
          positions.getY(i) + burst.velocities[i * 3 + 1] * deltaSec,
          positions.getZ(i) + burst.velocities[i * 3 + 2] * deltaSec
        );
      }
      positions.needsUpdate = true;
      const fade = burst.life / burst.maxLife;
      (burst.points.material as THREE.PointsMaterial).opacity = 0.95 * fade;
    }
  }

  public dispose(): void {
    for (const burst of this.bursts) {
      burst.points.geometry.dispose();
      (burst.points.material as THREE.Material).dispose();
    }
    this.bursts = [];
  }
}
