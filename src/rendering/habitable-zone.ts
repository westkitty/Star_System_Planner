/**
 * Habitable Zone Band Renderer.
 *
 * Visualizes the conservative liquid-water annulus (from calculateHabitableZone)
 * as two translucent green bands around every luminous star. When a star is
 * collapsed (luminosity zero), its band disappears with it — an honest dead zone.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { calculateHabitableZone } from '../simulation/thermal';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

const BAND_SEGMENTS = 128;

export class HabitableZoneRenderer {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;
  private bands: Map<string, THREE.Mesh> = new Map();
  public enabled: boolean = false;

  constructor(scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin) {
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;
    this.group = new THREE.Group();
    this.group.name = 'HabitableZoneGroup';
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  private lastMorphT: number = -1;

  public update(bodies: CelestialBody[]): void {
    const stars = bodies.filter(b => b.type === 'star');
    const aliveStarIds = new Set(stars.map(s => s.id));

    // Rebuild band geometry when the readable/true morph drifts materially
    const morphT = this.scaleTransform.morphT;
    if (Math.abs(morphT - this.lastMorphT) > 0.03) {
      this.lastMorphT = morphT;
      this.invalidate();
    }

    for (const [id, mesh] of this.bands) {
      if (!aliveStarIds.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.bands.delete(id);
      }
    }

    if (!this.enabled) {
      for (const [, mesh] of this.bands) mesh.visible = false;
      return;
    }

    for (const star of stars) {
      const zone = calculateHabitableZone(star);
      if (!zone) {
        const existing = this.bands.get(star.id);
        if (existing) existing.visible = false;
        continue;
      }

      // Skip producing geometry per frame: reconstruct only if band missing,
      // else re-center & rely on display pipeline proportionality.
      let mesh = this.bands.get(star.id);
      if (!mesh) {
        const innerDisp = this.displayRadius(star, zone.innerRadiusKm);
        const outerDisp = this.displayRadius(star, zone.outerRadiusKm);
        if (innerDisp <= 0 || outerDisp <= innerDisp) continue;
        const geo = new THREE.RingGeometry(innerDisp, outerDisp, BAND_SEGMENTS);
        const mat = new THREE.MeshBasicMaterial({
          color: '#34d399',
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        this.group.add(mesh);
        this.bands.set(star.id, mesh);
      }

      const primDisp = this.scaleTransform.getDisplayPosition(this.floatingOrigin.toRelative(star.position));
      mesh.position.set(primDisp.x, primDisp.y - 0.5, primDisp.z);
      mesh.visible = true;
    }
  }

  /** Convert a km radius around the star into display units via edge sampling. */
  private displayRadius(star: CelestialBody, radiusKm: number): number {
    const centerKm = star.position;
    const centerDisp = this.scaleTransform.getDisplayPosition(this.floatingOrigin.toRelative(centerKm));
    const edgeDisp = this.scaleTransform.getDisplayPosition(
      this.floatingOrigin.toRelative({ x: centerKm.x + radiusKm, y: centerKm.y, z: centerKm.z })
    );
    return Math.abs(edgeDisp.x - centerDisp.x);
  }

  /** Rebuild band geometry (scale transform structural change, e.g. true/readable switch). */
  public invalidate(): void {
    for (const [id, mesh] of this.bands) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.bands.delete(id);
    }
  }

  public dispose(): void {
    this.invalidate();
  }
}
