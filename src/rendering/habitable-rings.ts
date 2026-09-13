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
  private edgeMap = new Map<string, THREE.LineLoop[]>();

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
        (userData as { edges?: boolean }).edges = false;
      }
      const bodyPos = this.scaleTransform.getDisplayPosition({
        x: body.position.x,
        y: body.position.y,
        z: body.position.z,
      });
      mesh.position.set(bodyPos.x, 0.5, bodyPos.z);
      this.syncEdges(body.id, innerDisp, outerDisp, bodyPos, userData as { inner?: number; outer?: number; edges?: boolean });
    }
    for (const [id, mesh] of [...this.ringMap]) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.ringMap.delete(id);
        const edges = this.edgeMap.get(id);
        if (edges) {
          for (const loop of edges) {
            this.group.remove(loop);
            loop.geometry.dispose();
            (loop.material as THREE.Material).dispose();
          }
          this.edgeMap.delete(id);
        }
      }
    }
  }

  /** Crisp inner/outer boundary loops (iteration 3, ASSET11). */
  private syncEdges(
    bodyId: string,
    innerDisp: number,
    outerDisp: number,
    center: { x: number; y: number; z: number },
    userData: { inner?: number; outer?: number; edges?: boolean }
  ): void {
    let edges = this.edgeMap.get(bodyId);
    if (!edges) {
      edges = [];
      const defs: Array<{ color: string; opacity: number }> = [
        { color: '#fbbf24', opacity: 0.55 },
        { color: '#34d399', opacity: 0.55 },
      ];
      for (const def of defs) {
        const mat = new THREE.LineBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: def.opacity,
          depthWrite: false,
        });
        const loop = new THREE.LineLoop(new THREE.BufferGeometry(), mat);
        loop.frustumCulled = false;
        edges.push(loop);
        this.group.add(loop);
      }
      this.edgeMap.set(bodyId, edges);
    }
    if (!userData.edges) {
      const radii = [Math.max(0.5, innerDisp), Math.max(1, outerDisp)];
      edges.forEach((loop, i) => {
        loop.geometry.dispose();
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= 96; s++) {
          const a = (s / 96) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]));
        }
        loop.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        loop.position.set(center.x, 0.5, center.z);
      });
      userData.edges = true;
    } else {
      for (const loop of edges) loop.position.set(center.x, 0.5, center.z);
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
    for (const edges of this.edgeMap.values()) {
      for (const loop of edges) {
        loop.geometry.dispose();
        (loop.material as THREE.Material).dispose();
      }
    }
    this.edgeMap.clear();
  }
}
