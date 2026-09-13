/**
 * Habitable-zone annulus renderer (ASSET11).
 *
 * A soft emerald band around each luminous star marking the liquid-water
 * zone computed by the thermal model — the planner's most pedagogically
 * valuable overlay for system architects.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { calculateHabitableZone } from '../simulation/thermal';

export class HabitableZoneRenderer {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private ringMap = new Map<string, THREE.Mesh>();

  constructor(scaleTransform: ScaleTransform) {
    this.scaleTransform = scaleTransform;
    this.group = new THREE.Group();
    this.group.name = 'HabitableZoneGroup';
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public isVisible(): boolean {
    return this.group.visible;
  }

  /** Rebuild rings for luminous stars; call after body sync. */
  public update(bodies: CelestialBody[]): void {
    const seen = new Set<string>();
    for (const body of bodies) {
      if (body.type !== 'star' || !body.luminosityW || body.luminosityW <= 0) continue;
      const hz = calculateHabitableZone(body);
      if (!hz) continue;
      seen.add(body.id);

      const innerDisp = this.radiusToDisplay(hz.innerRadiusKm);
      const outerDisp = this.radiusToDisplay(hz.outerRadiusKm);
      if (!Number.isFinite(innerDisp) || !Number.isFinite(outerDisp) || outerDisp <= innerDisp) continue;

      let mesh = this.ringMap.get(body.id);
      if (!mesh) {
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#34d399'),
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.name = `hz-${body.id}`;
        this.ringMap.set(body.id, mesh);
        this.group.add(mesh);
      }
      // Rebuild annulus geometry only when radii drift materially.
      const userData = mesh.userData as { inner?: number; outer?: number };
      if (Math.abs((userData.inner ?? -1) - innerDisp) > 0.5 || Math.abs((userData.outer ?? -1) - outerDisp) > 0.5) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.RingGeometry(Math.max(0.5, innerDisp), Math.max(1, outerDisp), 96);
        userData.inner = innerDisp;
        userData.outer = outerDisp;
      }
      const bodyPos = this.scaleTransform.getDisplayPosition({
        x: body.position.x,
        y: body.position.y,
        z: body.position.z,
      });
      mesh.position.set(bodyPos.x, 0.5, bodyPos.z);
    }
    for (const [id, mesh] of [...this.ringMap]) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.ringMap.delete(id);
      }
    }
  }

  private radiusToDisplay(radiusKm: number): number {
    // Sample the scale transform along +X to honor readable compression.
    const p = this.scaleTransform.getDisplayPosition({ x: radiusKm, y: 0, z: 0 });
    const o = this.scaleTransform.getDisplayPosition({ x: 0, y: 0, z: 0 });
    return Math.hypot(p.x - o.x, p.z - o.z);
  }

  public dispose(): void {
    for (const mesh of this.ringMap.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.ringMap.clear();
  }
}
