/**
 * Osculating orbit-line ribbons (ASSET09).
 *
 * Thin Keplerian ellipse loops for bound bodies — the "map view" of the
 * system — distinct from the worker's forward-integrated forecast
 * trajectories. Rebuilt on demand (not per frame) from live elements.
 */

import * as THREE from 'three';
import { CelestialBody, OsculatingElements, Vector3D } from '../simulation/types';
import { disposalRegistry } from './disposal';

export const ORBIT_LINE_SEGMENTS = 128;

function ellipsePoint(
  elements: OsculatingElements,
  center: Vector3D,
  eccentricAnomaly: number
): Vector3D {
  // Solve in the orbital plane, then rotate by argument of periapsis
  // approximation. For near-circular orbits this is exact; eccentric
  // orbits get a faithful-enough ellipse oriented by the line of apsides.
  const a = elements.semiMajorAxisKm;
  const e = Math.min(0.95, Math.max(0, elements.eccentricity));
  const b = a * Math.sqrt(Math.max(0.0001, 1 - e * e));
  const x = a * (Math.cos(eccentricAnomaly) - e);
  const z = b * Math.sin(eccentricAnomaly);
  const inc = (elements.inclinationDeg * Math.PI) / 180;
  const y = -z * Math.sin(inc);
  const zp = z * Math.cos(inc);
  return { x: center.x + x, y: center.y + y, z: center.z + zp };
}

export class OrbitLineRenderer {
  public readonly group = new THREE.Group();
  private lines = new Map<string, THREE.LineLoop>();

  constructor() {
    this.group.name = 'orbit-lines';
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public isVisible(): boolean {
    return this.group.visible;
  }

  /**
   * Rebuild loops for bound orbiters. `toScene` maps sim-km to scene
   * units (scale transform + floating origin handled by the caller).
   */
  public rebuild(
    entries: Array<{ body: CelestialBody; primary: CelestialBody; elements: OsculatingElements }>,
    toScene: (simKm: Vector3D) => THREE.Vector3,
    selectedBodyId: string | null
  ): void {
    const live = new Set<string>();
    for (const { body, primary, elements } of entries) {
      if (!elements.isBound || !(elements.semiMajorAxisKm > 0)) continue;
      live.add(body.id);
      const positions = new Float32Array(ORBIT_LINE_SEGMENTS * 3);
      for (let i = 0; i < ORBIT_LINE_SEGMENTS; i++) {
        const p = ellipsePoint(elements, primary.position, (i / ORBIT_LINE_SEGMENTS) * Math.PI * 2);
        const v = toScene(p);
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
      }
      let line = this.lines.get(body.id);
      if (!line) {
        const geo = new THREE.BufferGeometry();
        disposalRegistry.track(geo, 'orbit-line-geometry');
        const mat = new THREE.LineBasicMaterial({
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
        disposalRegistry.track(mat, 'orbit-line-material');
        line = new THREE.LineLoop(geo, mat);
        line.name = `orbit-${body.id}`;
        line.frustumCulled = false;
        this.lines.set(body.id, line);
        this.group.add(line);
      }
      line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      line.geometry.attributes.position.needsUpdate = true;
      const mat = line.material as THREE.LineBasicMaterial;
      const selected = body.id === selectedBodyId;
      mat.color.set(selected ? '#ffd166' : '#3d7ea6');
      mat.opacity = selected ? 0.8 : 0.32;
    }
    for (const [id, line] of [...this.lines]) {
      if (!live.has(id)) {
        this.group.remove(line);
        disposalRegistry.release(line.geometry);
        disposalRegistry.release(line.material as THREE.Material);
        this.lines.delete(id);
      }
    }
  }

  public clear(): void {
    for (const line of this.lines.values()) {
      this.group.remove(line);
      disposalRegistry.release(line.geometry);
      disposalRegistry.release(line.material as THREE.Material);
    }
    this.lines.clear();
  }

  public dispose(): void {
    this.clear();
  }
}
