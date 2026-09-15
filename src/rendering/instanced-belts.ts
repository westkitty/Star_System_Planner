/**
 * Instanced Asteroid Belt Renderer.
 *
 * Renders thousands of orbiting asteroid rocks using a single Three.js InstancedMesh
 * draw call. Particles evolve on precomputed Keplerian ellipses around the belt's
 * primary and are driven by *simulation* seconds (not wall-clock frames).
 */

import * as THREE from 'three';
import { AsteroidBelt, Vector3D } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';
import { G_KM } from '../simulation/units';

export class InstancedBeltRenderer {
  private mesh: THREE.InstancedMesh;
  private beltData: AsteroidBelt;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;
  private dummy = new THREE.Object3D();

  // Orbital parameters per particle
  private semiMajorAxes: Float32Array;
  private eccentricities: Float32Array;
  private inclinations: Float32Array;
  private meanAnomalies: Float32Array;
  private meanMotionsRadSec: Float64Array;
  private baseScales: Float32Array;

  constructor(belt: AsteroidBelt, scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin, primaryMassKg: number) {
    this.beltData = belt;
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;

    const count = Math.max(16, Math.min(4000, belt.particleCount));
    this.semiMajorAxes = new Float32Array(count);
    this.eccentricities = new Float32Array(count);
    this.inclinations = new Float32Array(count);
    this.meanAnomalies = new Float32Array(count);
    this.meanMotionsRadSec = new Float64Array(count);
    this.baseScales = new Float32Array(count);

    // Low-poly polyhedron for asteroid rock geometry
    const geometry = new THREE.DodecahedronGeometry(0.3, 0);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(belt.color || '#7e7e88'),
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.initParticles(primaryMassKg);
  }

  public getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  public get particleCount(): number {
    return this.mesh.count;
  }

  private initParticles(primaryMassKg: number): void {
    const count = this.mesh.count;
    // Deterministic PRNG based on belt seed
    let s = this.beltData.seed || 12345;
    function rand(): number {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    }

    const rMin = this.beltData.innerRadiusKm;
    const rMax = this.beltData.outerRadiusKm;
    const mu = G_KM * Math.max(1e18, primaryMassKg);

    for (let i = 0; i < count; i++) {
      // Semi-major axis distributed across belt radius
      const a = rMin + (rMax - rMin) * (rand() * 0.8 + rand() * 0.2);
      this.semiMajorAxes[i] = a;

      // Mild eccentricities (0.01 to 0.08)
      this.eccentricities[i] = rand() * 0.07 + 0.01;

      // Small inclinations (-3 to +3 degrees)
      this.inclinations[i] = ((rand() - 0.5) * 6.0 * Math.PI) / 180.0;

      // Random starting mean anomaly
      this.meanAnomalies[i] = rand() * Math.PI * 2;

      // Keplerian mean motion n = sqrt(mu / a^3)
      this.meanMotionsRadSec[i] = Math.sqrt(mu / (a * a * a));

      // Random rock scale
      this.baseScales[i] = rand() * 0.8 + 0.4;
    }
  }

  /**
   * Advance all particles by simDeltaSec simulation seconds around the primary's
   * current absolute position.
   */
  public update(simDeltaSec: number, primaryPosKm: Vector3D): void {
    const count = this.mesh.count;

    for (let i = 0; i < count; i++) {
      // Advance mean anomaly Keplerian-fashion
      this.meanAnomalies[i] += this.meanMotionsRadSec[i] * simDeltaSec;

      const a = this.semiMajorAxes[i];
      const e = this.eccentricities[i];
      const M = this.meanAnomalies[i] % (Math.PI * 2);

      // Approximate true anomaly
      const nu = M + 2 * e * Math.sin(M);
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

      // 3D coordinates in km relative to the primary
      const xKm = r * Math.cos(nu);
      const zKm = r * Math.sin(nu);
      const yKm = zKm * Math.sin(this.inclinations[i]);

      // Absolute km -> origin-relative -> display units (matches body pipeline)
      const relKm = this.floatingOrigin.toRelative({
        x: primaryPosKm.x + xKm,
        y: primaryPosKm.y + yKm,
        z: primaryPosKm.z + zKm,
      });
      const disp = this.scaleTransform.getDisplayPosition(relKm);

      this.dummy.position.set(disp.x, disp.y, disp.z);
      const readableBoost = this.scaleTransform.morphT > 0.5 ? 1.5 : 0.9;
      const scale = this.baseScales[i] * readableBoost;
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.rotation.set(M * 2.0, M * 3.0, M);

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(m => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
    this.mesh.dispose();
  }
}
