/**
 * Newtonian Gravitational Potential Grid Visualization.
 * 
 * Displays Newtonian gravitational potential wells and saddles across the system's
 * primary orbital plane without falsely claiming to simulate general relativity.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

export class GravityGridRenderer {
  private mesh: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin | null = null;

  private readonly gridSize = 1000.0; // In Three.js units
  private readonly divisions = 60;
  private initialPositions: Float32Array;

  constructor(scaleTransform: ScaleTransform) {
    this.scaleTransform = scaleTransform;

    const lineCount = (this.divisions + 1) * 2;
    const vertexCount = lineCount * (this.divisions + 1);
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);

    const step = this.gridSize / this.divisions;
    const half = this.gridSize / 2.0;

    let idx = 0;
    const baseColor = new THREE.Color('#0a2a44');

    // Horizontal lines along X
    for (let i = 0; i <= this.divisions; i++) {
      const z = -half + i * step;
      for (let j = 0; j < this.divisions; j++) {
        const x1 = -half + j * step;
        const x2 = -half + (j + 1) * step;

        positions[idx * 3] = x1;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = z;

        positions[idx * 3 + 3] = x2;
        positions[idx * 3 + 4] = 0;
        positions[idx * 3 + 5] = z;

        for (let k = 0; k < 2; k++) {
          colors[(idx + k) * 3] = baseColor.r;
          colors[(idx + k) * 3 + 1] = baseColor.g;
          colors[(idx + k) * 3 + 2] = baseColor.b;
        }

        idx += 2;
      }
    }

    // Vertical lines along Z
    for (let i = 0; i <= this.divisions; i++) {
      const x = -half + i * step;
      for (let j = 0; j < this.divisions; j++) {
        const z1 = -half + j * step;
        const z2 = -half + (j + 1) * step;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = z1;

        positions[idx * 3 + 3] = x;
        positions[idx * 3 + 4] = 0;
        positions[idx * 3 + 5] = z2;

        for (let k = 0; k < 2; k++) {
          colors[(idx + k) * 3] = baseColor.r;
          colors[(idx + k) * 3 + 1] = baseColor.g;
          colors[(idx + k) * 3 + 2] = baseColor.b;
        }

        idx += 2;
      }
    }

    this.initialPositions = new Float32Array(positions);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.LineSegments(this.geometry, material);
    this.mesh.visible = false;
  }

  public getMesh(): THREE.LineSegments {
    return this.mesh;
  }

  /** Attach the scene floating origin so potential wells stay aligned under focus camera. */
  public setFloatingOrigin(origin: FloatingOrigin): void {
    this.floatingOrigin = origin;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /**
   * Deform grid based on sum of Newtonian gravitational potential Phi = - sum(G * M / r).
   */
  public update(bodies: CelestialBody[]): void {
    if (!this.mesh.visible) return;

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const nVertices = posArr.length / 3;
    const majorBodies = bodies.filter(b => b.massKg > 1e22); // Filter out tiny probes

    const azureWell = new THREE.Color('#0cc6ff');
    const baseGrid = new THREE.Color('#07131e');

    // Precalculate display positions and potential factors for bodies
    const bodyProps = majorBodies.map(b => {
      const rel = this.floatingOrigin ? this.floatingOrigin.toRelative(b.position) : b.position;
      const disp = this.scaleTransform.getDisplayPosition(rel);
      // Normalized potential depth factor
      const depthFactor = Math.log10(b.massKg) * 0.8;
      return { x: disp.x, z: disp.z, factor: depthFactor };
    });

    for (let i = 0; i < nVertices; i++) {
      const origX = this.initialPositions[i * 3];
      const origZ = this.initialPositions[i * 3 + 2];

      let depth = 0;
      for (const bp of bodyProps) {
        const dx = origX - bp.x;
        const dz = origZ - bp.z;
        const distSq = dx * dx + dz * dz + 400.0; // Softening
        depth += (bp.factor * 120.0) / Math.sqrt(distSq);
      }

      // Clamp max well depth
      const yDep = -Math.min(45.0, depth);
      posArr[i * 3 + 1] = yDep;

      // Color intensity proportional to depth
      const t = Math.min(1.0, Math.abs(yDep) / 30.0);
      colArr[i * 3] = baseGrid.r * (1 - t) + azureWell.r * t;
      colArr[i * 3 + 1] = baseGrid.g * (1 - t) + azureWell.g * t;
      colArr[i * 3 + 2] = baseGrid.b * (1 - t) + azureWell.b * t;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
