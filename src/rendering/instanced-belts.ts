/**
 * Instanced Asteroid Belt Renderer.
 * 
 * Renders thousands of orbiting asteroid rocks using a single Three.js InstancedMesh draw call.
 */

import * as THREE from 'three';
import { AsteroidBelt } from '../simulation/types';
import { ScaleTransform } from './scale-transform';

export class InstancedBeltRenderer {
  private mesh: THREE.InstancedMesh;
  private beltData: AsteroidBelt;
  private scaleTransform: ScaleTransform;
  private dummy = new THREE.Object3D();

  // Orbital parameters per particle
  private semiMajorAxes: Float32Array;
  private eccentricities: Float32Array;
  private inclinations: Float32Array;
  private meanAnomalies: Float32Array;
  private orbitalSpeeds: Float32Array;
  private baseScales: Float32Array;

  constructor(belt: AsteroidBelt, scaleTransform: ScaleTransform) {
    this.beltData = belt;
    this.scaleTransform = scaleTransform;

    const count = belt.particleCount;
    this.semiMajorAxes = new Float32Array(count);
    this.eccentricities = new Float32Array(count);
    this.inclinations = new Float32Array(count);
    this.meanAnomalies = new Float32Array(count);
    this.orbitalSpeeds = new Float32Array(count);
    this.baseScales = new Float32Array(count);

    // Low-poly icosahedron for asteroid rock geometry
    const geometry = new THREE.DodecahedronGeometry(0.35, 0);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(belt.color || '#7e7e88'),
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.initParticles();
  }

  public getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  private initParticles(): void {
    const count = this.beltData.particleCount;
    // Simple deterministic PRNG based on seed
    let s = this.beltData.seed || 12345;
    function rand(): number {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    }

    const rMin = this.beltData.innerRadiusKm;
    const rMax = this.beltData.outerRadiusKm;

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

      // Orbital speed ~ 1 / sqrt(a)
      this.orbitalSpeeds[i] = 0.02 * Math.sqrt(rMin / a);

      // Random rock scale
      this.baseScales[i] = rand() * 0.8 + 0.4;
    }
  }

  public update(simDeltaSec: number): void {
    const count = this.beltData.particleCount;

    for (let i = 0; i < count; i++) {
      // Advance orbit
      this.meanAnomalies[i] += this.orbitalSpeeds[i] * simDeltaSec * 0.0001;

      const a = this.semiMajorAxes[i];
      const e = this.eccentricities[i];
      const M = this.meanAnomalies[i];

      // Approximate true anomaly
      const nu = M + 2 * e * Math.sin(M);
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

      // 3D coordinates in km
      const xKm = r * Math.cos(nu);
      const zKm = r * Math.sin(nu);
      const yKm = zKm * Math.sin(this.inclinations[i]);

      // Convert to display units
      const disp = this.scaleTransform.getDisplayPosition({ x: xKm, y: yKm, z: zKm });

      this.dummy.position.set(disp.x, disp.y, disp.z);
      const scale = this.baseScales[i] * (this.scaleTransform.morphT > 0.5 ? 1.4 : 0.8);
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
  }
}
