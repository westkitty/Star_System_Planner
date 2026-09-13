/**
 * Eclipse shadow cones (ASSET10).
 *
 * Short-lived volumetric shadow shafts cast from the star past an
 * occluder toward the eclipsed viewer whenever the syzygy detector fires.
 * Cones fade over their TTL so the sky never clutters in resonant systems.
 */

import * as THREE from 'three';
import { disposalRegistry } from './disposal';

interface ActiveCone {
  mesh: THREE.Mesh;
  ageSec: number;
  ttlSec: number;
}

export class EclipseConeRenderer {
  public readonly group = new THREE.Group();
  private cones: ActiveCone[] = [];

  constructor() {
    this.group.name = 'eclipse-cones';
  }

  /** Spawn a shadow shaft from the occluder toward the viewer. */
  public spawn(
    occluderScene: THREE.Vector3,
    viewerScene: THREE.Vector3,
    startRadiusScene: number,
    ttlSec = 25
  ): void {
    if (this.cones.length >= 6) {
      const dropped = this.cones.shift();
      if (dropped) this.remove(dropped);
    }
    const dir = viewerScene.clone().sub(occluderScene);
    const len = Math.max(0.001, dir.length());
    dir.normalize();
    const geo = new THREE.CylinderGeometry(
      startRadiusScene * 1.4,
      startRadiusScene * 0.55,
      len,
      20,
      1,
      true
    );
    disposalRegistry.track(geo, 'eclipse-geometry');
    const mat = new THREE.MeshBasicMaterial({
      color: '#01020a',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    disposalRegistry.track(mat, 'eclipse-material');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(occluderScene).addScaledVector(dir, len / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    mesh.renderOrder = 5;
    this.group.add(mesh);
    this.cones.push({ mesh, ageSec: 0, ttlSec });
  }

  public update(deltaSec: number): void {
    for (const cone of [...this.cones]) {
      cone.ageSec += deltaSec;
      const t = cone.ageSec / cone.ttlSec;
      if (t >= 1) {
        this.remove(cone);
        this.cones.splice(this.cones.indexOf(cone), 1);
        continue;
      }
      const mat = cone.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.42 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
  }

  private remove(cone: ActiveCone): void {
    this.group.remove(cone.mesh);
    disposalRegistry.release(cone.mesh.geometry);
    disposalRegistry.release(cone.mesh.material as THREE.Material);
  }

  public dispose(): void {
    for (const cone of this.cones) this.remove(cone);
    this.cones = [];
  }
}
